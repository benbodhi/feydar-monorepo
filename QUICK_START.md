# Quick Start Guide

Follow these steps in order to get everything running.

> 📖 **Other Documentation:**
> - [Main README](./README.md) - Project overview
> - [Setup & Deployment Guide](./SETUP.md) - Complete setup and Railway deployment
> - [API Documentation](./packages/api/README.md) - API endpoints
> - [Bot Documentation](./packages/bot/README.md) - Bot features
> - [Webapp Documentation](./packages/webapp/README.md) - Webapp setup

## Prerequisites Check
- [ ] Node.js >= 18.0.0 installed (`node --version`)
- [ ] pnpm >= 8.0.0 installed (`pnpm --version`)
- [ ] PostgreSQL database running (local or remote)
- [ ] Discord bot token and channel ID ready
- [ ] Alchemy API key for Base mainnet ready
- [ ] FEY Factory contract address

## Step-by-Step Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Create PostgreSQL Database
Create a database (e.g., `feydar`):
```bash
# If using local PostgreSQL:
createdb feydar
# Or use your PostgreSQL client/UI
```

### 3. Build Shared Package
```bash
cd packages/shared
pnpm build
cd ../..
```

### 4. Generate Prisma Client
```bash
cd packages/api
pnpm prisma:generate
cd ../..
```

### 5. Run Database Migrations
```bash
cd packages/api
pnpm prisma:migrate dev
# When prompted, name it "init" or just press Enter
cd ../..
```

### 6. (Optional) Backfill Historical Deployments

Before starting the bot, you can populate the database with all historical token deployments:

```bash
cd packages/bot
pnpm backfill
```

This will:
- Fetch all historical `TokenCreated` events from block 38141030 (default, can be overridden)
- Only add deployments that aren't already in the database (safe to run multiple times)
- Show progress and statistics

**Note:** This can take a while depending on how many deployments exist. The script processes in batches and shows progress. You can run this in the background or let it complete before starting the bot.

### 7. Create Environment Files

**Create `packages/bot/.env`:**
```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here
ALCHEMY_API_KEY=your_alchemy_api_key_here
FEY_FACTORY_ADDRESS=your_fey_factory_address_here
DATABASE_URL=postgresql://user:password@localhost:5432/feydar
API_URL=http://localhost:3001
```

**Create `packages/api/.env`:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/feydar
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

**Note:** `ALCHEMY_API_KEY` is required for price data from Uniswap V4 pools. The same key works for both Base mainnet (for pool queries) and Ethereum mainnet (for ENS resolution).

**Create `packages/webapp/.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### 8. Start All Services

**Option A: Start everything at once (from root):**
```bash
pnpm dev
```

**Option B: Start individually (in separate terminals):**

Terminal 1 - API:
```bash
cd packages/api
pnpm dev
```

Terminal 2 - Webapp:
```bash
cd packages/webapp
pnpm dev
```

Terminal 3 - Bot:
```bash
cd packages/bot
pnpm dev
```

### 9. Verify Everything is Running

- [ ] API server: http://localhost:3001/health (should return `{"status":"ok"}`)
- [ ] Webapp: http://localhost:3000 (should show the deployments page)
- [ ] Bot: Check terminal for "Bot Initialization Complete" message
- [ ] Database: Check that deployments table exists (use `pnpm --filter api prisma:studio`)

## Testing

1. **Test API:**
   ```bash
   curl http://localhost:3001/api/deployments/latest
   ```

2. **Test Webapp:**
   - Open http://localhost:3000
   - Should see deployment feed (empty if no deployments yet)

3. **Test Bot:**
   - Check bot logs for successful connection
   - Wait for a token deployment event (or trigger one)
   - Verify Discord message is sent
   - Verify deployment appears in database and webapp

## Troubleshooting

**"Cannot find module '@feydar/shared'"**
- Run: `cd packages/shared && pnpm build`

**"Prisma Client not generated"**
- Run: `cd packages/api && pnpm prisma:generate`

**"Database connection error"**
- Verify PostgreSQL is running
- Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Test connection: `psql $DATABASE_URL`

**"Port already in use"**
- Change `PORT` in `packages/api/.env`
- Update `API_URL` in `packages/bot/.env` and `NEXT_PUBLIC_API_URL` in `packages/webapp/.env.local`

**"WebSocket connection failed"**
- Ensure API server is running first
- Check `NEXT_PUBLIC_WS_URL` matches API server URL
- Verify CORS settings in API

## Next Steps After Setup

1. Monitor bot logs for token deployment events
2. Check Discord channel for notifications
3. View deployments in webapp at http://localhost:3000
4. Use Prisma Studio to view database: `cd packages/api && pnpm prisma:studio`

## Production Deployment

See `SETUP.md` for Railway deployment instructions.

