'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { FarcasterSDK } from '@/components/FarcasterSDK';
import { wagmiConfig } from '@/lib/wagmi';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <FarcasterSDK />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}

