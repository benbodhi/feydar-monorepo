import { Metadata } from 'next';
import { formatIPFSUrl } from '@feydar/shared/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://feydar.app';

async function getDeployment(address: string) {
  try {
    const response = await fetch(`${API_URL}/token/${address}`, {
      next: { revalidate: 60 }, // Revalidate every minute
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const deployment = await getDeployment(address);

  if (!deployment) {
    return {
      title: 'Deployment Not Found - Feydar',
    };
  }

  // Use token image if available, otherwise use default cover image
  const tokenImageUrl = deployment.currentImageUrl || deployment.tokenImage
    ? formatIPFSUrl(deployment.currentImageUrl || deployment.tokenImage || '')
    : `${APP_URL}/feydar-farcaster-miniapp-cover.png`;

  // For embed, use landscape cover image (feydar-farcaster-miniapp-cover.png)
  const embedImageUrl = `${APP_URL}/feydar-farcaster-miniapp-cover.png`;

  // Create embed metadata for this specific deployment
  const embed = {
    version: '1',
    imageUrl: embedImageUrl, // Use landscape cover for embeds
    button: {
      title: `View ${deployment.symbol}`,
      action: {
        type: 'launch_frame',
        name: 'Feydar',
        url: `${APP_URL}/token/${address}`,
        splashImageUrl: tokenImageUrl, // Use token image for splash
        splashBackgroundColor: '#000000',
      },
    },
  };

  return {
    metadataBase: new URL(APP_URL),
    title: `${deployment.name} (${deployment.symbol}) - Feydar`,
    description: `View ${deployment.name} (${deployment.symbol}) token deployment on FEY Protocol`,
    openGraph: {
      title: `${deployment.name} (${deployment.symbol})`,
      description: `Token deployment on FEY Protocol`,
      images: [embedImageUrl], // Use landscape cover for OG image
    },
    twitter: {
      card: 'summary_large_image',
      title: `${deployment.name} (${deployment.symbol})`,
      description: `Token deployment on FEY Protocol`,
      images: [embedImageUrl], // Use landscape cover for Twitter
    },
    other: {
      'fc:miniapp': JSON.stringify(embed),
    },
  };
}

export default function DeploymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

