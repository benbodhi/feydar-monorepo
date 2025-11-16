'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDeploymentByAddress, getAdjacentTokens } from '@/lib/api';
import { DeploymentCard } from '@/components/DeploymentCard';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

export default function TokenPage() {
  const params = useParams();
  const address = params.address as string;

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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Navigation Bar - matches final layout */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
            </Button>
          </Link>
          
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
        <div className="flex items-center justify-between mb-6 gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
            </Button>
          </Link>
          
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
      <div className="flex items-center justify-between mb-6 gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
          </Button>
        </Link>
        
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
                <Link href={`/token/${adjacentTokens.older.tokenAddress}`}>
                  <Button variant="outline" size="sm">
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Prev Token
                  </Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev Token
                </Button>
              )}
              
              {adjacentTokens?.newer ? (
                <Link href={`/token/${adjacentTokens.newer.tokenAddress}`}>
                  <Button variant="outline" size="sm">
                    Next Token
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
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

      <DeploymentCard deployment={data} priority />
    </div>
  );
}
