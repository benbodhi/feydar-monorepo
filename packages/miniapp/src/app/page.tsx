'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchDeployments } from '@/lib/api';
import { DeploymentCard } from '@/components/DeploymentCard';
import { useEffect, useRef, useState } from 'react';
import { deploymentWS } from '@/lib/websocket';
import { useQueryClient } from '@tanstack/react-query';
import { TokenDeployment } from '@feydar/shared/types';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TokenPromo } from '@/components/TokenPromo';
import Image from 'next/image';

const PAGE_SIZE = 21;

export default function HomePage() {
  const queryClient = useQueryClient();
  const observerTarget = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['deployments', 'infinite'],
    queryFn: ({ pageParam = 1 }) => fetchDeployments({ page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    refetchInterval: 10000, // Refetch every 10 seconds to catch backfill data
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  // Setup scroll detection for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Setup infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Setup WebSocket for real-time updates
  useEffect(() => {
    // Small delay to ensure component is fully mounted
    const connectTimeout = setTimeout(() => {
      deploymentWS.connect();
    }, 100);

    const unsubscribe = deploymentWS.subscribe((deployment: TokenDeployment) => {
      // Add new deployment to the first page of infinite query
      queryClient.setQueryData(['deployments', 'infinite'], (old: any) => {
        if (!old) return old;
        
        // Check if deployment already exists
        const allDeployments = old.pages.flatMap((page: any) => page.deployments);
        const exists = allDeployments.some(
          (d: TokenDeployment) => d.tokenAddress.toLowerCase() === deployment.tokenAddress.toLowerCase()
        );
        
        if (exists) return old;

        // Add to first page
        return {
          ...old,
          pages: old.pages.map((page: any, index: number) => {
            if (index === 0) {
              return {
                ...page,
                deployments: [deployment, ...page.deployments],
              };
            }
            return page;
          }),
        };
      });
    });

    return () => {
      clearTimeout(connectTimeout);
      unsubscribe();
      // Only disconnect if this is the last listener
      if (!deploymentWS.hasListeners()) {
        deploymentWS.disconnect();
      }
    };
  }, [queryClient]);

  // Header component to reuse across loading, error, and loaded states
  const Header = () => (
    <div ref={topRef} className="mb-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Image
            src="/feydar-logo.png"
            alt="FEYDAR Logo"
            width={48}
            height={48}
            className="flex-shrink-0"
            unoptimized
          />
          <div>
            <h1 className="text-3xl font-bold mb-1">FEYDAR</h1>
            <p className="text-sm text-muted-foreground">
              Monitoring FEY Protocol token deployments on Base in real-time
            </p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Header />
        <p className="text-muted-foreground">Loading deployments...</p>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return (
      <div className="container mx-auto px-4 py-8">
        <Header />
        <div className="space-y-2">
          <p className="text-destructive font-semibold">Error loading deployments</p>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // Flatten all pages into a single array, ensuring uniqueness by tokenAddress
  const deployments = data?.pages.flatMap((page) => page.deployments) ?? [];
  const uniqueDeployments = deployments.filter((deployment, index, self) => 
    index === self.findIndex((d) => d.tokenAddress.toLowerCase() === deployment.tokenAddress.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <Header />

      {/* Token Promo Section */}
      <TokenPromo />

      {uniqueDeployments.length > 0 ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {uniqueDeployments.map((deployment) => (
              <DeploymentCard key={deployment.tokenAddress} deployment={deployment} />
            ))}
          </div>
          
          {/* Infinite scroll trigger */}
          <div ref={observerTarget} className="h-10 flex items-center justify-center mt-8">
            {isFetchingNextPage && (
              <p className="text-muted-foreground">Loading more deployments...</p>
            )}
            {!hasNextPage && uniqueDeployments.length > 0 && (
              <p className="text-muted-foreground">No more deployments to load</p>
            )}
          </div>
          
        </>
      ) : isLoading ? (
        <p className="text-muted-foreground">Loading deployments...</p>
      ) : (
        <p className="text-muted-foreground">No deployments found.</p>
      )}

      {/* Scroll to top button */}
      {showScrollToTop && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 rounded-full w-12 h-12 shadow-lg z-50"
          size="icon"
          title="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

