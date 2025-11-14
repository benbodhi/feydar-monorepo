# Feydar Monorepo

Monitoring FEY Protocol token deployments on Base.

## Structure

```
feydar-monorepo/
├── packages/
│   ├── bot/          # Discord bot monitoring blockchain events
│   ├── api/          # API server (REST + WebSocket)
│   ├── webapp/       # Next.js webapp + Farcaster miniapp
│   └── shared/       # Shared types, utilities, constants
├── package.json
└── pnpm-workspace.yaml
```

## Tech Stack

- **Bot**: Node.js + ethers.js + PostgreSQL
- **API**: Express + TypeScript + PostgreSQL + WebSocket + Uniswap V4 integration
- **Webapp**: Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Database**: PostgreSQL + Prisma ORM
- **Farcaster**: Farcaster miniapp compatible (manifest configured)

## Documentation

- **[Quick Start Guide](./QUICK_START.md)** - Step-by-step setup instructions
- **[Setup & Deployment](./SETUP.md)** - Complete setup guide and Railway deployment
- **[API Documentation](./packages/api/README.md)** - API endpoints and configuration
- **[Bot Documentation](./packages/bot/README.md)** - Bot setup and features
- **[Webapp Documentation](./packages/webapp/README.md)** - Webapp setup and Farcaster miniapp

## Getting Started

**👉 See [QUICK_START.md](./QUICK_START.md) for a step-by-step setup guide**

### Quick Overview

1. Install dependencies: `pnpm install`
2. Build shared package: `cd packages/shared && pnpm build`
3. Setup database: `cd packages/api && pnpm prisma:generate && pnpm prisma:migrate dev`
4. Create `.env` files (see QUICK_START.md)
5. (Optional) Backfill historical deployments: `cd packages/bot && pnpm backfill`
6. Start services: `pnpm dev`

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL database
- Discord bot token and channel ID
- Alchemy API key for Base mainnet

## Development

### Individual Packages

```bash
# Bot only
pnpm --filter bot dev

# API only
pnpm --filter api dev

# Webapp only
pnpm --filter webapp dev
```

### Building

```bash
# Build all packages
pnpm build
```

## Deployment

Deploy to Railway with separate services for:
- Bot (long-running process)
- API (Express server)
- Webapp (Next.js)

See [SETUP.md](./SETUP.md) for detailed Railway deployment instructions, or individual package READMEs for package-specific details.

## License

MIT

