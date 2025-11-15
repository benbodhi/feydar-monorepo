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

**Important:** For monorepos with pnpm workspaces, **do NOT set a Root Directory**. Railway needs to see the root `package.json` to detect `pnpm`. We'll handle package-specific builds using pnpm filters from the repo root.

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
4. **Do NOT set a Root Directory** - leave it empty so Railway can see the root `package.json` and detect `pnpm`
5. Go to **"Build"** section (or **"Settings"** → **"Build"**), **do NOT add a build command** - Railway will auto-detect and run `pnpm install` from the root. The bot doesn't need a build step.
6. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/bot && node src/bot.js
   ```
7. Go to **"Variables"** tab and add environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CHANNEL_ID`
   - `ALCHEMY_API_KEY`
   - `FEY_FACTORY_ADDRESS`
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (use Private Network variable reference)
   - `API_URL` - Find this in your **API service**:
     - Go to your API service in Railway
     - Click on the service name or go to the **"Settings"** tab
     - Look for **"Domains"** or **"Networking"** section
     - Copy the **public URL** (e.g., `https://your-api-service.railway.app`)
     - If no domain is set, Railway will show a generated URL like `https://your-api-service-production.up.railway.app`

### 3. API Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the Bot service
3. After the service is created, go to the **Settings** tab
4. **Do NOT set a Root Directory** - leave it empty so Railway can see the root `package.json` and detect `pnpm`
5. Go to **"Build"** section (or **"Settings"** → **"Build"**), click **"+ Build Command"** and set it to:
   ```bash
   pnpm --filter shared build && cd packages/api && pnpm prisma:generate && cd ../.. && pnpm --filter api build
   ```
   - Railway will auto-run `pnpm install` from root first, then this builds shared, generates Prisma client, and builds API
6. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/api && pnpm start
   ```
7. Go to **"Variables"** tab and add environment variables:
   
   **Required:**
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (use Private Network variable reference)
   - `ALCHEMY_API_KEY` (required for price data from Uniswap V4 pools)
   
   **Recommended:**
   - `PORT=3001` (defaults to 3001 if not set)
   - `NODE_ENV=production`
   - `CORS_ORIGIN` (your webapp URL, e.g., `https://your-webapp.railway.app`)
   
   **Optional:**
   - `FEY_TOKEN_ADDRESS` (FEY token contract address, used for price calculations in FEY)
   - `UNISWAP_V4_POOL_MANAGER` (defaults to `0x498581ff718922c3f8e6a244956af099b2652b2b`)
   - `UNISWAP_V4_STATE_VIEW` (defaults to `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71`)
   - `PRISMA_LOG_QUERIES=true` (optional, enables Prisma query logging in development)
   
   **Note:** Railway will automatically detect and suggest these variables from your source code. You can use the "Suggested Variables" feature to add them quickly.

### 4. Webapp Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the other services
3. After the service is created, go to the **Settings** tab
4. **Do NOT set a Root Directory** - leave it empty so Railway can see the root `package.json` and detect `pnpm`
5. Go to **"Variables"** tab and add:
   - `NODE_VERSION=20` (Next.js 16 requires Node.js >=20.9.0)
6. Go to **"Build"** section (or **"Settings"** → **"Build"**), click **"+ Build Command"** and set it to:
   ```bash
   pnpm --filter shared build && pnpm --filter webapp build
   ```
   - Railway will auto-run `pnpm install` from root first, then this builds shared and webapp packages
7. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/webapp && pnpm start
   ```
8. Go to **"Variables"** tab and add environment variables:
   - `NEXT_PUBLIC_API_URL` - Find this in your **API service**:
     - Go to your API service in Railway
     - Click on the service name or go to the **"Settings"** tab
     - Look for **"Domains"** or **"Networking"** section
     - Copy the **public URL** (e.g., `https://your-api-service.railway.app`)
     - If no domain is set, Railway will show a generated URL like `https://your-api-service-production.up.railway.app`
   - `NEXT_PUBLIC_WS_URL` - This is the same as `NEXT_PUBLIC_API_URL` but with `ws://` or `wss://` protocol:
     - If your API URL is `https://your-api-service.railway.app`, use `wss://your-api-service.railway.app`
     - If your API URL is `http://your-api-service.railway.app`, use `ws://your-api-service.railway.app`
     - **Note:** Railway uses HTTPS by default, so use `wss://` (secure WebSocket)

### 5. Run Migrations

Before starting services, you need to run database migrations. There are two ways to do this on Railway:

**Option A: Using Railway CLI (Recommended)**

1. Install Railway CLI (one-time setup, can use npm for global CLI tools):
   ```bash
   npm i -g @railway/cli
   # or if you prefer: pnpm add -g @railway/cli
   ```
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

