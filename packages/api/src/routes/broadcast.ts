import { Router } from 'express';
import { broadcastDeployment } from './websocket';
import { TokenDeployment } from '@feydar/shared/types';

const router = Router();

/**
 * POST /api/broadcast
 * Internal endpoint for bot to trigger WebSocket broadcast
 */
router.post('/', async (req, res) => {
  try {
    const deployment = req.body as TokenDeployment;
    
    if (!deployment.tokenAddress) {
      return res.status(400).json({ error: 'Invalid deployment data' });
    }

    broadcastDeployment(deployment);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error broadcasting deployment:', error);
    res.status(500).json({ error: 'Failed to broadcast deployment' });
  }
});

export { router as broadcastRouter };

