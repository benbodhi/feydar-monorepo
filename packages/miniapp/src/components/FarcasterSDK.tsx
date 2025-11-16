'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Initializes Farcaster miniapp SDK and calls ready() when app is loaded.
 * This prevents the infinite splash screen in Farcaster clients.
 */
export function FarcasterSDK() {
  useEffect(() => {
    // Call ready() as soon as the component mounts to hide the splash screen
    // This should be called when the interface is ready to be displayed
    sdk.actions.ready().catch((error) => {
      // Only log errors in development, as this will fail outside Farcaster clients
      if (process.env.NODE_ENV === 'development') {
        console.log('Farcaster SDK ready() called (may fail outside Farcaster client):', error);
      }
    });
  }, []);

  return null;
}

