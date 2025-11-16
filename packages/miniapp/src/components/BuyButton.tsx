'use client';

import { useState, useImperativeHandle, forwardRef } from 'react';
import { Button } from './ui/button';
import { createTradeLinks } from '@feydar/shared/constants';
import { sdk } from '@farcaster/miniapp-sdk';
import { BASE_CHAIN_ID } from '@feydar/shared/constants';

interface BuyButtonProps {
  tokenAddress: string;
  tokenName?: string;
}

export interface BuyButtonRef {
  trigger: () => Promise<void>;
}

// WETH on Base (used for native ETH swaps)
const WETH_BASE = '0x4200000000000000000000000000000000000006';
const ETH_DECIMALS = 18;

/**
 * BuyButton component that executes swaps using Farcaster wallet
 * Falls back to external FEY DEX link if not in Farcaster client
 */
export const BuyButton = forwardRef<BuyButtonRef, BuyButtonProps>(
  ({ tokenAddress, tokenName }, ref) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleBuy = async () => {
    setIsLoading(true);
    
    try {
      // Check if we're in a Farcaster client with swap functionality
      if (typeof sdk !== 'undefined' && sdk.actions?.swapToken) {
        // Use Farcaster's built-in swap functionality
        // Convert token addresses to CAIP-19 format: eip155:chainId/erc20:tokenAddress
        // Use WETH for native ETH swaps (default - user can change in wallet UI)
        const sellToken = `eip155:${BASE_CHAIN_ID}/erc20:${WETH_BASE}`; // WETH (native ETH) - default
        const buyToken = `eip155:${BASE_CHAIN_ID}/erc20:${tokenAddress}`; // Target token
        
        // Default amount: 0.01 ETH (user can change this in the wallet UI)
        const sellAmount = (0.01 * Math.pow(10, ETH_DECIMALS)).toString();
        
        // Execute swap - this opens the Farcaster wallet with preconfigured swap
        // The wallet UI allows users to:
        // - Change the sell token (to any token they have)
        // - Change the amount to spend
        // - Review and confirm the swap
        await sdk.actions.swapToken({
          sellToken,
          buyToken,
          sellAmount,
        });
        
        // Swap interface opened successfully
        // User can now modify parameters in the wallet UI
      } else {
        // Not in Farcaster client - fallback to external FEY DEX link
        const swapUrl = createTradeLinks(tokenAddress).fey;
        if (typeof window !== 'undefined') {
          window.open(swapUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (error) {
      console.error('Error opening swap interface:', error);
      // Fallback to external link on error
      const swapUrl = createTradeLinks(tokenAddress).fey;
      if (typeof window !== 'undefined') {
        window.open(swapUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Expose trigger method via ref for programmatic triggering
  useImperativeHandle(ref, () => ({
    trigger: handleBuy,
  }));

  return (
    <Button 
      className="w-full transition-all duration-200 hover:scale-[1.02] hover:bg-green-light dark:hover:bg-green-light" 
      size="sm" 
      onClick={handleBuy}
      disabled={isLoading}
    >
      {isLoading ? 'Opening Swap...' : tokenName ? `Buy ${tokenName}` : "Buy Now"}
    </Button>
  );
  }
);

BuyButton.displayName = 'BuyButton';

