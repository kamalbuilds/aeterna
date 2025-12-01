import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WebSocketMessage } from '../types';
import { useAgentStore } from '../store/useAgentStore';
import toast from 'react-hot-toast';

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  subscribe: (event: string, handler: (data: any) => void) => () => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
  const {
    url = process.env.REACT_APP_WS_URL || 'ws://localhost:3001',
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const reconnectCountRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const {
    addAgent,
    updateAgent,
    addMemory,
    addTransaction,
    updateTransaction,
    setNetworkStats,
  } = useAgentStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    try {
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnectionAttempts: reconnectAttempts,
        reconnectionDelay: reconnectDelay,
      });

      socket.on('connect', () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectCountRef.current = 0;
        toast.success('Connected to AETERNA network');
      });

      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setIsConnected(false);

        if (reason === 'io server disconnect') {
          // Server forcefully disconnected, need to reconnect manually
          setTimeout(() => {
            if (reconnectCountRef.current < reconnectAttempts) {
              reconnectCountRef.current++;
              socket.connect();
            }
          }, reconnectDelay);
        }
      });

      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setIsConnected(false);
        toast.error('Failed to connect to AETERNA network');
      });

      // Handle AETERNA-specific events
      socket.on('agent_created', (data) => {
        console.log('New agent created:', data);
        addAgent(data.agent);
        setLastMessage({
          type: 'agent_created',
          data,
          timestamp: new Date(),
        });
        toast.success(`New agent "${data.agent.name}" created!`);
      });

      socket.on('agent_updated', (data) => {
        console.log('Agent updated:', data);
        updateAgent(data.agentId, data.updates);
        setLastMessage({
          type: 'agent_updated',
          data,
          timestamp: new Date(),
        });
      });

      socket.on('memory_created', (data) => {
        console.log('New memory created:', data);
        addMemory(data.memory);
        setLastMessage({
          type: 'memory_created',
          data,
          timestamp: new Date(),
        });
      });

      socket.on('transaction', (data) => {
        console.log('New transaction:', data);
        if (data.transaction.status === 'pending') {
          addTransaction(data.transaction);
        } else {
          updateTransaction(data.transaction.id, data.transaction);
        }
        setLastMessage({
          type: 'transaction',
          data,
          timestamp: new Date(),
        });

        if (data.transaction.status === 'completed') {
          toast.success('Transaction completed!');
        } else if (data.transaction.status === 'failed') {
          toast.error('Transaction failed!');
        }
      });

      socket.on('network_stats', (data) => {
        console.log('Network stats updated:', data);
        setNetworkStats(data.stats);
        setLastMessage({
          type: 'network_stats',
          data,
          timestamp: new Date(),
        });
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      toast.error('Failed to initialize network connection');
    }
  }, [url, reconnectAttempts, reconnectDelay, addAgent, updateAgent, addMemory, addTransaction, updateTransaction, setNetworkStats]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      toast.info('Disconnected from AETERNA network');
    }
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  }, []);

  const subscribe = useCallback((event: string, handler: (data: any) => void) => {
    if (!socketRef.current) {
      console.warn('Socket not initialized, cannot subscribe to event:', event);
      return () => {};
    }

    socketRef.current.on(event, handler);

    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, handler);
      }
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    lastMessage,
    connect,
    disconnect,
    emit,
    subscribe,
  };
};