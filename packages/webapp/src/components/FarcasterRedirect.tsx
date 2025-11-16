'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Detects if the app is running in a Farcaster client and redirects to the miniapp
 * This ensures users who open feydar.app in Farcaster get redirected to miniapp.feydar.app
 */
export function FarcasterRedirect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Don't redirect if we're already on the miniapp domain
    if (typeof window !== 'undefined' && window.location.hostname.includes('miniapp.feydar.app')) {
      setHasChecked(true);
      return;
    }

    // Check if we're in a Farcaster client
    const checkFarcasterSDK = async () => {
      try {
        // Dynamic import to avoid errors outside Farcaster
        const { sdk } = await import('@farcaster/miniapp-sdk');
        if (sdk && sdk.actions) {
          // Try to call a method to verify SDK is functional
          try {
            await sdk.actions.ready();
            return true;
          } catch (error) {
            // If ready() fails but SDK exists, we might still be in Farcaster
            // Check if the error is about not being in a client vs other errors
            const errorMsg = error instanceof Error ? error.message : String(error);
            // If it's a "not in client" error, we're not in Farcaster
            if (errorMsg.includes('not in') || errorMsg.includes('client')) {
              return false;
            }
            // Other errors might mean we're in Farcaster but SDK isn't fully ready
            return true;
          }
        }
      } catch (error) {
        // SDK import failed, definitely not in Farcaster
        return false;
      }
      return false;
    };

    // Method 2: Check user agent as fallback
    const checkUserAgent = () => {
      if (typeof window === 'undefined') return false;
      const ua = window.navigator.userAgent.toLowerCase();
      // Farcaster clients might have specific user agent strings
      return ua.includes('farcaster') || ua.includes('warpcast');
    };

    // Method 3: Check for Farcaster-specific window properties
    const checkWindowProperties = () => {
      if (typeof window === 'undefined') return false;
      // Some Farcaster clients might set specific properties
      return !!(window as any).farcaster || !!(window as any).__FARCASTER__;
    };

    // Run all checks
    const detectFarcaster = async () => {
      // Give a small delay to ensure SDK is available
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const sdkCheck = await checkFarcasterSDK();
      const uaCheck = checkUserAgent();
      const windowCheck = checkWindowProperties();
      
      // If SDK check passes, we're definitely in Farcaster
      // Otherwise, use other checks as fallback
      const inFarcaster = sdkCheck || (uaCheck || windowCheck);
      setHasChecked(true);

      if (inFarcaster) {
        // Build the miniapp URL with current path and query params
        const miniappUrl = 'https://miniapp.feydar.app';
        const currentPath = pathname;
        const queryString = searchParams.toString();
        const fullUrl = `${miniappUrl}${currentPath}${queryString ? `?${queryString}` : ''}`;
        
        console.log('[FarcasterRedirect] Detected Farcaster client, redirecting to:', fullUrl);
        // Use replace to avoid adding to history
        window.location.replace(fullUrl);
      }
    };

    detectFarcaster();
  }, [pathname, searchParams]);

  // Don't render anything, just handle redirect
  return null;
}

