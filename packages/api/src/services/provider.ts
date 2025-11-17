import { ethers } from 'ethers';

// Singleton provider instance - reuse across all requests to save Compute Units
let sharedProvider: ethers.JsonRpcProvider | null = null;

/**
 * Get or create a shared Alchemy provider instance
 * This prevents creating new providers for each request, which consumes excessive Compute Units
 */
export function getSharedProvider(): ethers.JsonRpcProvider {
  if (!sharedProvider && process.env.ALCHEMY_API_KEY) {
    sharedProvider = new ethers.JsonRpcProvider(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    );
  }
  
  if (!sharedProvider) {
    throw new Error('ALCHEMY_API_KEY not configured');
  }
  
  return sharedProvider;
}

