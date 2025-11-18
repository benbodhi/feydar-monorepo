/**
 * External Price Data Service
 * Fetches price data from external APIs (Dexscreener, Codex, CoinGecko)
 * with fallback chain and caching
 */

interface ExternalPriceData {
  price: number | null;
  priceInFEY: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  txns24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buyVolume24h: number | null;
  sellVolume24h: number | null;
  buyers24h: number | null;
  sellers24h: number | null;
  makers24h: number | null;
}

interface CacheEntry {
  data: ExternalPriceData;
  timestamp: number;
}

const priceCache = new Map<string, CacheEntry>();

// Cache TTLs - increased to reduce API calls
const CACHE_TTL = {
  price: 2 * 60 * 1000,    // 2 minutes for price data (was 30s)
  volume: 10 * 60 * 1000,   // 10 minutes for volume/transaction data (was 5min)
};

// Rate limiting: track last request time per API
const lastRequestTime = {
  dexscreener: 0,
  codex: 0,
  coingecko: 0,
};

// Request queue to prevent 429 errors
interface QueuedRequest {
  api: 'dexscreener' | 'codex' | 'coingecko';
  tokenAddress: string;
  fetchFn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

const requestQueue: QueuedRequest[] = [];

let isProcessingQueue = false;
let lastDexscreenerRequest = 0;

// Minimum time between Dexscreener requests to avoid 429
const DEXSCREENER_MIN_INTERVAL = 200; // 200ms between requests (5 req/sec max)
const MAX_CONCURRENT_REQUESTS = 3; // Max 3 concurrent requests

let activeRequests = 0;

/**
 * Process request queue with rate limiting
 */
async function processRequestQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const request = requestQueue.shift();
    if (!request) break;

    activeRequests++;

    // For Dexscreener, enforce minimum interval
    if (request.api === 'dexscreener') {
      const now = Date.now();
      const timeSinceLastRequest = now - lastDexscreenerRequest;
      if (timeSinceLastRequest < DEXSCREENER_MIN_INTERVAL) {
        await new Promise(resolve => 
          setTimeout(resolve, DEXSCREENER_MIN_INTERVAL - timeSinceLastRequest)
        );
      }
      lastDexscreenerRequest = Date.now();
    }

    // Execute the request
    (async () => {
      try {
        const result = await request.fetchFn();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      } finally {
        activeRequests--;
        // Process next request after a small delay
        setTimeout(() => processRequestQueue(), 50);
      }
    })();
  }

  isProcessingQueue = false;
}

/**
 * Queue a request to prevent rate limiting
 */
async function queueRequest<T>(
  api: 'dexscreener' | 'codex' | 'coingecko',
  tokenAddress: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      api,
      tokenAddress,
      fetchFn,
      resolve,
      reject,
    });
    processRequestQueue();
  });
}

/**
 * Fetch price data from Dexscreener
 */
async function fetchFromDexscreener(tokenAddress: string, feyTokenAddress: string | null = null): Promise<ExternalPriceData | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (!response.ok) {
      console.warn(`[ExternalPrice] Dexscreener returned ${response.status} for ${tokenAddress}`);
      return null;
    }

    const data = await response.json() as {
      pairs?: Array<{
        liquidity?: { usd?: number | string };
        priceUsd?: string;
        priceNative?: string;
        priceChange?: {
          m5?: string;
          h1?: string;
          h6?: string;
          h24?: string;
        };
        marketCap?: string | number;
        volume?: {
          h24?: string | number;
          h24Buy?: string | number;
          h24Sell?: string | number;
        };
        txns?: {
          h24?: {
            buys?: number;
            sells?: number;
            total?: number;
            buyers?: number;
            sellers?: number;
            makers?: number;
          };
        };
        baseToken?: {
          address?: string;
          symbol?: string;
        };
        quoteToken?: {
          address?: string;
          symbol?: string;
        };
      }>;
    };

    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    // Find best pair by liquidity
    const bestPair = data.pairs.reduce((prev: any, current: any) => {
      const prevLiquidity = prev.liquidity?.usd || 0;
      const currentLiquidity = current.liquidity?.usd || 0;
      return currentLiquidity > prevLiquidity ? current : prev;
    });

    // Calculate priceInFEY from pairs if FEY token address is provided
    let priceInFEY: number | null = null;
    const feyAddr = feyTokenAddress || process.env.FEY_TOKEN_ADDRESS?.toLowerCase() || null;
    if (feyAddr && data.pairs && data.pairs.length > 0) {
      priceInFEY = findPriceInFEYFromPairs(data.pairs, tokenAddress, feyAddr);
      if (priceInFEY === null && process.env.NODE_ENV === 'development') {
        console.log(`[ExternalPrice] No FEY pair found in Dexscreener data for ${tokenAddress} (checked ${data.pairs.length} pairs)`);
      }
    } else if (!feyAddr) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[ExternalPrice] FEY_TOKEN_ADDRESS not set, cannot find FEY pair for ${tokenAddress}`);
      }
    }

    return {
      price: bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null,
      priceInFEY: priceInFEY,
      priceChange5m: bestPair.priceChange?.m5 ? parseFloat(bestPair.priceChange.m5) : null,
      priceChange1h: bestPair.priceChange?.h1 ? parseFloat(bestPair.priceChange.h1) : null,
      priceChange6h: bestPair.priceChange?.h6 ? parseFloat(bestPair.priceChange.h6) : null,
      priceChange24h: bestPair.priceChange?.h24 ? parseFloat(bestPair.priceChange.h24) : null,
      marketCap: bestPair.marketCap ? parseFloat(String(bestPair.marketCap)) : null,
      liquidity: bestPair.liquidity?.usd ? parseFloat(String(bestPair.liquidity.usd)) : null,
      volume24h: bestPair.volume?.h24 ? parseFloat(String(bestPair.volume.h24)) : null,
      txns24h: bestPair.txns?.h24?.buys && bestPair.txns?.h24?.sells
        ? (bestPair.txns.h24.buys + bestPair.txns.h24.sells)
        : bestPair.txns?.h24?.total || null,
      buys24h: bestPair.txns?.h24?.buys || null,
      sells24h: bestPair.txns?.h24?.sells || null,
      buyVolume24h: bestPair.volume?.h24Buy ? parseFloat(String(bestPair.volume.h24Buy)) : null,
      sellVolume24h: bestPair.volume?.h24Sell ? parseFloat(String(bestPair.volume.h24Sell)) : null,
      buyers24h: bestPair.txns?.h24?.buyers || null,
      sellers24h: bestPair.txns?.h24?.sellers || null,
      makers24h: bestPair.txns?.h24?.makers || null,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[ExternalPrice] Dexscreener request timeout for ${tokenAddress}`);
    } else {
      console.error(`[ExternalPrice] Dexscreener error for ${tokenAddress}:`, error.message);
    }
    return null;
  }
}

/**
 * Fetch price data from Codex (Defined.fi)
 * Note: Codex API structure may differ - this is a placeholder implementation
 */
async function fetchFromCodex(tokenAddress: string): Promise<ExternalPriceData | null> {
  try {
    // Codex API endpoint - adjust based on actual API documentation
    const response = await fetch(
      `https://api.defined.fi/v1/token/${tokenAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return null;
    }

    // TODO: Implement Codex response parsing based on actual API structure
    // For now, return null to use fallback
    return null;
  } catch (error: any) {
    console.warn(`[ExternalPrice] Codex error for ${tokenAddress}:`, error.message);
    return null;
  }
}

/**
 * Fetch price data from CoinGecko
 * Note: CoinGecko requires token contract address mapping for Base chain
 */
async function fetchFromCoinGecko(tokenAddress: string): Promise<ExternalPriceData | null> {
  try {
    // CoinGecko API for Base chain tokens
    // Note: May require API key for higher rate limits
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${tokenAddress}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      [key: string]: {
        usd?: number;
        usd_24h_change?: number;
        usd_24h_vol?: number;
        usd_market_cap?: number;
      };
    };

    const tokenData = data[tokenAddress.toLowerCase()];
    if (!tokenData) {
      return null;
    }

    return {
      price: tokenData.usd || null,
      priceInFEY: null,
      priceChange5m: null,
      priceChange1h: null,
      priceChange6h: null,
      priceChange24h: tokenData.usd_24h_change || null,
      marketCap: tokenData.usd_market_cap || null,
      liquidity: null, // CoinGecko doesn't provide liquidity
      volume24h: tokenData.usd_24h_vol || null,
      txns24h: null,
      buys24h: null,
      sells24h: null,
      buyVolume24h: null,
      sellVolume24h: null,
      buyers24h: null,
      sellers24h: null,
      makers24h: null,
    };
  } catch (error: any) {
    console.warn(`[ExternalPrice] CoinGecko error for ${tokenAddress}:`, error.message);
    return null;
  }
}

/**
 * Calculate price in FEY from pairs data
 */
function findPriceInFEYFromPairs(
  pairs: any[],
  tokenAddress: string,
  feyTokenAddress: string | null
): number | null {
  if (!pairs || pairs.length === 0 || !feyTokenAddress) {
    return null;
  }

  const feyPair = pairs.find((pair: any) => {
    const baseAddress = pair.baseToken?.address?.toLowerCase();
    const quoteAddress = pair.quoteToken?.address?.toLowerCase();
    const baseSymbol = pair.baseToken?.symbol?.toUpperCase();
    const quoteSymbol = pair.quoteToken?.symbol?.toUpperCase();
    const tokenAddr = tokenAddress.toLowerCase();

    const hasToken = baseAddress === tokenAddr || quoteAddress === tokenAddr;
    const hasFEY = baseSymbol === 'FEY' || quoteSymbol === 'FEY' ||
                   baseAddress === feyTokenAddress.toLowerCase() ||
                   quoteAddress === feyTokenAddress.toLowerCase();

    return hasToken && hasFEY;
  });

  if (!feyPair) {
    return null;
  }

  const baseSymbol = feyPair.baseToken?.symbol?.toUpperCase();
  const quoteSymbol = feyPair.quoteToken?.symbol?.toUpperCase();
  const baseAddress = feyPair.baseToken?.address?.toLowerCase();
  const quoteAddress = feyPair.quoteToken?.address?.toLowerCase();
  const tokenAddr = tokenAddress.toLowerCase();
  const feyAddr = feyTokenAddress.toLowerCase();

  const isQuoteFEY = quoteSymbol === 'FEY' || quoteAddress === feyAddr;
  const isBaseFEY = baseSymbol === 'FEY' || baseAddress === feyAddr;

  // Try priceNative first (native price in the quote token)
  if (isQuoteFEY) {
    // Token is base, FEY is quote - priceNative gives tokens per FEY
    const priceStr = feyPair.priceNative;
    if (priceStr) {
      const price = parseFloat(priceStr);
      return price > 0 ? price : null;
    }
  } else if (isBaseFEY) {
    // FEY is base, token is quote - priceNative gives FEY per token, so invert
    const priceStr = feyPair.priceNative;
    if (priceStr) {
      const price = parseFloat(priceStr);
      return price > 0 ? 1 / price : null;
    }
  }

  // Fallback: calculate from USD prices if available
  if (feyPair.priceUsd) {
    const tokenPriceUSD = parseFloat(feyPair.priceUsd);
    if (tokenPriceUSD > 0) {
      // We need FEY price in USD to calculate
      // This is a fallback - the main calculatePriceInFEY function will handle this better
      return null; // Let the fallback function handle USD-based calculation
    }
  }

  return null;
}

/**
 * Calculate price in FEY using FEY token USD price
 */
async function calculatePriceInFEY(
  tokenPriceUSD: number | null,
  feyTokenAddress: string | null
): Promise<number | null> {
  if (!tokenPriceUSD || !feyTokenAddress || tokenPriceUSD <= 0) {
    console.warn(`[ExternalPrice] Invalid inputs for calculatePriceInFEY: tokenPriceUSD=${tokenPriceUSD}, feyTokenAddress=${feyTokenAddress}`);
    return null;
  }

  try {
    console.log(`[ExternalPrice] Fetching FEY price from Dexscreener for ${feyTokenAddress}`);
    // Queue this request to avoid rate limiting
    const feyData = await queueRequest('dexscreener', feyTokenAddress, async () => {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${feyTokenAddress}`,
        {
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        throw new Error(`Dexscreener API error: ${response.status}`);
      }

      return await response.json() as {
        pairs?: Array<{ liquidity?: { usd?: number }; priceUsd?: string }>;
      };
    });

    if (!feyData.pairs || feyData.pairs.length === 0) {
      console.warn(`[ExternalPrice] No pairs found for FEY token ${feyTokenAddress}`);
      return null;
    }

    console.log(`[ExternalPrice] Found ${feyData.pairs.length} pairs for FEY token`);

    const bestFEYPair = feyData.pairs.reduce((prev: any, current: any) => {
      const prevLiquidity = prev.liquidity?.usd || 0;
      const currentLiquidity = current.liquidity?.usd || 0;
      return currentLiquidity > prevLiquidity ? current : prev;
    });

    const feyPriceUSD = bestFEYPair.priceUsd ? parseFloat(bestFEYPair.priceUsd) : null;
    if (!feyPriceUSD || feyPriceUSD <= 0) {
      console.warn(`[ExternalPrice] Invalid FEY price: ${bestFEYPair.priceUsd}`);
      return null;
    }

    const priceInFEY = tokenPriceUSD / feyPriceUSD;
    console.log(`[ExternalPrice] Calculated priceInFEY: ${tokenPriceUSD} / ${feyPriceUSD} = ${priceInFEY}`);
    return priceInFEY;
  } catch (error) {
    console.error('[ExternalPrice] Error calculating price in FEY:', error);
    return null;
  }
}

/**
 * Get price data from external APIs with fallback chain
 * Priority: Dexscreener → Codex → CoinGecko
 */
export async function getExternalPriceData(
  tokenAddress: string,
  feyTokenAddress: string | null
): Promise<ExternalPriceData> {
  const cacheKey = tokenAddress.toLowerCase();
  const now = Date.now();

  // Check cache
  const cached = priceCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL.price) {
    return cached.data;
  }

  // Try Dexscreener first (with queuing to prevent 429s)
  let priceData = await queueRequest('dexscreener', tokenAddress, async () => 
    await fetchFromDexscreener(tokenAddress, feyTokenAddress)
  );

  // If Dexscreener fails, try Codex
  if (!priceData || !priceData.price) {
    priceData = await queueRequest('codex', tokenAddress, async () => 
      await fetchFromCodex(tokenAddress)
    );
  }

  // If Codex fails, try CoinGecko
  if (!priceData || !priceData.price) {
    priceData = await queueRequest('coingecko', tokenAddress, async () => 
      await fetchFromCoinGecko(tokenAddress)
    );
  }

  // If all fail, return empty data
  if (!priceData) {
    const emptyData: ExternalPriceData = {
      price: null,
      priceInFEY: null,
      priceChange5m: null,
      priceChange1h: null,
      priceChange6h: null,
      priceChange24h: null,
      marketCap: null,
      liquidity: null,
      volume24h: null,
      txns24h: null,
      buys24h: null,
      sells24h: null,
      buyVolume24h: null,
      sellVolume24h: null,
      buyers24h: null,
      sellers24h: null,
      makers24h: null,
    };

    // Cache empty result for shorter time to retry sooner
    priceCache.set(cacheKey, { data: emptyData, timestamp: now });
    return emptyData;
  }

  // Always try to calculate priceInFEY if we have price data and FEY token address
  // This ensures we get priceInFEY even if it wasn't found in pairs
  if (priceData.price && feyTokenAddress) {
    // Only calculate if not already set (from pairs)
    if (priceData.priceInFEY === null) {
      console.log(`[ExternalPrice] Calculating priceInFEY for ${tokenAddress} (price: ${priceData.price}, feyToken: ${feyTokenAddress})`);
      try {
        priceData.priceInFEY = await calculatePriceInFEY(priceData.price, feyTokenAddress);
        if (priceData.priceInFEY === null) {
          console.warn(`[ExternalPrice] Could not calculate priceInFEY for ${tokenAddress} (price: ${priceData.price}, feyToken: ${feyTokenAddress})`);
        } else {
          console.log(`[ExternalPrice] Successfully calculated priceInFEY for ${tokenAddress}: ${priceData.priceInFEY}`);
        }
      } catch (error) {
        console.error(`[ExternalPrice] Error calculating priceInFEY for ${tokenAddress}:`, error);
        priceData.priceInFEY = null;
      }
    } else {
      console.log(`[ExternalPrice] priceInFEY already set for ${tokenAddress}: ${priceData.priceInFEY}`);
    }
  } else {
    if (!feyTokenAddress) {
      console.warn(`[ExternalPrice] FEY_TOKEN_ADDRESS not set, cannot calculate priceInFEY for ${tokenAddress}`);
    }
    if (!priceData.price) {
      console.warn(`[ExternalPrice] No price data available for ${tokenAddress}, cannot calculate priceInFEY`);
    }
  }

  // Cache the result
  priceCache.set(cacheKey, { data: priceData, timestamp: now });

  return priceData;
}

/**
 * Clear cache for a token
 */
export function clearPriceCache(tokenAddress: string): void {
  priceCache.delete(tokenAddress.toLowerCase());
}

/**
 * Clear all price cache
 */
export function clearAllPriceCache(): void {
  priceCache.clear();
}

