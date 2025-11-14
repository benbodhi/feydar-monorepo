# Feydar Bot

Discord bot that monitors FEY Protocol token deployments on Base and sends notifications to Discord.

> 📖 **Other Documentation:**
> - [Main README](../../README.md) - Project overview
> - [Quick Start Guide](../../QUICK_START.md) - Setup instructions
> - [Setup & Deployment](../../SETUP.md) - Deployment guide

## Features

- Real-time monitoring of `TokenCreated` events via WebSocket
- Automatic Discord notifications with formatted embeds
- Database persistence of all deployments
- Deployer name resolution (Base Name Service → ENS → hex)
- Automatic reconnection and error handling

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Generate Prisma client (from API package):
```bash
cd ../api && pnpm prisma:generate
```

3. Create `.env` file:
```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_discord_channel_id
ALCHEMY_API_KEY=your_alchemy_api_key
FEY_FACTORY_ADDRESS=your_fey_factory_address
DATABASE_URL=postgresql://user:password@localhost:5432/feydar
API_URL=http://localhost:3001
```

4. Run migrations (from API package):
```bash
cd ../api && pnpm prisma:migrate dev
```

5. **Backfill historical deployments (optional but recommended):**
```bash
pnpm backfill
```
This will fetch all historical token deployments and add them to the database. It's safe to run multiple times - it only adds missing deployments.

6. Start the bot:
```bash
pnpm start
# or for development with auto-reload
pnpm dev
```

## Backfilling Historical Data

The bot includes a backfill script to populate the database with all historical token deployments:

```bash
pnpm backfill
```

**Features:**
- Only fetches deployments not already in the database (idempotent)
- Processes events in batches to avoid rate limits
- Handles errors gracefully and continues processing
- Shows progress and summary statistics

**Optional Environment Variables:**
- `FEY_FACTORY_DEPLOYMENT_BLOCK`: Set to the block number to start backfill from (defaults to block 38141030)
- `BACKFILL_FROM_LATEST=true`: Start backfill from the latest block already in the database (useful for catching up on missed deployments)

**Note:** The backfill script uses HTTP RPC (not WebSocket) for more reliable historical queries. The bot itself uses WebSocket for real-time monitoring.

## Environment Variables

- `DISCORD_TOKEN` - Discord bot token (required)
- `DISCORD_CHANNEL_ID` - Discord channel ID for notifications (required)
- `ALCHEMY_API_KEY` - Alchemy API key for Base mainnet and Ethereum mainnet (required for WebSocket connections and ENS resolution)
- `FEY_FACTORY_ADDRESS` - FEY Factory contract address (required)
- `DATABASE_URL` - PostgreSQL connection string (required)
- `API_URL` - API server URL for WebSocket broadcasting (optional, defaults to http://localhost:3001)
- `FEY_FACTORY_DEPLOYMENT_BLOCK` - Optional: Block number where factory was deployed (for faster backfill)
- `NODE_ENV` - Environment (development/production)

## Architecture

The bot:
1. Connects to Base mainnet via Alchemy WebSocket
2. Listens for `TokenCreated` events from the FEY Factory
3. Parses event data and fetches additional token information
4. Resolves deployer names (Base Name Service → ENS → hex)
5. Sends formatted Discord message (only for NEW deployments)
6. Saves deployment to PostgreSQL database (all deployments, new and backfilled)
7. Broadcasts deployment via HTTP to API server for WebSocket distribution

**Important:** The bot only sends Discord notifications for NEW deployments detected in real-time. Historical deployments added via backfill are stored in the database but don't trigger Discord notifications.
