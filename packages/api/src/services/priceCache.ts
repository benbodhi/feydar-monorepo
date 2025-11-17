/**
 * Price Cache Service
 * Subscribes to Swap events and caches price/liquidity data
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
  swapCount: number; // Track swaps since last update
}

const priceCache = new Map<string, CachedPriceData>();

const activeSubscriptions = new Map<string, ethers.Contract>();

const CACHE_TTL = {
  price: 60 * 1000,      // 60 seconds (increased from 30s to reduce CU usage)
  liquidity: 60 * 1000,  // 60 seconds (increased from 30s to reduce CU usage)
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
    swapCount: cached?.swapCount || 0,
  };

  priceCache.set(cacheKey, result);
  return result;
}

/**
 * Subscribe to Swap events for a pool
 */
export async function subscribeToPoolSwaps(
  tokenAddress: string,
  poolId: string,
  poolManagerAddress: string,
  provider: ethers.Provider
): Promise<void> {
  const cacheKey = tokenAddress.toLowerCase();

  if (activeSubscriptions.has(cacheKey)) {
    return;
  }

  try {
    const POOL_MANAGER_ABI = [
      'event Swap(bytes32 indexed poolId, address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
    ];

    const poolManager = new ethers.Contract(poolManagerAddress, POOL_MANAGER_ABI, provider);
    const poolIdBytes32 = poolId.startsWith('0x') ? poolId : `0x${poolId}`;

    const swapFilter = poolManager.filters.Swap(poolIdBytes32);
    
    poolManager.on(swapFilter, (poolId, sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
      const cached = priceCache.get(cacheKey) || {
        price: null,
        liquidity: null,
        volume24h: 0,
        txns24h: 0,
        buys24h: 0,
        sells24h: 0,
        buyVolume24h: 0,
        sellVolume24h: 0,
        buyers24h: 0,
        sellers24h: 0,
        makers24h: 0,
        lastUpdated: Date.now(),
        swapCount: 0,
      };

      cached.liquidity = Number(liquidity);
      cached.swapCount += 1;
      cached.txns24h = (cached.txns24h || 0) + 1;

      const isBuy = Number(amount0) > 0 || Number(amount1) > 0;
      if (isBuy) {
        cached.buys24h = (cached.buys24h || 0) + 1;
        cached.buyVolume24h = (cached.buyVolume24h || 0) + Math.abs(Number(amount0) || Number(amount1));
      } else {
        cached.sells24h = (cached.sells24h || 0) + 1;
        cached.sellVolume24h = (cached.sellVolume24h || 0) + Math.abs(Number(amount0) || Number(amount1));
      }

      cached.lastUpdated = Date.now();
      priceCache.set(cacheKey, cached);
    });

    activeSubscriptions.set(cacheKey, poolManager);
    console.log(`Subscribed to swaps for pool ${poolId}`);
  } catch (error) {
    console.error(`Error subscribing to pool swaps:`, error);
  }
}

/**
 * Unsubscribe from pool swaps
 */
export function unsubscribeFromPoolSwaps(tokenAddress: string): void {
  const cacheKey = tokenAddress.toLowerCase();
  const subscription = activeSubscriptions.get(cacheKey);
  
  if (subscription) {
    subscription.removeAllListeners();
    activeSubscriptions.delete(cacheKey);
  }
}

/**
 * Clear cache for a token
 */
export function clearCache(tokenAddress: string): void {
  priceCache.delete(tokenAddress.toLowerCase());
}

