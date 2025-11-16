import { prisma } from '../db/client';

interface NotificationData {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a notification to a single user
 */
export async function sendNotificationToUser(
  token: string,
  url: string,
  notification: NotificationData
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          url: notification.url,
        },
        // Use notificationId for deduplication (24-hour window)
        notificationId: `${notification.title}-${Date.now()}`,
      }),
    });

    if (!response.ok) {
      console.error(`[Notifications] Failed to send to ${url}: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Notifications] Error sending to ${url}:`, error);
    return false;
  }
}

/**
 * Send notifications to all subscribed users for a new token deployment
 */
export async function sendDeploymentNotifications(
  deployment: {
    name: string;
    symbol: string;
    tokenAddress: string;
    deployer?: string;
    deployerBasename?: string | null;
    deployerENS?: string | null;
  }
): Promise<{ sent: number; failed: number }> {
  // Get all enabled notification subscriptions
  const subscriptions = await prisma.notificationSubscription.findMany({
    where: { enabled: true },
  });

  if (subscriptions.length === 0) {
    console.log('[Notifications] No active subscriptions');
    return { sent: 0, failed: 0 };
  }

  // Format deployer name (prefer basename, then ENS, then truncated address)
  const deployerName = deployment.deployerBasename 
    ? `${deployment.deployerBasename}.base.eth`
    : deployment.deployerENS 
    ? deployment.deployerENS
    : deployment.deployer
    ? deployment.deployer.slice(0, 6) + '...' + deployment.deployer.slice(-4)
    : 'Unknown';

  // Create notification content
  // URL includes ?buy=true to trigger buy button automatically
  const notification: NotificationData = {
    title: 'New FEY Token!',
    body: `${deployerName} created ${deployment.name} (${deployment.symbol}), click to ape right now and see new tokens deployed in real time from the timeline!`,
    url: `https://feydar.app/token/${deployment.tokenAddress}?buy=true`,
  };

  console.log(`[Notifications] Sending to ${subscriptions.length} subscribers...`);

  // Send notifications (with rate limiting consideration)
  // Rate limits: 1 per 30 seconds, 100 per day per token
  // We'll send to all, but the Farcaster client will handle rate limiting
  const results = await Promise.allSettled(
    subscriptions.map((sub: { token: string; url: string }) =>
      sendNotificationToUser(sub.token, sub.url, notification)
    )
  );

  const sent = results.filter((r: PromiseSettledResult<boolean>) => r.status === 'fulfilled' && r.value === true).length;
  const failed = results.length - sent;

  console.log(`[Notifications] Sent: ${sent}, Failed: ${failed}`);

  return { sent, failed };
}

