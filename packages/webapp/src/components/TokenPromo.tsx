'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDeploymentByAddress } from '@/lib/api';
import { fetchTokenPrice, formatCompactCurrency } from '@/lib/price';
import { createTradeLinks } from '@feydar/shared/constants';
import { formatIPFSUrl } from '@feydar/shared/utils';
import { Button } from './ui/button';
import { Card } from './ui/card';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';

const FEYDAR_TOKEN_ADDRESS = '0x41ab6804641D2af063105A56E40A442f30c17937';

export function TokenPromo() {
  // Fetch token deployment data
  const { data: deployment, isLoading: isLoadingDeployment, error: deploymentError } = useQuery({
    queryKey: ['deployment', FEYDAR_TOKEN_ADDRESS],
    queryFn: () => fetchDeploymentByAddress(FEYDAR_TOKEN_ADDRESS),
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000, // Consider stale after 30 seconds
  });
  
  // Log errors for debugging
  if (deploymentError) {
    console.error('[TokenPromo] Error fetching deployment:', deploymentError);
  }

  // Fetch price data for market cap
  const { data: priceData, isLoading: isLoadingPrice } = useQuery({
    queryKey: ['tokenPrice', FEYDAR_TOKEN_ADDRESS],
    queryFn: () => fetchTokenPrice(FEYDAR_TOKEN_ADDRESS),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider stale after 15 seconds
  });

  const tradeLinks = createTradeLinks(FEYDAR_TOKEN_ADDRESS);

  // Use deployment data if available, otherwise use fallback
  const tokenName = deployment?.name || 'Feydar';
  const tokenSymbol = deployment?.symbol || 'FEYDAR';
  const tokenImage = deployment?.currentImageUrl || deployment?.tokenImage
    ? formatIPFSUrl(deployment.currentImageUrl || deployment.tokenImage || '')
    : '/feydar-logo.png';

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 sm:p-6">
        {/* Token Image */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-lg overflow-hidden">
          <Image
            src={tokenImage}
            alt={tokenName}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {/* Token Info */}
        <div className="flex-1 text-center sm:text-left">
          <div className="mb-2">
            <h2 className="text-xl sm:text-2xl font-bold">
              {tokenName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tokenSymbol}
            </p>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Official Feydar token launched via FEY Protocol
          </p>
        </div>

        {/* Market Cap - Vertically Centered */}
        {!isLoadingPrice && priceData && priceData.marketCap !== null && (
          <div className="text-center sm:text-right flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-1">Market Cap</p>
            <p className="text-lg font-semibold">
              {formatCompactCurrency(priceData.marketCap)}
            </p>
          </div>
        )}

        {/* Buy Button - Vertically Centered with spacing */}
        <div className="flex-shrink-0 w-full sm:w-auto sm:ml-6">
          <Button 
            className="w-full sm:w-auto transition-all duration-200 hover:scale-[1.02] hover:bg-green-light dark:hover:bg-green-light" 
            size="sm"
            asChild
          >
            <a 
              href={tradeLinks.fey} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Buy on FEY <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}

