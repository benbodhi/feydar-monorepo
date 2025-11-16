'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDeploymentByAddress, getAdjacentTokens } from '@/lib/api';
import { DeploymentCard } from '@/components/DeploymentCard';
import { BuyButtonRef } from '@/components/BuyButton';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function TokenPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const address = params.address as string;
  const buyButtonRef = useRef<BuyButtonRef>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['deployment', address],
    queryFn: () => fetchDeploymentByAddress(address),
    enabled: !!address,
  });

  const { data: adjacentTokens, isLoading: isLoadingAdjacent } = useQuery({
    queryKey: ['adjacentTokens', address],
    queryFn: () => getAdjacentTokens(address),
    enabled: !!address,
  });

  // Auto-trigger buy button if ?buy=true is in URL (from notification link)
  useEffect(() => {
    const shouldBuy = searchParams.get('buy') === 'true';
    if (shouldBuy && data && buyButtonRef.current) {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        buyButtonRef.current?.trigger();
        // Remove the query param from URL after triggering
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('buy');
        router.replace(newUrl.pathname + newUrl.search, { scroll: false });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [data, searchParams, router]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Navigation Bar - matches final layout */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
          </Button>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev Token
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next Token
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Loading placeholder - matches DeploymentCard height */}
        <div className="flex items-center justify-center min-h-[600px]">
          <p className="text-muted-foreground">Loading token...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Navigation Bar - matches final layout */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
          </Button>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev Token
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next Token
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center min-h-[600px]">
          <p className="text-destructive">Token not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Navigation Bar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
        </Button>
        
        <div className="flex items-center gap-2">
          {isLoadingAdjacent ? (
            <>
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prev Token
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next Token
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              {adjacentTokens?.older ? (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => router.push(`/token/${adjacentTokens.older!.tokenAddress}`)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev Token
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev Token
                </Button>
              )}
              
              {adjacentTokens?.newer ? (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => router.push(`/token/${adjacentTokens.newer!.tokenAddress}`)}
                >
                  Next Token
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Next Token
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <DeploymentCard ref={buyButtonRef} deployment={data} priority />
    </div>
  );
}
