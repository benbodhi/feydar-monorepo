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
  // Log incoming request for debugging
  console.log('[Webhook] Received POST request');
  console.log('[Webhook] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[Webhook] Body:', JSON.stringify(req.body, null, 2));
  
  let data: { event: any; fid: number };
  let verificationSucceeded = false;

  // Try to parse and verify the webhook event
  try {
    data = await parseWebhookEvent(req.body, verifyAppKeyWithNeynar);
    verificationSucceeded = true;
    console.log('[Webhook] Event verification succeeded');
  } catch (verifyError: any) {
    // If verification fails, try to parse manually (with warning)
    console.warn('[Webhook] Verification failed, attempting manual parse:', verifyError?.message);
    
    try {
      // Manually decode the payload to extract event data
      // The payload is base64 encoded JSON
      const payload = Buffer.from(req.body.payload, 'base64').toString('utf-8');
      const eventData = JSON.parse(payload);
      
      // Decode header to get FID
      const header = Buffer.from(req.body.header, 'base64').toString('utf-8');
      const headerData = JSON.parse(header);
      const fid = headerData.fid;
      
      // Map frame_added/frame_removed to miniapp_added/miniapp_removed
      let eventType = eventData.event;
      if (eventType === 'frame_added') {
        eventType = 'miniapp_added';
      } else if (eventType === 'frame_removed') {
        eventType = 'miniapp_removed';
      }
      
      data = {
        fid,
        event: {
          event: eventType,
          ...eventData,
        },
      };
      
      console.warn(`[Webhook] Manual parse succeeded - FID: ${fid}, Event: ${eventType} (WARNING: Verification bypassed)`);
    } catch (parseError) {
      console.error('[Webhook] Both verification and manual parse failed:', parseError);
      return res.status(400).json({ error: 'Failed to parse webhook event' });
    }
  }

  try {
    const { event, fid } = data;

    // Type guard to check event type
    const eventType = 'event' in event ? event.event : (event as any).type || 'unknown';
    console.log(`[Webhook] Received event: ${eventType} for FID: ${fid}`);

    // Handle different event types
    // Support both miniapp_added and frame_added (frame_added is the actual event name)
    if (eventType === 'miniapp_added' || eventType === 'frame_added' || (event as any).event === 'miniapp_added' || (event as any).event === 'frame_added') {
      const miniappEvent = event as { event: 'miniapp_added'; notificationDetails?: { url: string; token: string; } };
      console.log(`[Webhook] miniapp_added event - notificationDetails:`, miniappEvent.notificationDetails ? 'present' : 'missing');
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
        } else {
          console.warn(`[Webhook] miniapp_added event received but notificationDetails are missing - subscription not created for FID: ${fid}`);
        }
    } else if (eventType === 'miniapp_removed' || eventType === 'frame_removed' || (event as any).event === 'miniapp_removed' || (event as any).event === 'frame_removed') {
      // User removed the miniapp - disable all their subscriptions
      await prisma.notificationSubscription.updateMany({
        where: { fid },
        data: { enabled: false, updatedAt: new Date() },
      });
      console.log(`[Webhook] Disabled notifications for FID: ${fid}`);
    } else if (eventType === 'notifications_enabled' || (event as any).event === 'notifications_enabled') {
      const notificationsEvent = event as { event: 'notifications_enabled'; notificationDetails: { url: string; token: string; } };
      console.log(`[Webhook] notifications_enabled event - notificationDetails:`, notificationsEvent.notificationDetails ? 'present' : 'missing');
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
      } else {
        console.warn(`[Webhook] notifications_enabled event received but notificationDetails are missing - subscription not created for FID: ${fid}`);
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

