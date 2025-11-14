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

Create a PostgreSQL service on Railway.

**Important:** Railway offers two connection methods:
- **Private Network** (Recommended): Use Railway's service variable references. No egress costs, better performance.
- **Public Network**: Direct connection URL. Has egress costs and slower performance.

For services in the same Railway project, always use **Private Network**.

### 2. Bot Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select your repository (you'll use the same repo for all services)
3. After the service is created, go to the **Settings** tab
4. Under **"Source"** section, click **"Add Root Directory"** (if not already visible)
5. Set **"Root Directory"** to: `packages/bot`
6. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to: `node src/bot.js`
7. Go to **"Variables"** tab and add environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CHANNEL_ID`
   - `ALCHEMY_API_KEY`
   - `FEY_FACTORY_ADDRESS`
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (use Private Network variable reference)
   - `API_URL` (from API service URL, e.g., `https://your-api-service.railway.app`)

### 3. API Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the Bot service
3. After the service is created, go to the **Settings** tab
4. Under **"Source"** section, click **"Add Root Directory"** (if not already visible)
5. Set **"Root Directory"** to: `packages/api`
6. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to: `pnpm build && pnpm start`
7. Go to **"Variables"** tab and add environment variables:
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (use Private Network variable reference)
   - `PORT=3001`
   - `NODE_ENV=production`
   - `CORS_ORIGIN` (your webapp URL)
   - `ALCHEMY_API_KEY` (required for price data from Uniswap V4 pools)

### 4. Webapp Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the other services
3. After the service is created, go to the **Settings** tab
4. Under **"Source"** section, click **"Add Root Directory"** (if not already visible)
5. Set **"Root Directory"** to: `packages/webapp`
6. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to: `pnpm build && pnpm start`
7. Go to **"Variables"** tab and add environment variables:
   - `NEXT_PUBLIC_API_URL` (API service URL)
   - `NEXT_PUBLIC_WS_URL` (API service WebSocket URL)

### 5. Run Migrations

Before starting services, you need to run database migrations. There are two ways to do this on Railway:

**Option A: Using Railway CLI (Recommended)**

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Link to your project: `railway link` (select your project)
4. Run migrations:
   ```bash
   cd packages/api
   railway run pnpm prisma:migrate:deploy
   ```

**Option B: Using Railway Web Interface**

1. Go to your API service in Railway dashboard
2. Click on "Deployments" tab
3. Click "Run Command" or "New Deployment"
4. Set the command to: `pnpm prisma:migrate:deploy`
5. Make sure the working directory is set to `packages/api`
6. Run the command

**Note:** Use `prisma migrate deploy` (not `prisma migrate dev`) for production. This applies pending migrations without creating new ones.

After migrations complete, your services will be ready to start.

## Troubleshooting

### Database connection errors
- Verify `DATABASE_URL` is correct
- If using Private Network, ensure you're using `${{ Postgres.DATABASE_URL }}` variable reference
- If using Public Network, verify the connection string format
- Ensure PostgreSQL service is running on Railway
- Check that all services are in the same Railway project (for Private Network)

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

