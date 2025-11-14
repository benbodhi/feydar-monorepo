# Feydar Webapp

Next.js webapp for displaying FEY Protocol token deployments. Works as both a standalone webapp and a Farcaster miniapp.

> 📖 **Other Documentation:**
> - [Main README](../../README.md) - Project overview
> - [Quick Start Guide](../../QUICK_START.md) - Setup instructions
> - [Setup & Deployment](../../SETUP.md) - Deployment guide

## Features

- Real-time deployment feed with WebSocket updates
- Individual deployment detail pages
- Trade links (FEY, Matcha, Uniswap)
- Explorer links (Basescan, Dexscreener, GeckoTerminal)
- Responsive design with Tailwind CSS
- Farcaster miniapp support

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

## Farcaster Miniapp

The webapp is fully configured as a Farcaster miniapp with:
- ✅ Farcaster SDK integrated (`@farcaster/miniapp-sdk`)
- ✅ SDK `ready()` call to prevent infinite splash screen
- ✅ Manifest structure matching official schema
- ✅ Manifest served at `/.well-known/farcaster.json`
- ✅ `fc:miniapp` meta tag for sharing and discovery

### Setup Steps

1. **Deploy your webapp** to a public URL (HTTPS required)
   - Recommended: Railway, Vercel, or any Node.js hosting platform
   - For local testing, use a tunneling service like ngrok:
     ```bash
     ngrok http 3000
     ```
   - **Important:** If using a tunnel URL, visit it directly in your browser first to whitelist it for iframe usage

2. **Update manifest and metadata** with your production domain:
   
   **Update `public/farcaster.json`:**
   ```json
   {
     "accountAssociation": {
       "header": "",
       "payload": "",
       "signature": ""
     },
     "frame": {
       "version": "1",
       "name": "Feydar",
       "iconUrl": "https://your-domain.com/icon.png",
       "homeUrl": "https://your-domain.com",
       "imageUrl": "https://your-domain.com/og-image.png",
       "buttonTitle": "Open Feydar",
       "splashImageUrl": "https://your-domain.com/icon.png",
       "splashBackgroundColor": "#000000"
     }
   }
   ```
   
   **Update `src/app/layout.tsx`** - Replace `https://your-domain.com` with your actual domain in the `frame` object.

3. **Sign the manifest**:
   - Use the [Farcaster Manifest Tool](https://farcaster.xyz/~/developers/mini-apps/manifest?domain=your-domain.com)
   - Enter your domain (must match exactly, including subdomains)
   - Copy the signed `accountAssociation` object (header, payload, signature)
   - Update `public/farcaster.json` with the signed `accountAssociation` data

4. **Verify manifest is accessible**:
   ```bash
   curl -s https://your-domain.com/.well-known/farcaster.json | jq .
   ```
   Should return HTTP 200 with valid JSON containing `accountAssociation` and `frame` objects.

5. **Test using Preview Tool**:
   - Open the [Farcaster Preview Tool](https://farcaster.xyz/~/developers/mini-apps/preview?url=YOUR_ENCODED_URL) on desktop
   - Encode your URL: `https://your-domain.com`
   - Enter the encoded URL in the preview tool
   - Click "Preview" to test in Farcaster
   - **Note:** You must be logged into your Farcaster account on desktop

### Important Notes

- **Manifest Domain Matching**: The signed domain in `accountAssociation.payload` must match your hosting domain exactly (including subdomains)
- **Tunnel URLs**: Tunnel domains (ngrok, localtunnel) are excluded from discovery/search and some SDK actions may fail. For full testing, deploy to your production domain.
- **SDK Ready Call**: The app automatically calls `sdk.actions.ready()` on load to hide the splash screen
- **Image Requirements**: 
  - `imageUrl` (OG image): 3:2 aspect ratio recommended
  - `splashImageUrl` (icon): 200x200px recommended

### Production Deployment Checklist

- [ ] Deploy webapp to production URL (HTTPS)
- [ ] Update all `https://your-domain.com` references in `farcaster.json` and `layout.tsx`
- [ ] Sign manifest using [Farcaster Manifest Tool](https://farcaster.xyz/~/developers/mini-apps/manifest)
- [ ] Verify manifest at `/.well-known/farcaster.json` returns 200
- [ ] Test in [Preview Tool](https://farcaster.xyz/~/developers/mini-apps/preview)
- [ ] Register miniapp with Farcaster for discovery

For more information, see the [Farcaster Miniapp documentation](https://miniapps.farcaster.xyz/docs/guides/loading) and [Agent Checklist](https://miniapps.farcaster.xyz/docs/guides/agents-checklist).

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

