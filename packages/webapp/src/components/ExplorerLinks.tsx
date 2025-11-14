import { createExplorerLinks } from '@feydar/shared/constants';
import { Button } from './ui/button';
import { ExternalLink } from 'lucide-react';

interface ExplorerLinksProps {
  tokenAddress: string;
}

export function ExplorerLinks({ tokenAddress }: ExplorerLinksProps) {
  const links = createExplorerLinks(tokenAddress);

  return (
    <div className="flex flex-wrap justify-between gap-2">
      <Button variant="ghost" size="sm" asChild>
        <a href={links.basescan} target="_blank" rel="noopener noreferrer">
          Basescan <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href={links.dexscreener} target="_blank" rel="noopener noreferrer">
          Dexscreener <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href={links.geckoterminal} target="_blank" rel="noopener noreferrer">
          GeckoTerminal <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </Button>
    </div>
  );
}

