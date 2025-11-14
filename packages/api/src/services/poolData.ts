import { ethers } from 'ethers';

// Uniswap V4 StateView ABI
const STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee, uint24 hookFee)',
  'function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)',
  'function getPoolKey(bytes32 poolId) external view returns (tuple(bytes32 currency0, bytes32 currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey)',
];

// Uniswap V4 PoolManager ABI - for Swap events
const POOL_MANAGER_ABI = [
  'event Swap(bytes32 indexed poolId, address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
];

// Base chain addresses - Uniswap V4 on Base
const UNISWAP_V4_POOL_MANAGER = process.env.UNISWAP_V4_POOL_MANAGER || '0x498581ff718922c3f8e6a244956af099b2652b2b';
const UNISWAP_V4_STATE_VIEW = process.env.UNISWAP_V4_STATE_VIEW || '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
const WETH_BASE = '0x4200000000000000000000000000000000000006'; // WETH on Base

interface PoolData {
  price: number | null;
  priceInFEY: number | null;
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

/**
 * Extract address from Currency bytes32
 * Currency is bytes32 where first 20 bytes are the address, last 12 bytes are flags
 */
function currencyToAddress(currency: string | bigint): string | null {
  if (typeof currency === 'string') {
    if (currency.startsWith('0x') && currency.length === 42) {
      return currency;
    }
    if (currency.startsWith('0x') && currency.length === 66) {
      return `0x${currency.slice(2, 42)}`;
    }
  }
  if (typeof currency === 'bigint') {
    const hex = currency.toString(16).padStart(64, '0');
    return `0x${hex.slice(0, 40)}`;
  }
  return null;
}

/**
 * Calculate price from sqrtPriceX96
 * Price = (sqrtPriceX96 / 2^96)^2, adjusted for token decimals
 */
function calculatePrice(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
  token0IsQuote: boolean // true if token0 is the quote token (WETH/FEY)
): number {
  const Q96 = 2n ** 96n;
  const priceRatio = Number(sqrtPriceX96) / Number(Q96);
  const priceSquared = priceRatio * priceRatio;
  const decimalsAdjustment = 10 ** (token1Decimals - token0Decimals);
  const adjustedPrice = priceSquared * decimalsAdjustment;
  
  return token0IsQuote ? adjustedPrice : 1 / adjustedPrice;
}

/**
 * Calculate USD value of liquidity from Uniswap V4 pool
 * For concentrated liquidity pools, we estimate using the current price
 * Approximate formula: liquidityUSD ≈ 2 * sqrt(price) * L (in token1 terms) * price1USD
 * Simplified: we use the geometric mean approach
 */
async function calculateLiquidityUSD(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  token0: string,
  token1: string,
  token0Decimals: number,
  token1Decimals: number,
  provider: ethers.Provider
): Promise<number | null> {
  try {
    // Get USD prices for both tokens from Dexscreener
    const [token0Response, token1Response] = await Promise.all([
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${token0}`).catch(() => null),
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${token1}`).catch(() => null),
    ]);

    let token0PriceUSD: number | null = null;
    let token1PriceUSD: number | null = null;

    if (token0Response?.ok) {
      const data = await token0Response.json();
      if (data.pairs && data.pairs.length > 0) {
        const bestPair = data.pairs.reduce((prev: any, current: any) => {
          const prevLiquidity = prev.liquidity?.usd || 0;
          const currentLiquidity = current.liquidity?.usd || 0;
          return currentLiquidity > prevLiquidity ? current : prev;
        });
        token0PriceUSD = bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null;
      }
    }

    if (token1Response?.ok) {
      const data = await token1Response.json();
      if (data.pairs && data.pairs.length > 0) {
        const bestPair = data.pairs.reduce((prev: any, current: any) => {
          const prevLiquidity = prev.liquidity?.usd || 0;
          const currentLiquidity = current.liquidity?.usd || 0;
          return currentLiquidity > prevLiquidity ? current : prev;
        });
        token1PriceUSD = bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null;
      }
    }

    // If we don't have USD prices, we can't calculate USD liquidity
    if (!token0PriceUSD && !token1PriceUSD) {
      return null;
    }

    // Calculate price ratio from sqrtPriceX96
    // For Uniswap V3/V4: L = sqrt(x * y) where x = amount0, y = amount1
    // If P = y/x (price of token1 in terms of token0), then:
    // L = sqrt(x * y) = sqrt(x^2 * P) = x * sqrt(P)
    // So: x = L / sqrt(P) and y = L * sqrt(P)
    const Q96 = 2n ** 96n;
    const sqrtPriceX96Num = Number(sqrtPriceX96);
    const sqrtPrice = sqrtPriceX96Num / Number(Q96);
    
    // Price ratio: P = (sqrtPriceX96 / Q96)^2, adjusted for decimals
    const priceRatio = (sqrtPrice * sqrtPrice) * (10 ** (token1Decimals - token0Decimals));
    const sqrtP = Math.sqrt(priceRatio);
    
    // Liquidity L is in Q128.64 format, but we treat it as a raw number
    // Convert to actual token amounts
    const L = Number(liquidity);
    
    // Calculate amounts in raw units (wei)
    // amount0 = L / sqrt(P), amount1 = L * sqrt(P)
    const amount0Raw = L / sqrtP;
    const amount1Raw = L * sqrtP;
    
    // Convert to token units (accounting for decimals)
    const amount0 = amount0Raw / (10 ** token0Decimals);
    const amount1 = amount1Raw / (10 ** token1Decimals);

    // Calculate USD value
    let liquidityUSD = 0;
    if (token0PriceUSD) {
      liquidityUSD += amount0 * token0PriceUSD;
    }
    if (token1PriceUSD) {
      liquidityUSD += amount1 * token1PriceUSD;
    }

    // If we only have one price, estimate the other using the price ratio
    if (token0PriceUSD && !token1PriceUSD) {
      const estimatedToken1Price = token0PriceUSD * priceRatio;
      liquidityUSD += amount1 * estimatedToken1Price;
    } else if (token1PriceUSD && !token0PriceUSD) {
      const estimatedToken0Price = token1PriceUSD / priceRatio;
      liquidityUSD += amount0 * estimatedToken0Price;
    }

    return liquidityUSD > 0 ? liquidityUSD : null;
  } catch (error) {
    console.error('Error calculating liquidity USD:', error);
    return null;
  }
}

/**
 * Get token decimals (default to 18)
 */
async function getTokenDecimals(
  tokenAddress: string,
  provider: ethers.Provider
): Promise<number> {
  try {
    const tokenAbi = ['function decimals() external view returns (uint8)'];
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
    return await tokenContract.decimals();
  } catch {
    return 18; // Default to 18 decimals
  }
}

/**
 * Query Uniswap V4 pool directly for real-time data using poolId
 */
export async function queryPoolData(
  tokenAddress: string,
  poolId: string | null,
  pairedToken: string | null,
  provider: ethers.Provider
): Promise<PoolData> {
  const result: PoolData = {
    price: null,
    priceInFEY: null,
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

  if (!poolId) {
    return result;
  }

  try {
    let poolIdBytes32: string;
    if (poolId.startsWith('0x')) {
      poolIdBytes32 = poolId;
    } else {
      poolIdBytes32 = `0x${poolId}`;
    }

    if (poolIdBytes32.length !== 66) {
      console.error('Invalid poolId format, expected 32 bytes (66 hex chars)');
      return result;
    }

    if (!UNISWAP_V4_STATE_VIEW || UNISWAP_V4_STATE_VIEW === '0x0000000000000000000000000000000000000000') {
      console.warn('UNISWAP_V4_STATE_VIEW address not set, cannot query pool data');
      return result;
    }

    const stateView = new ethers.Contract(UNISWAP_V4_STATE_VIEW, STATE_VIEW_ABI, provider);
    
    let slot0: any = null;
    let liquidity: bigint | null = null;
    let poolKey: any = null;

    try {
      [slot0, liquidity, poolKey] = await Promise.all([
        stateView.getSlot0(poolIdBytes32),
        stateView.getLiquidity(poolIdBytes32),
        stateView.getPoolKey(poolIdBytes32).catch(() => null),
      ]);
    } catch (error: any) {
      console.error('Error querying StateView:', error.message);
      return result;
    }

    if (!slot0 || liquidity === null) {
      return result;
    }

    const sqrtPriceX96 = slot0.sqrtPriceX96;
    
    let token0: string | null = null;
    let token1: string | null = null;
    
    if (poolKey) {
      token0 = currencyToAddress(poolKey.currency0);
      token1 = currencyToAddress(poolKey.currency1);
    }

    if (!token0 || !token1) {
      token0 = pairedToken || WETH_BASE;
      token1 = tokenAddress.toLowerCase();
    }

    const token0IsQuote = token0.toLowerCase() === WETH_BASE.toLowerCase() || 
                          (pairedToken && token0.toLowerCase() === pairedToken.toLowerCase());
    
    const [token0Decimals, token1Decimals] = await Promise.all([
      getTokenDecimals(token0, provider),
      getTokenDecimals(token1, provider),
    ]);

    const price = calculatePrice(sqrtPriceX96, token0Decimals, token1Decimals, token0IsQuote);
    result.price = price;
    
    // Calculate USD liquidity from pool data
    const liquidityUSD = await calculateLiquidityUSD(
      liquidity,
      sqrtPriceX96,
      token0,
      token1,
      token0Decimals,
      token1Decimals,
      provider
    );
    result.liquidity = liquidityUSD;

  } catch (error) {
    console.error('Error querying V4 pool data:', error);
  }

  return result;
}
