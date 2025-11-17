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
   # CORS_ORIGIN is optional - defaults to http://localhost:3000,http://localhost:3002,http://localhost:3001
   # If you need to override, set it to comma-separated origins:
   # CORS_ORIGIN=http://localhost:3000,http://localhost:3002
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
- Miniapp (port 3002, if available)

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

**Miniapp:**
```bash
cd packages/miniapp
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

**💡 Pro Tip: Configure Watch Paths to Avoid Unnecessary Deployments**

To prevent Railway from redeploying all services when you push changes, configure **Watch Paths** for each service. This ensures only services with actual changes get redeployed:

1. Go to each service's **Settings** tab
2. Find the **"Source"** or **"Watch Paths"** section
3. Add the paths that should trigger deployments (paths are relative to repo root, no leading slash):
   - **Bot Service:** `packages/bot/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
   - **API Service:** `packages/api/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
   - **Webapp Service:** `packages/webapp/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
   - **Miniapp Service:** `packages/miniapp/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`

This way, when you push changes to `packages/bot/`, only the bot service redeploys, not all services!

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
5. **Configure Watch Paths** (optional but recommended):
   - In **Settings** → **"Source"** or **"Watch Paths"** section
   - Add: `packages/bot/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
   - This ensures only bot-related changes trigger deployments
6. Go to **"Build"** section (or **"Settings"** → **"Build"**), click **"+ Build Command"** and set it to:
   ```bash
   pnpm --filter shared build && cd packages/api && pnpm prisma:generate && cd ../..
   ```
   - The bot depends on `@feydar/shared` and `@prisma/client`, so we need to build shared and generate Prisma Client. Railway will auto-run `pnpm install` from the root.
7. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/bot && node src/bot.js
   ```
8. Go to **"Variables"** tab and add environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CHANNEL_ID`
   - `ALCHEMY_API_KEY`
   - `FEY_FACTORY_ADDRESS`
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (use Private Network variable reference)
   - `API_URL` - You can use either:
     - **Private URL** (recommended for bot): `http://api.railway.internal` (if your API service is named "api")
     - **Public URL**: The public domain you generate (see API Service setup step 8)
     - **Note:** Private URLs only work between Railway services. If your API service has a different name, use `http://[service-name].railway.internal`

### 3. API Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the Bot service
3. After the service is created, go to the **Settings** tab
4. **Do NOT set a Root Directory** - leave it empty so Railway can see the root `package.json` and detect `pnpm`
5. **Configure Watch Paths** (optional but recommended):
   - In **Settings** → **"Source"** or **"Watch Paths"** section
   - Add: `packages/api/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
   - This ensures only API-related changes trigger deployments
6. Go to **"Build"** section (or **"Settings"** → **"Build"**), click **"+ Build Command"** and set it to:
   ```bash
   pnpm --filter shared build && cd packages/api && pnpm prisma:generate && cd ../.. && pnpm --filter api build
   ```
   - Railway will auto-run `pnpm install` from root first, then this builds shared, generates Prisma client, and builds API
7. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/api && pnpm start
   ```
8. Go to **"Variables"** tab and add environment variables:
   
   **Required:**
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (use Private Network variable reference)
   - `ALCHEMY_API_KEY` (required for price data from Uniswap V4 pools)
   
   **Recommended:**
   - `PORT=3001` (defaults to 3001 if not set)
   - `NODE_ENV=production`
   - `CORS_ORIGIN` - Comma-separated list of allowed origins (required for production)
     - Example: `https://your-webapp.railway.app,https://your-miniapp.railway.app,https://feydar.app`
     - Include all production URLs: webapp, miniapp, and any custom domains
   
   **Optional:**
   - `FEY_TOKEN_ADDRESS` (FEY token contract address, used for price calculations in FEY)
   - `UNISWAP_V4_POOL_MANAGER` (defaults to `0x498581ff718922c3f8e6a244956af099b2652b2b`)
   - `UNISWAP_V4_STATE_VIEW` (defaults to `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71`)
   - `PRISMA_LOG_QUERIES=true` (optional, enables Prisma query logging in development)
   
   **Note:** Railway will automatically detect and suggest these variables from your source code. You can use the "Suggested Variables" feature to add them quickly.

9. **Generate Public Domain** (required for webapp, optional for bot):
   - Go to your **API service** main page (click the service name)
   - Click on **"Networking"** tab (or click "Unexposed" if shown on the service card)
   - Under **"Public Networking"** section, click **"Generate Domain"**
   - Railway will create a public URL (e.g., `https://your-api-service-production.up.railway.app`)
   - **Copy this URL** - you'll need it for the Webapp service
   - **Note:** The Bot service can use the private URL (`http://api.railway.internal`) instead, but the Webapp **must** use the public URL since it runs in users' browsers

### 4. Webapp Service

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the other services
3. After the service is created, go to the **Settings** tab
4. **Do NOT set a Root Directory** - leave it empty so Railway can see the root `package.json` and detect `pnpm`
5. **Configure Watch Paths** (optional but recommended):
   - In **Settings** → **"Source"** or **"Watch Paths"** section
   - Add: `packages/webapp/**`, `packages/shared/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
   - This ensures only webapp-related changes trigger deployments
6. Go to **"Variables"** tab and add:
   - `NODE_VERSION=20` (Next.js 16 requires Node.js >=20.9.0)
7. Go to **"Build"** section (or **"Settings"** → **"Build"**), click **"+ Build Command"** and set it to:
   ```bash
   pnpm --filter shared build && pnpm --filter webapp build
   ```
   - Railway will auto-run `pnpm install` from root first, then this builds shared and webapp packages
8. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/webapp && pnpm start
   ```
9. **Generate Public Domain for API** (required for webapp):
   - Go to your **API service** in Railway
   - Click on the service name
   - Go to the **"Networking"** tab (or click "Unexposed" if shown)
   - Under **"Public Networking"** section, click **"Generate Domain"**
   - Railway will create a public URL (e.g., `https://your-api-service-production.up.railway.app`)
   - Copy this URL - you'll need it for the webapp
   - **Note:** The webapp **must** use the public URL because it runs in users' browsers, which are outside Railway's private network

10. Go to **"Variables"** tab and add environment variables:
   - `NEXT_PUBLIC_API_URL` - Use the public URL you just generated (e.g., `https://your-api-service-production.up.railway.app`)
   - `NEXT_PUBLIC_WS_URL` - Use the same URL but with `wss://` protocol (e.g., `wss://your-api-service-production.up.railway.app`)
     - **Note:** Railway uses HTTPS, so always use `wss://` (secure WebSocket) for WebSocket connections

### 5. Run Migrations

Before starting services, you need to run database migrations. There are two ways to do this on Railway:

**Option A: Using Railway CLI**

1. Install Railway CLI (one-time setup, can use npm for global CLI tools):
   ```bash
   npm i -g @railway/cli
   # or if you prefer: pnpm add -g @railway/cli
   ```
2. Login: `railway login`
3. Link to your project: `railway link` (select your project, then select the API service)
4. **Get the full public DATABASE_URL from Railway:**
   - Go to your **PostgreSQL service** in Railway
   - Click on **"Connect"** tab
   - Select **"Public Network"** (not Private Network)
   - Under **"Connection URL"**, click **"show"** to reveal the password
   - Copy the **complete connection string** - it should look like:
     ```
     postgresql://postgres:YOUR_PASSWORD_HERE@switchyard.proxy.rlwy.net:38411/railway
     ```
   - Make sure you copy the **entire string** including `postgresql://`, username, password, host, port, and database name
5. Run migrations with the full DATABASE_URL:
   ```bash
   cd /path/to/feydar-monorepo
   cd packages/api
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@switchyard.proxy.rlwy.net:38411/railway" pnpm prisma:migrate:deploy
   ```
   **Important:** 
   - Replace `YOUR_PASSWORD` with the actual password from the connection string you copied.
   - **Do NOT use `railway run`** - it injects Railway's environment variables (including the private DATABASE_URL) which will override your command-line variable. Run the command directly instead.

**Option B: Using Railway CLI with Service Variables**

Alternatively, you can pull the DATABASE_URL from Railway's service variables:

1. Get the DATABASE_URL from your API service:
   ```bash
   railway variables --service api
   ```
   Look for the `DATABASE_URL` value (it will be the private network URL)

2. Or get it from the PostgreSQL service:
   ```bash
   railway variables --service postgres
   ```
   This might show connection details

3. If the above shows private URLs, you'll need to manually get the public URL from Railway dashboard (PostgreSQL service → Connect → Public Network → Connection URL)

**Note:** Railway CLI runs commands in Railway's environment, so it should use the service's environment variables. If it's still using the private URL, you may need to temporarily set the public DATABASE_URL as shown in Option A.

**Note:** Use `prisma migrate deploy` (not `prisma migrate dev`) for production. This applies pending migrations without creating new ones.

### 6. (Optional) Backfill Historical Deployments

To populate your production database with historical token deployments, you can run the backfill script. This is optional but recommended if you want historical data in your database.

**Option A: Run on Railway (Recommended)**

Since all services are on Railway, you can run the backfill script directly on Railway using Railway's environment variables. This uses the private network connection and is more efficient.

1. **Link Railway CLI to your Bot service:**
   ```bash
   railway link
   # Select your project, then select the Bot service
   ```

2. **Run the backfill script on Railway using Railway SSH:**
   
   The `railway ssh` command opens an interactive shell **on Railway's servers** where your code is deployed:
   
   ```bash
   railway ssh
   # Or specify the service: railway ssh --service bot
   ```
   
   Once in the Railway shell, navigate to the bot directory and run the backfill:
   ```bash
   cd packages/bot
   BACKFILL_FROM_LATEST=true pnpm backfill
   ```
   
   Railway will automatically use all environment variables from your Bot service (including `DATABASE_URL`, `ALCHEMY_API_KEY`, and `FEY_FACTORY_ADDRESS`).

   **Note:** `railway run` runs commands locally (not on Railway), so use `railway ssh` instead for running commands on Railway's servers.

**Option B: Run Locally**

If you prefer to run it locally, you'll need to use the public DATABASE_URL:

1. **Get required environment variables:**
   - `DATABASE_URL` - Use the same public URL from step 5 (migrations)
   - `ALCHEMY_API_KEY` - Get from your Bot service variables in Railway
   - `FEY_FACTORY_ADDRESS` - Get from your Bot service variables in Railway

2. **Run the backfill script:**
   ```bash
   cd packages/bot
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@switchyard.proxy.rlwy.net:38411/railway" \
   ALCHEMY_API_KEY="your_alchemy_key" \
   FEY_FACTORY_ADDRESS="your_factory_address" \
   pnpm backfill
   ```

   **Note:** Replace the values with your actual credentials. You can also set these as environment variables in your shell before running the command.

**Optional Environment Variables:**
- `FEY_FACTORY_DEPLOYMENT_BLOCK` - Block number to start backfill from (defaults to 38141030)
- `BACKFILL_FROM_LATEST=true` - Start from the latest block already in database (useful for catching up)
- `MAX_BLOCKS_PER_QUERY` - Number of blocks per query (defaults to 9 for Alchemy free tier)
- `REQUEST_DELAY_MS` - Delay between requests in milliseconds (defaults to 100ms). Increase this (e.g., `REQUEST_DELAY_MS=500`) if you encounter rate limit errors (429)

**Note:** The backfill script is idempotent - it's safe to run multiple times. It only adds missing deployments and updates existing ones with latest data.

After migrations (and optionally backfill) complete, your services will be ready to start.

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
- **Webapp**: Displays deployments (standalone webapp)
- **Miniapp**: Farcaster miniapp (separate package)
- **Database**: PostgreSQL with Prisma ORM

## Next Steps

1. (Optional) Deploy miniapp service (see [Miniapp README](./packages/miniapp/README.md))
2. Update `farcaster.json` in miniapp with production URL
3. Register miniapp with Farcaster
4. Set up monitoring and alerts
5. Configure production environment variables
6. Set up CI/CD pipeline

