# Feydar API

REST API and WebSocket server for FEY Protocol token deployments.

> 📖 **Other Documentation:**
> - [Main README](../../README.md) - Project overview
> - [Quick Start Guide](../../QUICK_START.md) - Setup instructions
> - [Setup & Deployment](../../SETUP.md) - Deployment guide

## Features

- REST API endpoints for querying deployments
- WebSocket server for real-time deployment updates
- Token price data from Uniswap V4 pools and Dexscreener
- Real-time liquidity, volume, and market data
- PostgreSQL database via Prisma ORM
- CORS support for webapp

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
CORS_ORIGIN=http://localhost:3000
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
- `GET /api/deployments` - List deployments (with pagination, filters)
  - Query params: `page`, `pageSize`, `deployer`, `search`
- `GET /api/deployments/latest` - Get latest N deployments
  - Query params: `limit` (default: 20, max: 100)
- `GET /api/deployments/:address` - Get deployment by token address
- `GET /api/price/:tokenAddress` - Get token price data (Uniswap V4 + Dexscreener)
- `POST /api/broadcast` - Internal endpoint for bot to trigger WebSocket broadcast

### WebSocket

- `ws://localhost:3001/ws/deployments` - Real-time deployment stream
  - Messages: `{ type: 'deployment', data: TokenDeployment }`

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (required)
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origin (default: *)
- `ALCHEMY_API_KEY` - Alchemy API key for Base mainnet and Ethereum mainnet (required for price data from Uniswap V4 pools)
- `FEY_TOKEN_ADDRESS` - FEY token contract address (optional, used for price calculations in FEY)
- `UNISWAP_V4_POOL_MANAGER` - Uniswap V4 PoolManager address (default: `0x498581ff718922c3f8e6a244956af099b2652b2b`)
- `UNISWAP_V4_STATE_VIEW` - Uniswap V4 StateView address (default: `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71`)

## Uniswap V4 Contract Addresses

The API uses Uniswap V4 contracts on Base for price data:

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

