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

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'FEYDAR - Catch new FEY tokens',
  description: 'Real-time FEY token launches! To ape or not to ape, that is the question.',
  icons: {
    icon: '/feydar-logo.png',
    shortcut: '/feydar-logo.png',
    apple: '/feydar-logo.png',
  },
  openGraph: {
    title: 'FEYDAR - Catch new FEY tokens',
    description: 'Real-time FEY token launches! To ape or not to ape, that is the question.',
    images: ['/feydar-cover.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FEYDAR - Catch new FEY tokens',
    description: 'Real-time FEY token launches! To ape or not to ape, that is the question.',
    images: ['/feydar-cover.png'],
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

