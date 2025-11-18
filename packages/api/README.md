# Feydar API

REST API and WebSocket server for FEY Protocol token deployments.

> 📖 **Other Documentation:**
> - [Main README](../../README.md) - Project overview
> - [Quick Start Guide](../../QUICK_START.md) - Setup instructions
> - [Setup & Deployment](../../SETUP.md) - Deployment guide

## Features

- REST API endpoints for querying deployments
- WebSocket server for real-time deployment updates
- Token price data from external APIs (Dexscreener, Codex, CoinGecko) with fallback chain
- Real-time liquidity, volume, and market data
- PostgreSQL database via Prisma ORM
- CORS support for webapp
- Request queuing and rate limiting for external APIs

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create `.env` file:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/feydar
PORT=3001
NODE_ENV=development
# CORS_ORIGIN is optional - if not set, defaults to http://localhost:3000,http://localhost:3002,http://localhost:3001
# For development with both webapp and miniapp, you can set:
# CORS_ORIGIN=http://localhost:3000,http://localhost:3002
# For production, set to your production URLs (comma-separated):
# CORS_ORIGIN=https://your-webapp.railway.app,https://your-miniapp.railway.app

# Recommended: FEY token address for priceInFEY calculations
FEY_TOKEN_ADDRESS=your_fey_token_address_here

# Optional: Alchemy API key (only needed for pool data queries or other Alchemy features)
# ALCHEMY_API_KEY=your_alchemy_api_key
```

3. Run database migrations:
```bash
pnpm prisma:migrate dev
```

4. Generate Prisma client:
```bash
pnpm prisma:generate
```

5. Start the server:
```bash
pnpm dev
# or for production
pnpm build && pnpm start
```

## API Endpoints

### REST

- `GET /health` - Health check
- `GET /token` - List tokens (with pagination, filters)
  - Query params: `page`, `pageSize`, `deployer`, `search`
- `GET /token/latest` - Get latest N tokens
  - Query params: `limit` (default: 20, max: 100)
- `GET /token/:address` - Get token by address
- `GET /token/:address/adjacent` - Get adjacent tokens (older and newer) for navigation
  - Returns: `{ older: TokenDeployment | null, newer: TokenDeployment | null }`
- `GET /api/price/:tokenAddress` - Get token price data from external APIs (Dexscreener → Codex → CoinGecko)
- `POST /api/broadcast` - Internal endpoint for bot to trigger WebSocket broadcast
- `POST /api/notifications/send` - Internal endpoint for bot to send Farcaster notifications
  - Body: `TokenDeployment` object
  - Returns: `{ success: boolean, sent: number, failed: number }`
  - Uses Neynar API to send notifications to all subscribed users
- `POST /api/webhook` - Webhook endpoint (legacy, not used when using Neynar)
  - Note: When using Neynar, webhook events go to Neynar's webhook URL instead

### WebSocket

- `ws://localhost:3001/ws/deployments` - Real-time deployment stream
  - Messages: `{ type: 'deployment', data: TokenDeployment }`

## Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (required)

**Note:** `ALCHEMY_API_KEY` is no longer required for price data. Price data is now fetched from external APIs (Dexscreener, Codex, CoinGecko). Alchemy is only needed if you're using the bot service for monitoring blockchain events.

**Required for Notifications:**
- `NEYNAR_API_KEY` - Neynar API key for sending Farcaster notifications (required)
  - Get your API key from [Neynar](https://neynar.com)
  - Used to send notifications via Neynar's API
  - Neynar handles token management, rate limiting, and permission revokes automatically

**Recommended:**
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Comma-separated list of allowed origins (defaults to `http://localhost:3000,http://localhost:3002,http://localhost:3001` for development)
  - **Development:** `http://localhost:3000,http://localhost:3002` (webapp and miniapp)
  - **Production:** `https://your-webapp.railway.app,https://your-miniapp.railway.app` (your production URLs)

**Recommended:**
- `FEY_TOKEN_ADDRESS` - FEY token contract address (recommended, used for price calculations in FEY. If not set, priceInFEY will not be calculated)

**Optional:**
- `ALCHEMY_API_KEY` - Alchemy API key (optional, only needed if using pool data queries or other Alchemy features)
- `UNISWAP_V4_POOL_MANAGER` - Uniswap V4 PoolManager address (default: `0x498581ff718922c3f8e6a244956af099b2652b2b`)
- `UNISWAP_V4_STATE_VIEW` - Uniswap V4 StateView address (default: `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71`)
- `PRISMA_LOG_QUERIES` - Set to `true` to enable Prisma query logging in development (default: disabled)

## Price Data Architecture

The API fetches price data from external APIs with a fallback chain:

1. **Dexscreener** (primary) - Fast, comprehensive DEX data
2. **Codex (Defined.fi)** (fallback) - Alternative DEX aggregator
3. **CoinGecko** (tertiary fallback) - Broader market coverage

### Features:
- **Request Queuing**: Prevents rate limiting (429 errors) by queuing requests
- **Rate Limiting**: Enforces minimum intervals between API calls (200ms for Dexscreener)
- **Caching**: 2-minute cache for price data, 10-minute cache for volume data
- **Automatic Fallback**: If one API fails, automatically tries the next
- **FEY Price Calculation**: Calculates token price in FEY if `FEY_TOKEN_ADDRESS` is set

### Uniswap V4 Contract Addresses (Optional)

These are only used if you need to query pool data directly (not used for price endpoint):

| Contract | Address |
|----------|---------|
| PoolManager | `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| StateView | `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` |
| PositionDescriptor | `0x25d093633990dc94bedeed76c8f3cdaa75f3e7d5` |
| PositionManager | `0x7c5f5a4bbd8fd63184577525326123b519429bdc` |
| Quoter | `0x0d5e0f971ed27fbff6c2837bf31316121532048d` |
| Universal Router | `0x6ff5693b99212da76ad316178a184ab56d299b43` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

These addresses are set as defaults in the code and can be overridden via environment variables.

## Database

Uses Prisma ORM with PostgreSQL. Schema defined in `prisma/schema.prisma`.

To create a new migration:
```bash
pnpm prisma:migrate dev --name migration_name
```

To view database:
```bash
pnpm prisma:studio
```

