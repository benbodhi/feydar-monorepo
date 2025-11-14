# Feydar Monorepo - Setup Guide

Complete setup guide for the Feydar monorepo.

> 📖 **Other Documentation:**
> - [Main README](./README.md) - Project overview
> - [Quick Start Guide](./QUICK_START.md) - Step-by-step setup
> - [API Documentation](./packages/api/README.md) - API endpoints
> - [Bot Documentation](./packages/bot/README.md) - Bot features
> - [Webapp Documentation](./packages/webapp/README.md) - Webapp setup

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL database
- Discord bot token and channel ID
- Alchemy API key for Base mainnet

## Initial Setup

1. **Install dependencies:**
```bash
pnpm install
```

2. **Setup PostgreSQL database:**
   - Create a PostgreSQL database (e.g., `feydar`)
   - Note the connection string

3. **Configure environment variables:**

   **Bot** (`packages/bot/.env`):
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CHANNEL_ID=your_discord_channel_id
   ALCHEMY_API_KEY=your_alchemy_api_key
   FEY_FACTORY_ADDRESS=your_fey_factory_address
   DATABASE_URL=postgresql://user:password@localhost:5432/feydar
   API_URL=http://localhost:3001
   ```

   **API** (`packages/api/.env`):
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/feydar
   PORT=3001
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   ALCHEMY_API_KEY=your_alchemy_api_key
   ```
   
   **Note:** `ALCHEMY_API_KEY` is required for price data from Uniswap V4 pools. The same key works for both Base mainnet (for pool queries) and Ethereum mainnet (for ENS resolution).

   **Webapp** (`packages/webapp/.env.local`):
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_WS_URL=ws://localhost:3001
   ```

4. **Setup database:**
```bash
cd packages/api
pnpm prisma:generate
pnpm prisma:migrate dev
```

5. **Build shared package:**
```bash
cd packages/shared
pnpm build
```

## Running Locally

### Development (all services)

From the root:
```bash
pnpm dev
```

This will start:
- Bot (monitoring blockchain)
- API server (port 3001)
- Webapp (port 3000)

### Individual services

**Bot:**
```bash
cd packages/bot
pnpm dev
```

**API:**
```bash
cd packages/api
pnpm dev
```

**Webapp:**
```bash
cd packages/webapp
pnpm dev
```

## Production Build

```bash
# Build all packages
pnpm build

# Start services individually
cd packages/bot && pnpm start
cd packages/api && pnpm start
cd packages/webapp && pnpm start
```

## Railway Deployment

### 1. Database Setup

Create a PostgreSQL service on Railway and note the `DATABASE_URL`.

### 2. Bot Service

1. Create a new service from GitHub repo
2. Set root directory to `packages/bot`
3. Set start command: `node src/bot.js`
4. Add environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CHANNEL_ID`
   - `ALCHEMY_API_KEY`
   - `FEY_FACTORY_ADDRESS`
   - `DATABASE_URL` (from PostgreSQL service)
   - `API_URL` (from API service URL)

### 3. API Service

1. Create a new service from GitHub repo
2. Set root directory to `packages/api`
3. Set start command: `pnpm build && pnpm start`
4. Add environment variables:
   - `DATABASE_URL` (from PostgreSQL service)
   - `PORT=3001`
   - `NODE_ENV=production`
   - `CORS_ORIGIN` (your webapp URL)
   - `ALCHEMY_API_KEY` (required for price data from Uniswap V4 pools)

### 4. Webapp Service

1. Create a new service from GitHub repo
2. Set root directory to `packages/webapp`
3. Set start command: `pnpm build && pnpm start`
4. Add environment variables:
   - `NEXT_PUBLIC_API_URL` (API service URL)
   - `NEXT_PUBLIC_WS_URL` (API service WebSocket URL)

### 5. Run Migrations

Before starting services, run migrations:
```bash
cd packages/api
pnpm prisma:migrate deploy
```

## Troubleshooting

### Database connection errors
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check network/firewall settings

### WebSocket connection errors
- Verify `NEXT_PUBLIC_WS_URL` matches API service URL
- Check CORS settings in API
- Ensure API service is running

### Bot not receiving events
- Verify `ALCHEMY_API_KEY` is valid
- Check `FEY_FACTORY_ADDRESS` is correct
- Verify WebSocket connection in logs

## Architecture

```
Blockchain Event → Bot → Database → API → Webapp
                              ↓
                         WebSocket (real-time)
```

- **Bot**: Monitors blockchain, sends Discord notifications, saves to DB
- **API**: Serves REST endpoints and WebSocket for real-time updates
- **Webapp**: Displays deployments, works as Farcaster miniapp
- **Database**: PostgreSQL with Prisma ORM

## Next Steps

1. Update `farcaster.json` in webapp with production URL
2. Register miniapp with Farcaster
3. Set up monitoring and alerts
4. Configure production environment variables
5. Set up CI/CD pipeline

