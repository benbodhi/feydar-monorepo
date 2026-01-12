import { WebSocketServer, WebSocket } from 'ws';
import { prisma } from '../db/client';
import { WebSocketMessage } from '@feydar/shared/types';

// Store connected clients
const clients = new Set<WebSocket>();

/**
 * Broadcast a deployment to all connected clients
 */
export function broadcastDeployment(deployment: any) {
  const message: WebSocketMessage = {
    type: 'deployment',
    data: {
      id: deployment.id,
      tokenAddress: deployment.tokenAddress,
      name: deployment.name,
      symbol: deployment.symbol,
      deployer: deployment.deployer,
      deployerBasename: deployment.deployerBasename,
      deployerENS: deployment.deployerENS,
      transactionHash: deployment.transactionHash,
      tokenImage: deployment.tokenImage,
      creatorBps: deployment.creatorBps,
      feyStakersBps: deployment.feyStakersBps,
      poolId: deployment.poolId,
      blockNumber: Number(deployment.blockNumber),
      createdAt: deployment.createdAt,
    },
  };

  const payload = JSON.stringify(message);
  let sentCount = 0;
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
        sentCount++;
      } catch (error) {
        console.error('Error sending WebSocket message to client:', error);
      }
    }
  });
  
  if (sentCount > 0) {
    console.log(`[WebSocket] Broadcasted deployment ${deployment.tokenAddress} to ${sentCount} client(s)`);
  } else {
    console.warn(`[WebSocket] No connected clients to broadcast deployment ${deployment.tokenAddress}`);
  }
}

/**
 * WebSocket handler
 */
export function websocketHandler(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total clients: ${clients.size}`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  console.log('WebSocket server initialized');
}

