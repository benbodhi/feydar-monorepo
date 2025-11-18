import { Router } from 'express';
import { getExternalPriceData } from '../services/externalPrice';

const router = Router();

const FEY_TOKEN_ADDRESS = process.env.FEY_TOKEN_ADDRESS?.toLowerCase() || null;

// Log FEY_TOKEN_ADDRESS status on startup
if (!FEY_TOKEN_ADDRESS) {
  console.warn('[PriceRoute] FEY_TOKEN_ADDRESS not set in environment variables. priceInFEY will not be calculated.');
} else {
  console.log(`[PriceRoute] FEY_TOKEN_ADDRESS is set: ${FEY_TOKEN_ADDRESS}`);
}

/**
 * GET /api/price/:tokenAddress
 * Get token price data from external APIs (Dexscreener/Codex/CoinGecko)
 */
router.get('/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;

    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return res.status(400).json({ error: 'Invalid token address' });
    }

    console.log(`[PriceRoute] Fetching price for ${tokenAddress}, FEY_TOKEN_ADDRESS: ${FEY_TOKEN_ADDRESS || 'NOT SET'}`);

    // Fetch price data from external APIs with fallback chain
    const priceData = await getExternalPriceData(
      tokenAddress.toLowerCase(),
      FEY_TOKEN_ADDRESS
    );

    console.log(`[PriceRoute] Price data for ${tokenAddress}: price=${priceData.price}, priceInFEY=${priceData.priceInFEY}`);

    // Return data in the same format as before (no breaking changes)
    res.json({
      price: priceData.price,
      priceInFEY: priceData.priceInFEY,
      priceChange5m: priceData.priceChange5m,
      priceChange1h: priceData.priceChange1h,
      priceChange6h: priceData.priceChange6h,
      priceChange24h: priceData.priceChange24h,
      marketCap: priceData.marketCap,
      liquidity: priceData.liquidity,
      volume24h: priceData.volume24h,
      txns24h: priceData.txns24h,
      buys24h: priceData.buys24h,
      sells24h: priceData.sells24h,
      buyVolume24h: priceData.buyVolume24h,
      sellVolume24h: priceData.sellVolume24h,
      buyers24h: priceData.buyers24h,
      sellers24h: priceData.sellers24h,
      makers24h: priceData.makers24h,
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

