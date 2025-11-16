import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

// Ensure URL has protocol
function ensureProtocol(url: string): string {
  if (!url) return 'https://feydar.app';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
}

const APP_URL = ensureProtocol(process.env.NEXT_PUBLIC_APP_URL || 'https://feydar.app');

// Farcaster miniapp embed metadata for sharing and discovery
// This enables the app to be shared and discovered in Farcaster clients
const frame = {
  version: '1', // Must be "1", not "next"
  imageUrl: `${APP_URL}/feydar-farcaster-miniapp-cover.png`, // Landscape cover image
  button: {
    title: 'Open Feydar', // Max 32 characters
    action: {
      type: 'launch_frame',
      name: 'Feydar',
      url: APP_URL, // Optional, defaults to current URL
      splashImageUrl: `${APP_URL}/feydar-farcaster-miniapp-splash.png`, // Splash screen
      splashBackgroundColor: '#000000',
    },
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Feydar - FEY Protocol Token Deployments',
  description: 'Monitor FEY Protocol token deployments on Base in real-time',
  icons: {
    icon: '/feydar-logo.png',
    shortcut: '/feydar-logo.png',
    apple: '/feydar-logo.png',
  },
  openGraph: {
    title: 'Feydar - FEY Protocol Token Deployments',
    description: 'Monitor FEY Protocol token deployments on Base in real-time',
    images: ['/feydar-farcaster-miniapp-cover.png'], // Use landscape cover for embeds
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Feydar - FEY Protocol Token Deployments',
    description: 'Monitor FEY Protocol token deployments on Base in real-time',
    images: ['/feydar-farcaster-miniapp-cover.png'], // Use landscape cover for Twitter
  },
  other: {
    'fc:miniapp': JSON.stringify(frame),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

