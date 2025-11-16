import { Router } from 'express';
import { sendDeploymentNotifications } from '../services/notifications';
import { TokenDeployment } from '@feydar/shared/types';

const router = Router();

/**
 * POST /api/notifications/send
 * Internal endpoint for bot to trigger notifications for a new deployment
 */
router.post('/send', async (req, res) => {
  try {
    const deployment = req.body as TokenDeployment;

    if (!deployment.tokenAddress || !deployment.name || !deployment.symbol) {
      return res.status(400).json({ error: 'Invalid deployment data' });
    }

    // Send notifications to all subscribed users
    const result = await sendDeploymentNotifications({
      name: deployment.name,
      symbol: deployment.symbol,
      tokenAddress: deployment.tokenAddress,
      deployer: deployment.deployer,
      deployerBasename: deployment.deployerBasename,
      deployerENS: deployment.deployerENS,
    });

    res.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error('Error sending notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

export { router as notificationsRouter };

