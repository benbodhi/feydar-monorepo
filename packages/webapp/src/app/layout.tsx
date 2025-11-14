import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

// Farcaster miniapp embed metadata for sharing and discovery
// This enables the app to be shared and discovered in Farcaster clients
const frame = {
  version: '1', // Must be "1", not "next"
  imageUrl: 'https://your-domain.com/og-image.png', // 3:2 aspect ratio recommended
  button: {
    title: 'Open Feydar', // Max 32 characters
    action: {
      type: 'launch_frame',
      name: 'Feydar',
      url: 'https://your-domain.com', // Optional, defaults to current URL
      splashImageUrl: 'https://your-domain.com/icon.png', // 200x200px recommended
      splashBackgroundColor: '#000000',
    },
  },
};

export const metadata: Metadata = {
  title: 'Feydar - FEY Protocol Token Deployments',
  description: 'Monitor FEY Protocol token deployments on Base in real-time',
  openGraph: {
    title: 'Feydar - FEY Protocol Token Deployments',
    description: 'Monitor FEY Protocol token deployments on Base in real-time',
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

