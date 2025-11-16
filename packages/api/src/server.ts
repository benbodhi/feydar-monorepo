import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { prisma } from './db/client';
import { deploymentsRouter } from './routes/deployments';
import { broadcastRouter } from './routes/broadcast';
import { priceRouter } from './routes/price';
import { webhookRouter } from './routes/webhook';
import { notificationsRouter } from './routes/notifications';
import { websocketHandler } from './routes/websocket';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/token', deploymentsRouter);
app.use('/api/broadcast', broadcastRouter);
app.use('/api/price', priceRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/notifications', notificationsRouter);

// Create HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws/deployments' });
websocketHandler(wss);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`);
  console.log(`📡 WebSocket server available at ws://localhost:${PORT}/ws/deployments`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

