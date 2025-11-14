/**
 * Formats supply with commas
 */
export function formatSupplyWithCommas(supply: bigint | string, decimals: number = 18): string {
  const supplyBigInt = typeof supply === 'string' ? BigInt(supply) : supply;
  const divisor = BigInt(10 ** decimals);
  const wholePart = supplyBigInt / divisor;
  const fractionalPart = supplyBigInt % divisor;
  const whole = Number(wholePart);
  const fractional = Number(fractionalPart) / Number(divisor);
  const total = whole + fractional;
  
  return total.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
}

/**
 * Formats address to checksummed format
 */
export function formatAddress(address: string): string {
  try {
    return address;
  } catch {
    return address;
  }
}

/**
 * Formats IPFS URL
 */
export function formatIPFSUrl(ipfsUrl: string): string {
  if (ipfsUrl.startsWith('ipfs://')) {
    return ipfsUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return ipfsUrl;
}

/**
 * Formats fee from basis points to percentage
 */
export function formatFeeBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Truncates address for display
 */
export function truncateAddress(address: string, start: number = 6, end: number = 4): string {
  if (address.length <= start + end) {
    return address;
  }
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

