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
      totalSupply: deployment.totalSupply,
      deployer: deployment.deployer,
      deployerName: deployment.deployerName,
      transactionHash: deployment.transactionHash,
      tokenImage: deployment.tokenImage,
      creatorBps: deployment.creatorBps,
      feyStakersBps: deployment.feyStakersBps,
      blockNumber: Number(deployment.blockNumber),
      createdAt: deployment.createdAt,
    },
  };

  const payload = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/**
 * WebSocket handler
 */
export function websocketHandler(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total clients: ${clients.size}`);

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'pong') {
          // Heartbeat response
          return;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      clearInterval(pingInterval);
      console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
      clearInterval(pingInterval);
    });
  });

  console.log('WebSocket server initialized');
}

