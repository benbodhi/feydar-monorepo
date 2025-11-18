const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface TokenPriceData {
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

/**
 * Fetches token price data via API server
 * @param tokenAddress Token contract address on Base
 */
export async function fetchTokenPrice(tokenAddress: string): Promise<TokenPriceData> {
  try {
    const response = await fetch(
      `${API_URL}/api/price/${tokenAddress}`
    );

    if (!response.ok) {
      return {
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
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddress}:`, error);
    return {
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
  }
}

/**
 * Formats a number as currency
 */
export function formatCurrency(value: number | null, decimals: number = 2): string {
  if (value === null || isNaN(value)) return 'N/A';
  
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(decimals)}B`;
  } else if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(decimals)}M`;
  } else if (value >= 1e3) {
    return `$${(value / 1e3).toFixed(decimals)}K`;
  } else {
    return `$${value.toFixed(decimals)}`;
  }
}

/**
 * Formats a number as compact currency without decimals (for FDV, MKT CAP)
 */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
  
  if (isNaN(numValue) || !isFinite(numValue) || numValue === 0) return 'N/A';
  
  if (numValue >= 1e12) {
    const trillions = Math.round(numValue / 1e12);
    return `$${trillions}T`;
  } else if (numValue >= 1e9) {
    const billions = Math.round(numValue / 1e9);
    return `$${billions}B`;
  } else if (numValue >= 1e6) {
    const millions = Math.round(numValue / 1e6);
    return `$${millions}M`;
  } else if (numValue >= 1e3) {
    const thousands = Math.round(numValue / 1e3);
    return `$${thousands}K`;
  } else {
    return `$${Math.round(numValue)}`;
  }
}

/**
 * Formats a price in DexScreener style: $0.0[small N]digits
 */
export function formatPrice(price: number | null): { prefix: string; zeroCount: number | null; digits: string } | string {
  if (price === null || isNaN(price)) return 'N/A';
  
  if (price >= 1) {
    return `$${price.toFixed(4)}`;
  } else if (price >= 0.01) {
    return `$${price.toFixed(6)}`;
  } else if (price >= 0.0001) {
    return `$${price.toFixed(8)}`;
  } else if (price >= 0.000001) {
    return `$${price.toFixed(10)}`;
  } else {
    const str = price.toFixed(20);
    const match = str.match(/\.(0*)([1-9]\d*)/);
    if (match) {
      const zerosAfterDecimal = match[1].length;
      const significantPart = match[2];
      const displayDigits = significantPart.substring(0, Math.min(4, significantPart.length));
      if (zerosAfterDecimal > 0) {
        return {
          prefix: '$0.0',
          zeroCount: zerosAfterDecimal,
          digits: displayDigits
        };
      }
      return `$0.${displayDigits}`;
    }
    return `$${price.toFixed(12)}`;
  }
}

/**
 * Formats a percentage change
 * Returns "-" when no data (null/NaN) instead of "N/A"
 */
export function formatPercentChange(value: number | null): string {
  if (value === null || isNaN(value)) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Formats a number with commas
 */
export function formatNumber(value: number | null): string {
  if (value === null || isNaN(value)) return 'N/A';
  return value.toLocaleString();
}

