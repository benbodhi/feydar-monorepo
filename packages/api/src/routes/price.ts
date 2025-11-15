import { Router } from 'express';
import { ethers } from 'ethers';
import { prisma } from '../db/client';
import { getPriceData, subscribeToPoolSwaps } from '../services/priceCache';

const router = Router();

const FEY_TOKEN_ADDRESS = process.env.FEY_TOKEN_ADDRESS?.toLowerCase() || null;

/**
 * Find FEY pair from Dexscreener pairs and extract price in FEY
 */
function findPriceInFEYFromPairs(pairs: any[], tokenAddress: string): number | null {
  if (!pairs || pairs.length === 0) {
    return null;
  }

  const feyPair = pairs.find((pair: any) => {
    const baseSymbol = pair.baseToken?.symbol?.toUpperCase();
    const quoteSymbol = pair.quoteToken?.symbol?.toUpperCase();
    const baseAddress = pair.baseToken?.address?.toLowerCase();
    const quoteAddress = pair.quoteToken?.address?.toLowerCase();
    const tokenAddr = tokenAddress.toLowerCase();

    // Check if this pair involves our token and FEY
    const hasToken = baseAddress === tokenAddr || quoteAddress === tokenAddr;
    const hasFEY = baseSymbol === 'FEY' || quoteSymbol === 'FEY' || 
                   (FEY_TOKEN_ADDRESS && (baseAddress === FEY_TOKEN_ADDRESS || quoteAddress === FEY_TOKEN_ADDRESS));

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

  const isQuoteFEY = quoteSymbol === 'FEY' || 
                     (FEY_TOKEN_ADDRESS && quoteAddress === FEY_TOKEN_ADDRESS);
  
  const isBaseFEY = baseSymbol === 'FEY' || 
                    (FEY_TOKEN_ADDRESS && baseAddress === FEY_TOKEN_ADDRESS);

  if (isQuoteFEY) {
    const priceStr = feyPair.priceNative;
    if (priceStr) {
      const price = parseFloat(priceStr);
      return price > 0 ? price : null;
    }
  } else if (isBaseFEY) {
    const priceStr = feyPair.priceNative;
    if (priceStr) {
      const price = parseFloat(priceStr);
      return price > 0 ? 1 / price : null;
    }
  }

  return null;
}

/**
 * Calculate price in FEY if token is paired with FEY
 */
async function calculatePriceInFEY(
  tokenPriceUSD: number | null,
  pairedToken: string | null,
  dexscreenerPairs?: any[],
  tokenAddress?: string
): Promise<number | null> {
  if (dexscreenerPairs && dexscreenerPairs.length > 0 && tokenAddress) {
    const priceInFEY = findPriceInFEYFromPairs(dexscreenerPairs, tokenAddress);
    if (priceInFEY !== null) {
      return priceInFEY;
    }
  }

  if (!tokenPriceUSD || !pairedToken || !FEY_TOKEN_ADDRESS) {
    return null;
  }

  if (pairedToken.toLowerCase() !== FEY_TOKEN_ADDRESS) {
    return null;
  }

  try {
    const feyResponse = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${FEY_TOKEN_ADDRESS}`
    );
    
    if (!feyResponse.ok) {
      return null;
    }

    const feyData = await feyResponse.json() as { pairs?: Array<{ liquidity?: { usd?: number }; priceUsd?: string }> };
    if (!feyData.pairs || feyData.pairs.length === 0) {
      return null;
    }

    const bestFEYPair = feyData.pairs.reduce((prev: any, current: any) => {
      const prevLiquidity = prev.liquidity?.usd || 0;
      const currentLiquidity = current.liquidity?.usd || 0;
      return currentLiquidity > prevLiquidity ? current : prev;
    });

    const feyPriceUSD = bestFEYPair.priceUsd ? parseFloat(bestFEYPair.priceUsd) : null;
    if (!feyPriceUSD || feyPriceUSD <= 0) {
      return null;
    }

    return tokenPriceUSD / feyPriceUSD;
  } catch (error) {
    console.error('Error calculating price in FEY:', error);
    return null;
  }
}

/**
 * GET /api/price/:tokenAddress
 * Get token price data
 */
router.get('/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;

    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    const deployment = await prisma.deployment.findUnique({
      where: { tokenAddress: tokenAddress.toLowerCase() },
      select: { poolId: true, pairedToken: true },
    });

    if (deployment?.poolId && process.env.ALCHEMY_API_KEY) {
      try {
        const provider = new ethers.JsonRpcProvider(
          `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        );

        const poolManagerAddress = process.env.UNISWAP_V4_POOL_MANAGER || '0x498581ff718922c3f8e6a244956af099b2652b2b';
        await subscribeToPoolSwaps(
          tokenAddress.toLowerCase(),
          deployment.poolId,
          poolManagerAddress,
          provider
        );

        const poolData = await getPriceData(
          tokenAddress.toLowerCase(),
          deployment.poolId,
          deployment.pairedToken,
          provider
        );

        if (poolData.price !== null || poolData.liquidity !== null) {
          let dexscreenerData: any = null;
          let allPairs: any[] = [];
          try {
            const dexscreenerResponse = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
            );
            if (dexscreenerResponse.ok) {
              const data = await dexscreenerResponse.json() as { pairs?: any[] };
              allPairs = data.pairs || [];
              if (allPairs.length > 0) {
                const bestPair = allPairs.reduce((prev: any, current: any) => {
                  const prevLiquidity = prev.liquidity?.usd || 0;
                  const currentLiquidity = current.liquidity?.usd || 0;
                  return currentLiquidity > prevLiquidity ? current : prev;
                });
                dexscreenerData = bestPair;
              }
            }
          } catch {
            // Ignore Dexscreener errors
          }

          const priceUSD = dexscreenerData?.priceUsd ? parseFloat(dexscreenerData.priceUsd) : (poolData.price || null);
          const priceInFEY = await calculatePriceInFEY(priceUSD, deployment.pairedToken, allPairs, tokenAddress.toLowerCase());
          // Prefer Dexscreener liquidity, but fall back to calculated pool liquidity
          const liquidityUSD = dexscreenerData?.liquidity?.usd 
            ? parseFloat(dexscreenerData.liquidity.usd) 
            : (poolData.liquidity || null);

          return res.json({
            price: priceUSD,
            priceInFEY: priceInFEY,
            priceChange5m: dexscreenerData?.priceChange?.m5 ? parseFloat(dexscreenerData.priceChange.m5) : null,
            priceChange1h: dexscreenerData?.priceChange?.h1 ? parseFloat(dexscreenerData.priceChange.h1) : null,
            priceChange6h: dexscreenerData?.priceChange?.h6 ? parseFloat(dexscreenerData.priceChange.h6) : null,
            priceChange24h: dexscreenerData?.priceChange?.h24 ? parseFloat(dexscreenerData.priceChange.h24) : null,
            marketCap: dexscreenerData?.marketCap ? parseFloat(dexscreenerData.marketCap) : null,
            liquidity: liquidityUSD,
            volume24h: poolData.volume24h || (dexscreenerData?.volume?.h24 ? parseFloat(dexscreenerData.volume.h24) : null),
            txns24h: poolData.txns24h || (dexscreenerData?.txns?.h24?.total || null),
            buys24h: poolData.buys24h || (dexscreenerData?.txns?.h24?.buys || null),
            sells24h: poolData.sells24h || (dexscreenerData?.txns?.h24?.sells || null),
            buyVolume24h: poolData.buyVolume24h || (dexscreenerData?.volume?.h24Buy || null),
            sellVolume24h: poolData.sellVolume24h || (dexscreenerData?.volume?.h24Sell || null),
            buyers24h: poolData.buyers24h || (dexscreenerData?.txns?.h24?.buyers || null),
            sellers24h: poolData.sellers24h || (dexscreenerData?.txns?.h24?.sellers || null),
            makers24h: poolData.makers24h || (dexscreenerData?.txns?.h24?.makers || null),
          });
        }
      } catch (poolError) {
        console.error('Error querying pool data:', poolError);
      }
    }

    const dexscreenerResponse = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    );

    if (!dexscreenerResponse.ok) {
      return res.status(dexscreenerResponse.status).json({
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
      });
    }

    const data = await dexscreenerResponse.json() as { pairs?: Array<{ liquidity?: { usd?: number }; priceUsd?: string }> };

    if (!data.pairs || data.pairs.length === 0) {
      return res.json({
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
      });
    }

    const bestPair = data.pairs.reduce((prev: any, current: any) => {
      const prevLiquidity = prev.liquidity?.usd || 0;
      const currentLiquidity = current.liquidity?.usd || 0;
      return currentLiquidity > prevLiquidity ? current : prev;
    });

    let pairedToken = deployment?.pairedToken || null;
    if (!pairedToken) {
      const deploymentData = await prisma.deployment.findUnique({
        where: { tokenAddress: tokenAddress.toLowerCase() },
        select: { pairedToken: true },
      });
      pairedToken = deploymentData?.pairedToken || null;
    }

    const priceUSD = bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null;
    const priceInFEY = await calculatePriceInFEY(priceUSD, pairedToken, data.pairs || [], tokenAddress.toLowerCase());

    res.json({
      price: priceUSD,
      priceInFEY: priceInFEY,
      priceChange5m: bestPair.priceChange?.m5
        ? parseFloat(bestPair.priceChange.m5)
        : null,
      priceChange1h: bestPair.priceChange?.h1
        ? parseFloat(bestPair.priceChange.h1)
        : null,
      priceChange6h: bestPair.priceChange?.h6
        ? parseFloat(bestPair.priceChange.h6)
        : null,
      priceChange24h: bestPair.priceChange?.h24
        ? parseFloat(bestPair.priceChange.h24)
        : null,
      marketCap: bestPair.marketCap ? parseFloat(bestPair.marketCap) : null,
      liquidity: bestPair.liquidity?.usd ? parseFloat(bestPair.liquidity.usd) : null,
      volume24h: bestPair.volume?.h24 ? parseFloat(bestPair.volume.h24) : null,
      txns24h: bestPair.txns?.h24?.buys && bestPair.txns?.h24?.sells
        ? (bestPair.txns.h24.buys + bestPair.txns.h24.sells)
        : bestPair.txns?.h24?.total || null,
      buys24h: bestPair.txns?.h24?.buys || null,
      sells24h: bestPair.txns?.h24?.sells || null,
      buyVolume24h: bestPair.volume?.h24Buy || null,
      sellVolume24h: bestPair.volume?.h24Sell || null,
      buyers24h: bestPair.txns?.h24?.buyers || null,
      sellers24h: bestPair.txns?.h24?.sellers || null,
      makers24h: bestPair.txns?.h24?.makers || null,
    });
  } catch (error: any) {
    console.error('Error fetching token price:', error);
    res.status(500).json({
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
    });
  }
});

export { router as priceRouter };

