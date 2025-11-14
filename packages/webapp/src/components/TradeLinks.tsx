'use client';

import { createTradeLinks, createExplorerLinks } from '@feydar/shared/constants';
import { Button } from './ui/button';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface TradeLinksProps {
  tokenAddress: string;
}

export function TradeLinks({ tokenAddress }: TradeLinksProps) {
  const tradeLinks = createTradeLinks(tokenAddress);
  const explorerLinks = createExplorerLinks(tokenAddress);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="space-y-4">
      {/* FEY button - full width, primary with enhanced hover */}
      <Button 
        className="w-full transition-all duration-200 hover:scale-[1.02] hover:bg-green-light dark:hover:bg-green-light" 
        size="sm" 
        asChild
      >
        <a 
          href={tradeLinks.fey} 
          target="_blank" 
          rel="noopener noreferrer"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isHovered ? "Let's FEYking Go!" : "Buy on FEY"}
        </a>
      </Button>
      
      {/* Other DEXs - in a row */}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={tradeLinks.uniswap} target="_blank" rel="noopener noreferrer">
            Uniswap <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={explorerLinks.defined} target="_blank" rel="noopener noreferrer">
            Defined <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={tradeLinks.matcha} target="_blank" rel="noopener noreferrer">
            Matcha <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}

