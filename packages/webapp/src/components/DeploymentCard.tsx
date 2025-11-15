import { TokenDeployment } from '@feydar/shared/types';
import { formatIPFSUrl, truncateAddress } from '@feydar/shared/utils';
import { createAddressLink } from '@feydar/shared/constants';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TradeLinks } from './TradeLinks';
import { ExplorerLinks } from './ExplorerLinks';
import Image from 'next/image';
import { ExternalLink, Copy, Check, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTokenPrice, formatPrice, formatCurrency, formatCompactCurrency, formatPercentChange } from '@/lib/price';
import { formatRelativeTime, formatAbsoluteTime } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface DeploymentCardProps {
  deployment: TokenDeployment;
}

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  // Build deployer display with stacked information
  const deployerLines: string[] = [];
  if (deployment.deployerBasename) {
    deployerLines.push(`${deployment.deployerBasename}.base.eth`);
  }
  if (deployment.deployerENS) {
    deployerLines.push(deployment.deployerENS);
  }
  deployerLines.push(truncateAddress(deployment.deployer));

  // Fetch price data
  const { data: priceData } = useQuery({
    queryKey: ['tokenPrice', deployment.tokenAddress],
    queryFn: () => fetchTokenPrice(deployment.tokenAddress),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider stale after 15 seconds
  });

  // Update relative time - every second if under 1 minute, otherwise every minute
  const [relativeTime, setRelativeTime] = useState(() => 
    formatRelativeTime(deployment.createdAt)
  );
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const updateTime = () => {
      setRelativeTime(formatRelativeTime(deployment.createdAt));
      
      // Check if we're still under 1 minute
      const now = new Date();
      const then = new Date(deployment.createdAt);
      const diffMs = now.getTime() - then.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      
      return diffSeconds < 60;
    };
    
    // Update immediately
    updateTime();
    
    const setupInterval = () => {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      // Check current state
      const now = new Date();
      const then = new Date(deployment.createdAt);
      const diffMs = now.getTime() - then.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const isUnderMinute = diffSeconds < 60;
      
      if (isUnderMinute) {
        // Update every second while under 1 minute
        intervalRef.current = setInterval(() => {
          const stillUnderMinute = updateTime();
          // If we've crossed 1 minute, switch to minute updates
          if (!stillUnderMinute) {
            setupInterval(); // Re-setup with minute updates
          }
        }, 1000);
      } else {
        // Already over 1 minute, update every minute
        intervalRef.current = setInterval(() => {
          setRelativeTime(formatRelativeTime(deployment.createdAt));
        }, 60000);
      }
    };
    
    setupInterval();
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [deployment.createdAt]);

  // Clipboard state
  const [copied, setCopied] = useState(false);
  
  // Collapsible panel state for Price through Volume section
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  
  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(deployment.tokenAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  // Calculate FDV (Fully Diluted Valuation) = price * 100b tokens
  // All FEY tokens have 100b supply
  const TOTAL_SUPPLY_TOKENS = 100_000_000_000; // 100 billion tokens
  const fdv = priceData?.price
    ? (() => {
        try {
          const result = TOTAL_SUPPLY_TOKENS * priceData.price;
          // If result is too large or invalid, return null
          if (!isFinite(result) || result <= 0 || result > 1e15) return null; // Cap at quadrillions to avoid display issues
          return result;
        } catch {
          return null;
        }
      })()
    : null;

  // Get price in FEY from API response
  const priceInFEY = priceData?.priceInFEY ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 mb-2">
              <CardTitle className="text-xl">
                {deployment.name} ({deployment.symbol})
              </CardTitle>
              {/* Deployment Time Display - Top Right */}
              {deployment.createdAt && (
                <div className="flex flex-col items-end">
                  <p className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                    {relativeTime}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatAbsoluteTime(deployment.createdAt)}
                  </p>
                </div>
              )}
            </div>
            {/* Token Address */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="font-medium">CA:</span>
                {truncateAddress(deployment.tokenAddress)}
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-medium dark:text-green-light" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <a
                href={`https://basescan.org/token/${deployment.tokenAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {deployment.tokenImage && (
              <div className="mt-2 relative w-full aspect-square rounded-lg overflow-hidden">
                <Image
                  src={formatIPFSUrl(deployment.tokenImage)}
                  alt={deployment.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trade Section */}
        <div className="pb-6 border-b">
          <p className="text-sm text-foreground mb-2">Trade</p>
          <TradeLinks tokenAddress={deployment.tokenAddress} />
        </div>

        {/* Price and Performance Section - Collapsible */}
        {priceData && (
          <div className="pb-6 border-b">
            <button
              onClick={() => setIsPerformanceOpen(!isPerformanceOpen)}
              className={`w-full flex items-center justify-between text-sm text-foreground hover:opacity-80 transition-opacity ${
                isPerformanceOpen ? 'mb-2' : ''
              }`}
            >
              <span>Price Data</span>
              <ChevronDown 
                className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                  isPerformanceOpen ? 'transform rotate-180' : ''
                }`}
              />
            </button>
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isPerformanceOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="space-y-6 pt-4">
                {/* Price Section */}
                <div className="space-y-4">
                  {/* Price Row */}
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex-1 min-w-[120px]">
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium">USD</p>
                      <p className="text-lg font-semibold">
                        {(() => {
                          const formatted = formatPrice(priceData.price);
                          if (typeof formatted === 'string') {
                            return formatted;
                          }
                          return (
                            <>
                              {formatted.prefix}
                              {formatted.zeroCount !== null && (
                                <span className="text-[0.65em] align-sub leading-none">{formatted.zeroCount}</span>
                              )}
                              {formatted.digits}
                            </>
                          );
                        })()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-[120px] text-right">
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium">FEY</p>
                      <p className="text-lg font-semibold">
                        {priceInFEY !== null ? `${priceInFEY.toFixed(6)} FEY` : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Market Metrics Row */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium">Liquidity</p>
                      {priceData.liquidity === null || isNaN(priceData.liquidity) ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm sm:text-base font-semibold cursor-help break-words">N/A (smol)</p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Liquidity data not available</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <p className="text-sm sm:text-base font-semibold break-words">{formatCurrency(priceData.liquidity)}</p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium">Market Cap</p>
                      <p className="text-sm sm:text-base font-semibold break-words">{formatCompactCurrency(priceData.marketCap)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium">FDV</p>
                      <p className="text-sm sm:text-base font-semibold break-words">{formatCompactCurrency(fdv)}</p>
                    </div>
                  </div>
                </div>

                {/* Performance Section */}
                <div className="space-y-4 pt-6 border-t">
                  {/* Percentage Changes */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-3 font-medium">Price Change</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">5M</p>
                        <p className={`text-sm font-semibold ${
                          priceData.priceChange5m !== null && priceData.priceChange5m >= 0 ? 'text-green-medium dark:text-green-light' : 
                          priceData.priceChange5m !== null ? 'text-destructive' : 'text-muted-foreground'
                        }`}>
                          {formatPercentChange(priceData.priceChange5m)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">1H</p>
                        <p className={`text-sm font-semibold ${
                          priceData.priceChange1h !== null && priceData.priceChange1h >= 0 ? 'text-green-medium dark:text-green-light' : 
                          priceData.priceChange1h !== null ? 'text-destructive' : 'text-muted-foreground'
                        }`}>
                          {formatPercentChange(priceData.priceChange1h)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">6H</p>
                        <p className={`text-sm font-semibold ${
                          priceData.priceChange6h !== null && priceData.priceChange6h >= 0 ? 'text-green-medium dark:text-green-light' : 
                          priceData.priceChange6h !== null ? 'text-destructive' : 'text-muted-foreground'
                        }`}>
                          {formatPercentChange(priceData.priceChange6h)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">24H</p>
                        <p className={`text-sm font-semibold ${
                          priceData.priceChange24h !== null && priceData.priceChange24h >= 0 ? 'text-green-medium dark:text-green-light' : 
                          priceData.priceChange24h !== null ? 'text-destructive' : 'text-muted-foreground'
                        }`}>
                          {formatPercentChange(priceData.priceChange24h)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Volume */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-3 font-medium">Volume</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">5M</p>
                        <p className="text-sm font-semibold text-muted-foreground">N/A</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">1H</p>
                        <p className="text-sm font-semibold text-muted-foreground">N/A</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">6H</p>
                        <p className="text-sm font-semibold text-muted-foreground">N/A</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">24H</p>
                        <p className="text-sm font-semibold">{formatCurrency(priceData.volume24h)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-sm text-foreground mb-2">Creator</p>
            <a
              href={createAddressLink(deployment.deployer)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-mono text-xs flex flex-col items-start gap-0.5"
            >
              {deployerLines.map((line, index) => (
                <span key={index} className="flex items-center gap-1">
                  {line} {index === deployerLines.length - 1 && <ExternalLink className="h-3 w-3" />}
                </span>
              ))}
            </a>
          </div>
          {/* Fee Split Display */}
          {deployment.creatorBps != null && 
           deployment.feyStakersBps != null && 
           typeof deployment.creatorBps === 'number' && 
           typeof deployment.feyStakersBps === 'number' ? (
            <div className="col-span-2">
              <p className="text-sm text-foreground mb-2">1% Fee Split</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-foreground">
                  <span>{Math.round(deployment.creatorBps / 100)}%</span>
                  <span>{Math.round(deployment.feyStakersBps / 100)}%</span>
                </div>
                <div className="relative w-full bg-muted rounded-full h-4 overflow-visible">
                  {/* Weighted slider with center line */}
                  <div className="relative h-full flex items-center rounded-full">
                    {/* Left side (Creator) - darker green */}
                    <div
                      className={`h-full bg-green-dark ${
                        deployment.creatorBps === 10000 ? 'rounded-full' : 'rounded-l-full'
                      }`}
                      style={{ width: `${(deployment.creatorBps / 10000) * 100}%` }}
                    />
                    {/* Split line indicator - only show when there's an actual split (not 0% or 100%) */}
                    {deployment.creatorBps > 0 && deployment.creatorBps < 10000 && (
                      <div 
                        className="absolute h-full w-1.5 bg-foreground z-20 shadow-sm"
                        style={{ left: `${(deployment.creatorBps / 10000) * 100}%`, transform: 'translateX(-50%)' }}
                      />
                    )}
                    {/* Right side (FEY Stakers) - enhanced when more, scales with difference */}
                    {(() => {
                      const feyStakersPercent = (deployment.feyStakersBps / 10000) * 100;
                      const creatorPercent = (deployment.creatorBps / 10000) * 100;
                      const difference = feyStakersPercent - creatorPercent;
                      const isFeyStakersMore = difference > 0;
                      const intensity = Math.min(Math.abs(difference) / 50, 1); // Scale from 0 to 1
                      
                      if (isFeyStakersMore && intensity > 0.1) {
                        // Progressive enhancement based on how much more FEY stakers get
                        const shadowIntensity = intensity * 0.5;
                        const glowIntensity = intensity;
                        return (
                          <div
                            className={`h-full bg-gradient-to-r from-green-medium via-green-light to-green-light transition-all ${
                              deployment.creatorBps === 0 ? 'rounded-full' : 'rounded-r-full'
                            }`}
                            style={{ 
                              width: `${feyStakersPercent}%`,
                              boxShadow: `0 0 ${8 + intensity * 8}px rgba(79, 198, 95, ${0.3 + glowIntensity * 0.4})`,
                              filter: `brightness(${1 + intensity * 0.15}) saturate(${1 + intensity * 0.1})`
                            }}
                          />
                        );
                      }
                      return (
                        <div
                          className={`h-full bg-primary ${
                            deployment.creatorBps === 0 ? 'rounded-full' : 'rounded-r-full'
                          }`}
                          style={{ width: `${feyStakersPercent}%` }}
                        />
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>Creator</span>
                  <span>FEY Stakers</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pt-6 border-t -mb-6">
          <p className="text-sm text-foreground mb-2">Explore</p>
          <ExplorerLinks
            tokenAddress={deployment.tokenAddress}
          />
        </div>
      </CardContent>
    </Card>
  );
}

