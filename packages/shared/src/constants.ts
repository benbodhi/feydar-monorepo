/**
 * Base Name Service L2 Resolver (Base Mainnet)
 */
export const BASENAME_L2_RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD';

/**
 * Base Name Service Reverse Resolver (Base Mainnet)
 */
export const BASENAME_REVERSE_RESOLVER = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

/**
 * Base Name Service Registry (Base Mainnet)
 */
export const BASENAME_REGISTRY = '0xe05003e439f087eca56a28574b4790b6f35d49df';

/**
 * Base Reverse Registrar (Base Mainnet)
 */
export const BASENAME_REVERSE_REGISTRAR = '0x0000000000D8e504002cC26E3Ec46D81971C1664';

/**
 * Base chain ID
 */
export const BASE_CHAIN_ID = 8453;

/**
 * Default pagination
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Trade links templates
 */
export function createTradeLinks(tokenAddress: string) {
  return {
    fey: `https://www.fey.money/tokens/${tokenAddress}`,
    matcha: `https://matcha.xyz/markets/base/${tokenAddress}`,
    uniswap: `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${tokenAddress}&chain=base`,
  };
}

/**
 * Explorer links templates
 */
export function createExplorerLinks(tokenAddress: string, transactionHash?: string) {
  const links: Record<string, string> = {
    basescan: `https://basescan.org/token/${tokenAddress}`,
    dexscreener: `https://dexscreener.com/base/${tokenAddress}`,
    defined: `https://www.defined.fi/base/${tokenAddress}?quoteToken=token0&cache=d3c3a`,
    geckoterminal: `https://www.geckoterminal.com/base/pools/${tokenAddress}`,
  };

  if (transactionHash) {
    links.transaction = `https://basescan.org/tx/${transactionHash}`;
  }

  return links;
}

/**
 * Address explorer link
 */
export function createAddressLink(address: string): string {
  return `https://basescan.org/address/${address}`;
}

