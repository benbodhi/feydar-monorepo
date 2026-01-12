import { WebSocketMessage, TokenDeployment } from '@feydar/shared/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export class DeploymentWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Set<(deployment: TokenDeployment) => void> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private shouldReconnect = true;

  connect() {
    // Don't connect if already connected or connecting
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    // Don't connect if we've exceeded max attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(`${WS_URL}/ws/deployments`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          if (message.type === 'deployment') {
            this.listeners.forEach((listener) => listener(message.data));
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.warn('WebSocket connection error. Check if API server is running on', WS_URL);
      };

      this.ws.onclose = (event) => {
        this.isConnecting = false;
        
        if (event.code === 1000) {
          console.log('WebSocket disconnected normally');
          return;
        }
        
        console.warn(`WebSocket closed with code ${event.code}: ${event.reason || 'Connection failed'}`);
        if (event.code === 1006) {
          console.warn('Connection refused. Is the API server running on', WS_URL, '?');
        }
        
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.attemptReconnect();
      }
    }
  }

  private attemptReconnect() {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect) {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.connect();
      }
    }, delay);
  }

  subscribe(listener: (deployment: TokenDeployment) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  disconnect() {
    this.shouldReconnect = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.isConnecting = false;
    this.listeners.clear();
  }
}

export const deploymentWS = new DeploymentWebSocket();

