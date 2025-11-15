/**
 * Token deployment data structure
 */
export interface TokenDeployment {
  id?: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  deployer: string;
  deployerBasename?: string;  // Base name (e.g., "benbodhi" from "benbodhi.base.eth")
  deployerENS?: string;        // ENS name (e.g., "benbodhi.eth")
  transactionHash: string;
  tokenImage?: string;
  creatorBps?: number;      // Creator fee in basis points (from TokenRewardAdded event)
  feyStakersBps?: number;    // FEY Stakers fee in basis points (from TokenRewardAdded event)
  poolId?: string;           // Uniswap V4 pool ID (bytes32 as hex)
  blockNumber: number;
  createdAt: Date;
}

/**
 * Full event data from TokenCreated event
 */
export interface TokenCreatedEventData {
  msgSender: string;
  tokenImage?: string;
  tokenMetadata?: string;
  tokenContext?: string;
  startingTick?: bigint;
  poolHook?: string;
  poolId?: string;
  locker?: string;
  mevModule?: string;
  extensionsSupply?: bigint;
  extensions?: string[];
}

/**
 * API response for deployments list
 */
export interface DeploymentsResponse {
  deployments: TokenDeployment[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * API query parameters for deployments
 */
export interface DeploymentsQuery {
  page?: number;
  pageSize?: number;
  deployer?: string;
  search?: string;
}

/**
 * WebSocket message types
 */
export type WebSocketMessage =
  | { type: 'deployment'; data: TokenDeployment }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'error'; message: string };

