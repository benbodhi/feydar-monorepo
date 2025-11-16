# Feydar Webapp

Next.js webapp for displaying FEY Protocol token deployments. This is a standalone web application (separate from the Farcaster miniapp package).

> 📖 **Other Documentation:**
> - [Main README](../../README.md) - Project overview
> - [Quick Start Guide](../../QUICK_START.md) - Setup instructions
> - [Setup & Deployment](../../SETUP.md) - Deployment guide

## Features

- Real-time deployment feed with WebSocket updates
- Individual token detail pages at `/token/[address]`
- Trade links (FEY, Matcha, Uniswap)
- Explorer links (Basescan, Dexscreener, GeckoTerminal)
- Responsive design with Tailwind CSS
- Dark/light theme toggle

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

3. Start development server:
```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Routes

- `/` - Homepage with deployment feed
- `/token/[address]` - Individual token detail page with navigation to adjacent tokens

## Environment Variables

- `NEXT_PUBLIC_API_URL` - API server URL (required)
- `NEXT_PUBLIC_WS_URL` - WebSocket server URL (required)

## Build

```bash
pnpm build
pnpm start
```

## Deployment

The webapp can be deployed to:
- Vercel (recommended for Next.js)
- Railway
- Any Node.js hosting platform

Make sure to set the environment variables in your hosting platform.

