import { Router } from 'express';
import { prisma } from '../db/client';
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
  ParseWebhookEvent,
} from '@farcaster/miniapp-node';

const router = Router();

/**
 * POST /api/webhook
 * Webhook endpoint for Farcaster miniapp events
 * Handles: miniapp_added, miniapp_removed, notifications_enabled, notifications_disabled
 */
router.post('/', async (req, res) => {
  try {
    // Parse and verify the webhook event
    const data = await parseWebhookEvent(req.body, verifyAppKeyWithNeynar);

    const { event, fid } = data;

    // Type guard to check event type
    const eventType = 'event' in event ? event.event : (event as any).type || 'unknown';
    console.log(`[Webhook] Received event: ${eventType} for FID: ${fid}`);

    // Handle different event types
    if (eventType === 'miniapp_added' || (event as any).event === 'miniapp_added') {
      const miniappEvent = event as { event: 'miniapp_added'; notificationDetails?: { url: string; token: string; } };
      // User added the miniapp - store notification details if available
      if (miniappEvent.notificationDetails) {
          await prisma.notificationSubscription.upsert({
            where: {
              fid_token: {
                fid: fid,
                token: miniappEvent.notificationDetails.token,
              },
            },
            update: {
              token: miniappEvent.notificationDetails.token,
              url: miniappEvent.notificationDetails.url,
              enabled: true,
              clientAppId: (event as any).clientAppId || null,
              updatedAt: new Date(),
            },
            create: {
              fid: fid,
              token: miniappEvent.notificationDetails.token,
              url: miniappEvent.notificationDetails.url,
              enabled: true,
              clientAppId: (event as any).clientAppId || null,
            },
          });
          console.log(`[Webhook] Stored notification subscription for FID: ${fid}`);
        }
    } else if (eventType === 'miniapp_removed' || (event as any).event === 'miniapp_removed') {
      // User removed the miniapp - disable all their subscriptions
      await prisma.notificationSubscription.updateMany({
        where: { fid },
        data: { enabled: false, updatedAt: new Date() },
      });
      console.log(`[Webhook] Disabled notifications for FID: ${fid}`);
    } else if (eventType === 'notifications_enabled' || (event as any).event === 'notifications_enabled') {
      const notificationsEvent = event as { event: 'notifications_enabled'; notificationDetails: { url: string; token: string; } };
      // User enabled notifications - store/update token
      if (notificationsEvent.notificationDetails) {
        await prisma.notificationSubscription.upsert({
          where: {
            fid_token: {
              fid,
              token: notificationsEvent.notificationDetails.token,
            },
          },
          update: {
            token: notificationsEvent.notificationDetails.token,
            url: notificationsEvent.notificationDetails.url,
            enabled: true,
            clientAppId: (event as any).clientAppId || null,
            updatedAt: new Date(),
          },
          create: {
            fid: fid,
            token: notificationsEvent.notificationDetails.token,
            url: notificationsEvent.notificationDetails.url,
            enabled: true,
            clientAppId: (event as any).clientAppId || null,
          },
        });
        console.log(`[Webhook] Enabled notifications for FID: ${fid}`);
      }
    } else if (eventType === 'notifications_disabled' || (event as any).event === 'notifications_disabled') {
      const notificationsEvent = event as { event: 'notifications_disabled'; notificationDetails?: { url: string; token: string; } };
      // User disabled notifications - disable this specific token
      if (notificationsEvent.notificationDetails) {
        await prisma.notificationSubscription.updateMany({
          where: {
            fid: fid,
            token: notificationsEvent.notificationDetails.token,
          },
          data: { enabled: false, updatedAt: new Date() },
        });
        console.log(`[Webhook] Disabled notifications for FID: ${fid}, token: ${notificationsEvent.notificationDetails.token}`);
      }
    } else {
      console.warn(`[Webhook] Unknown event type: ${eventType}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    // Check if error is from ParseWebhookEvent
    if (error && typeof error === 'object' && 'name' in error) {
      const parseError = error as { name: string; message?: string };
      console.error(`[Webhook] Parse error: ${parseError.name}`, parseError.message);
      
      // Return appropriate status based on error type
      switch (parseError.name) {
        case 'VerifyJsonFarcasterSignature.InvalidDataError':
        case 'VerifyJsonFarcasterSignature.InvalidEventDataError':
          return res.status(400).json({ error: 'Invalid request data' });
        case 'VerifyJsonFarcasterSignature.InvalidAppKeyError':
          return res.status(401).json({ error: 'Invalid app key' });
        case 'VerifyJsonFarcasterSignature.VerifyAppKeyError':
          return res.status(500).json({ error: 'Verification error' });
        default:
          return res.status(400).json({ error: 'Invalid request' });
      }
    }

    console.error('[Webhook] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as webhookRouter };

