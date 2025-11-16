# Feydar Miniapp

A Farcaster miniapp for browsing and purchasing FEY Protocol token deployments on Base. This package provides a standalone web application optimized for Farcaster clients, with integrated wallet functionality and notification support.

## Features

- **Real-time Token Feed**: Browse all FEY Protocol token deployments with live updates
- **Farcaster Wallet Integration**: Purchase tokens directly through the Farcaster wallet's built-in swap interface
- **Push Notifications**: Receive notifications when new tokens are deployed (opt-in)
- **Token Details**: View comprehensive information about each token including price data, liquidity, and deployer information
- **Dark/Light Theme**: Toggle between dark and light modes (dark by default)
- **Mobile-First Design**: Optimized for mobile devices and Farcaster clients

## Prerequisites

- Node.js 18+ and pnpm
- Access to the Feydar API server
- PostgreSQL database (for notifications, managed by API package)

## Installation

From the monorepo root:

```bash
pnpm install
```

## Environment Variables

Create a `.env.local` file in `packages/miniapp/`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# Production (update for deployment)
NEXT_PUBLIC_APP_URL=https://feydar.app
```

### Environment Variables Explained

- `NEXT_PUBLIC_API_URL`: URL of the Feydar API server (for fetching deployments and price data)
- `NEXT_PUBLIC_WS_URL`: WebSocket URL for real-time deployment updates
- `NEXT_PUBLIC_APP_URL`: Public URL of the miniapp (used for metadata and deep links)

## Development

Start the development server:

```bash
pnpm --filter miniapp dev
```

The miniapp will be available at `http://localhost:3000` (or next available port).

**Note**: Make sure the API server is running (`pnpm --filter api dev`) for the miniapp to function properly.

## Building for Production

```bash
pnpm --filter miniapp build
```

The production build will be in `.next/` directory.

## Running Production Build

```bash
pnpm --filter miniapp start
```

## Farcaster Integration

### Miniapp Manifest

The miniapp manifest is located at `public/farcaster.json` and is served at `/.well-known/farcaster.json`. This file contains metadata about the miniapp for Farcaster clients.

### Wallet Integration

The miniapp uses `@farcaster/miniapp-wagmi-connector` to automatically connect to the Farcaster wallet when opened. The wallet is connected on Base chain by default.

#### Buy Button

The "Buy Now" button (`BuyButton` component) uses `sdk.actions.swapToken()` to open the Farcaster wallet's built-in swap interface. When clicked:

1. Opens the Farcaster wallet swap modal
2. Pre-populates the target token (the token being purchased)
3. Defaults the sell token to WETH (Base ETH)
4. Sets a default amount of 0.01 ETH
5. Users can modify the sell token and amount within the wallet UI
6. Users confirm and execute the swap in the wallet

**Note**: The buy button only works when the miniapp is opened within a Farcaster client. In web mode, it falls back to opening the FEY DEX in a new tab.

### Notifications

The miniapp supports Farcaster push notifications for new token deployments. Users can enable notifications by adding the miniapp in their Farcaster client settings.

#### Notification Format

- **Title**: "New FEY Token!"
- **Body**: "[deployer] created [token name] ([ticker]), click to ape right now and see new tokens deployed in real time from the timeline!"
- **Deep Link**: Opens the deployment detail page with `?buy=true` parameter to auto-trigger the buy button

#### Notification Flow

1. User adds miniapp in Farcaster client → Webhook receives `miniapp_added` event
2. User enables notifications → Webhook receives `notifications_enabled` event
3. Bot detects new token deployment → Calls API notification endpoint
4. API sends notifications to all subscribed users
5. User clicks notification → Opens miniapp to deployment page → Auto-triggers buy button

## Project Structure

```
packages/miniapp/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── layout.tsx          # Root layout with metadata
│   │   ├── page.tsx            # Homepage feed
│   │   ├── token/              # Token detail pages
│   │   │   └── [address]/
│   │   │       ├── page.tsx    # Token detail page
│   │   │       └── layout.tsx  # Dynamic metadata for embeds
│   │   ├── .well-known/        # Well-known routes
│   │   │   └── farcaster.json/ # Serves miniapp manifest
│   │   ├── providers.tsx       # Global providers (Wagmi, Query, Theme)
│   │   └── globals.css         # Global styles
│   ├── components/             # React components
│   │   ├── BuyButton.tsx      # Buy button with wallet integration
│   │   ├── DeploymentCard.tsx # Token deployment card
│   │   ├── FarcasterSDK.tsx   # SDK initialization
│   │   ├── TokenPromo.tsx     # Feydar token promotional section
│   │   ├── ThemeToggle.tsx     # Dark/light theme toggle
│   │   └── ui/                 # UI components (shadcn/ui)
│   ├── lib/                    # Utilities and configurations
│   │   ├── api.ts              # API client
│   │   ├── wagmi.ts            # Wagmi configuration
│   │   ├── price.ts            # Price data utilities
│   │   └── utils.ts            # General utilities
│   └── types/                  # TypeScript types (if any)
├── public/                      # Static assets
│   ├── farcaster.json          # Miniapp manifest
│   ├── feydar-logo.png         # Square logo (favicons)
│   ├── feydar-farcaster-miniapp-cover.png  # Landscape cover (embeds)
│   └── feydar-farcaster-miniapp-splash.png # Splash screen
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Key Components

### BuyButton

The `BuyButton` component handles token purchases:

- Uses `sdk.actions.swapToken()` in Farcaster clients
- Falls back to external FEY DEX link in web mode
- Supports programmatic triggering via ref (for notification deep links)
- Displays "Buy [Token Name]" text

### DeploymentCard

Displays token deployment information:

- Token image, name, symbol
- Deployer information (basename, ENS, address)
- Price data (USD, FEY, liquidity, market cap, FDV)
- Buy button
- Collapsible price/performance section

### FarcasterSDK

Initializes the Farcaster SDK and calls `sdk.actions.ready()` to hide the splash screen when the app loads.

## Wagmi Configuration

The miniapp uses Wagmi for wallet interactions:

- **Connector**: `farcasterMiniApp` from `@farcaster/miniapp-wagmi-connector`
- **Chain**: Base (chain ID: 8453)
- **Auto-connect**: Enabled (wallet connects automatically on app load)

## Metadata & Embeds

### Root Layout Metadata

- Uses `feydar-farcaster-miniapp-cover.png` for OpenGraph and Twitter images
- Includes `fc:miniapp` meta tag for Farcaster embeds
- Sets `metadataBase` to resolve relative image URLs

### Deployment Page Metadata

- Dynamic metadata based on token data
- Uses token image for splash screen (if available)
- Uses cover image for embeds
- Includes `?buy=true` in embed URLs to auto-trigger buy button

## Testing

### Local Development

1. Start the API server: `pnpm --filter api dev`
2. Start the miniapp: `pnpm --filter miniapp dev`
3. Open `http://localhost:3000` in your browser

### Farcaster Client Testing

1. Deploy the miniapp to a public URL (e.g., Railway, Vercel)
2. Update `farcaster.json` with production URLs
3. Add the miniapp in Farcaster client (desktop or mobile)
4. Test wallet integration and notifications

**Note**: The buy button and wallet features only work within Farcaster clients, not in regular browsers.

## Deployment

### Railway

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the **same repository** as the other services
3. After the service is created, go to the **Settings** tab
4. **Do NOT set a Root Directory** - leave it empty so Railway can see the root `package.json` and detect `pnpm`
5. Go to **"Variables"** tab and add:
   - `NODE_VERSION=20` (Next.js 16 requires Node.js >=20.9.0)
6. Go to **"Build"** section (or **"Settings"** → **"Build"**), click **"+ Build Command"** and set it to:
   ```bash
   pnpm --filter shared build && pnpm --filter miniapp build
   ```
   - Railway will auto-run `pnpm install` from root first, then this builds shared and miniapp packages
7. Go to **"Deploy"** section (or **"Settings"** → **"Deploy"**), set **"Start Command"** to:
   ```bash
   cd packages/miniapp && pnpm start
   ```
8. Go to **"Variables"** tab and add environment variables:
   - `NEXT_PUBLIC_API_URL`: Your API server URL
   - `NEXT_PUBLIC_WS_URL`: Your WebSocket URL (use `wss://` for production)
   - `NEXT_PUBLIC_APP_URL`: Your miniapp URL (e.g., `https://miniapp.feydar.app`)

### Environment Variables for Production

```env
NEXT_PUBLIC_API_URL=https://api.feydar.app
NEXT_PUBLIC_WS_URL=wss://api.feydar.app
NEXT_PUBLIC_APP_URL=https://miniapp.feydar.app
```

### Post-Deployment

1. Update `public/farcaster.json` with production URLs
2. Ensure `/.well-known/farcaster.json` route is accessible
3. Test the miniapp in Farcaster client
4. Verify webhook endpoint is accessible (for notifications)

## Troubleshooting

### Build Errors

If you encounter TypeScript errors:
1. Rebuild the shared package: `pnpm --filter @feydar/shared build`
2. Clear Next.js cache: `rm -rf packages/miniapp/.next`
3. Reinstall dependencies: `pnpm install`

### Wallet Not Connecting

- Ensure you're testing in a Farcaster client (not regular browser)
- Check that `@farcaster/miniapp-wagmi-connector` is installed
- Verify Wagmi configuration in `src/lib/wagmi.ts`

### Notifications Not Working

- Verify webhook endpoint is accessible at the URL in `farcaster.json`
- Check API server logs for webhook events
- Ensure notification subscriptions are stored in database
- Verify bot is calling the notification endpoint after deployments

## Dependencies

### Core Dependencies

- `next`: Next.js framework
- `react`: React library
- `@farcaster/miniapp-sdk`: Farcaster SDK
- `@farcaster/miniapp-wagmi-connector`: Wagmi connector for Farcaster wallet
- `wagmi`: Wallet interaction library
- `viem`: Ethereum utilities
- `@tanstack/react-query`: Data fetching and caching

### Shared Dependencies

- `@feydar/shared`: Shared types, utilities, and constants

## License

See root LICENSE file.

## Support

For issues or questions, please open an issue in the repository.

