/**
 * Price Cache Service
 * Caches price/liquidity data from external APIs
 */

import { ethers } from 'ethers';
import { queryPoolData } from './poolData';

interface CachedPriceData {
  price: number | null;
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
  lastUpdated: number;
}

const priceCache = new Map<string, CachedPriceData>();

const CACHE_TTL = {
  price: 60 * 1000,      // 60 seconds
  liquidity: 60 * 1000,  // 60 seconds
  volume: 5 * 60 * 1000, // 5 minutes
};

/**
 * Get cached price data or fetch fresh
 */
export async function getPriceData(
  tokenAddress: string,
  poolId: string | null,
  feyTokenAddress: string | null, // FEY token address (all tokens are paired with FEY)
  provider: ethers.Provider
): Promise<CachedPriceData> {
  const cacheKey = tokenAddress.toLowerCase();
  const cached = priceCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.lastUpdated) < CACHE_TTL.price) {
    return cached;
  }

  const poolData = await queryPoolData(tokenAddress, poolId, feyTokenAddress, provider);

  const result: CachedPriceData = {
    price: poolData.price,
    liquidity: poolData.liquidity,
    volume24h: cached?.volume24h || poolData.volume24h,
    txns24h: cached?.txns24h || poolData.txns24h,
    buys24h: cached?.buys24h || poolData.buys24h,
    sells24h: cached?.sells24h || poolData.sells24h,
    buyVolume24h: cached?.buyVolume24h || poolData.buyVolume24h,
    sellVolume24h: cached?.sellVolume24h || poolData.sellVolume24h,
    buyers24h: cached?.buyers24h || poolData.buyers24h,
    sellers24h: cached?.sellers24h || poolData.sellers24h,
    makers24h: cached?.makers24h || poolData.makers24h,
    lastUpdated: now,
  };

  priceCache.set(cacheKey, result);
  return result;
}


/**
 * Clear cache for a token
 */
export function clearCache(tokenAddress: string): void {
  priceCache.delete(tokenAddress.toLowerCase());
}

