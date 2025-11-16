'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Suspense, useState } from 'react';
import { FarcasterSDK } from '@/components/FarcasterSDK';
import { FarcasterRedirect } from '@/components/FarcasterRedirect';

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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <FarcasterRedirect />
        </Suspense>
        <FarcasterSDK />
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}

