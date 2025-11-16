/**
 * Send notifications to all subscribed users for a new token deployment
 * Uses Neynar's API to send notifications to all users who have added the miniapp
 * 
 * Neynar automatically:
 * - Manages notification tokens
 * - Handles permission revokes
 * - Filters out disabled tokens
 * - Respects rate limits (1 per 30 seconds, 100 per day per token)
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
  const neynarApiKey = process.env.NEYNAR_API_KEY;
  
  if (!neynarApiKey) {
    console.error('[Notifications] NEYNAR_API_KEY is not set');
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
  const notification = {
    title: 'New FEY Token!',
    body: `${deployerName} created ${deployment.name} (${deployment.symbol}), click to ape right now and see new tokens deployed in real time from the timeline!`,
    url: `https://miniapp.feydar.app/token/${deployment.tokenAddress}?buy=true`,
    // Use notificationId for deduplication (24-hour window)
    notificationId: `fey-token-${deployment.tokenAddress}-${Date.now()}`,
  };

  try {
    console.log('[Notifications] Sending notification via Neynar API...');
    
    const response = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': neynarApiKey,
      },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Notifications] Neynar API error (${response.status}):`, errorText);
      return { sent: 0, failed: 1 };
    }

    const result = await response.json();
    
    // Neynar returns success status
    // The actual number of notifications sent is managed by Neynar
    // and can be viewed in their dashboard
    console.log('[Notifications] Notification sent successfully via Neynar');
    console.log('[Notifications] Response:', result);
    
    // Neynar handles sending to all subscribed users automatically
    // We return success, but exact counts are managed by Neynar
    return { sent: 1, failed: 0 };
  } catch (error: any) {
    console.error('[Notifications] Error sending notification via Neynar:', error);
    return { sent: 0, failed: 1 };
  }
}

