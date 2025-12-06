import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { TokenPayload } from '../types';
import { logger, loggers } from '../config/logger';
import { checkWebSocketRateLimit } from '../middleware/rateLimiting';

// JWT secret for authentication
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Connected clients map
const connectedClients = new Map<string, {
  socket: Socket;
  userId: string;
  joinedAt: Date;
  lastActivity: Date;
}>();

// Room management
const userRooms = new Map<string, Set<string>>();

/**
 * Authenticate WebSocket connection
 */
const authenticateSocket = async (socket: Socket): Promise<TokenPayload | null> => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

    if (payload.type !== 'access') {
      return null;
    }

    return payload;
  } catch (error) {
    loggers.websocket.error(error as Error, undefined, socket.id);
    return null;
  }
};

/**
 * Join user to their personal room and agent rooms
 */
const joinUserRooms = async (socket: Socket, userId: string, db: PrismaClient) => {
  try {
    // Join personal user room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);

    // Get user's agents and join their rooms
    const userAgents = await db.agent.findMany({
      where: { ownerId: userId },
      select: { id: true }
    });

    const agentRooms = userAgents.map(agent => `agent:${agent.id}`);
    socket.join(agentRooms);

    // Update user rooms tracking
    const rooms = new Set([userRoom, ...agentRooms]);
    userRooms.set(userId, rooms);

    loggers.websocket.connect(userId, socket.id);

    return { userRoom, agentRooms };
  } catch (error) {
    loggers.websocket.error(error as Error, userId, socket.id);
    throw error;
  }
};

/**
 * Handle WebSocket rate limiting
 */
const handleRateLimit = async (socket: Socket, userId: string, eventType: string): Promise<boolean> => {
  const rateLimitKey = `ws:${userId}:${eventType}`;
  const allowed = await checkWebSocketRateLimit(rateLimitKey);

  if (!allowed) {
    socket.emit('error', {
      type: 'rate_limit_exceeded',
      message: 'Too many requests, please slow down',
      eventType,
    });

    loggers.security.rateLimitExceeded(socket.handshake.address, `ws:${eventType}`);
    return false;
  }

  return true;
};

/**
 * Initialize WebSocket server
 */
export const initializeWebSocket = (io: Server, db: PrismaClient): void => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const user = await authenticateSocket(socket);

      if (!user) {
        const error = new Error('Authentication failed');
        error.message = 'Invalid or missing authentication token';
        return next(error);
      }

      // Attach user info to socket
      socket.data.user = user;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  // Connection handler
  io.on('connection', async (socket: Socket) => {
    try {
      const user = socket.data.user as TokenPayload;
      const userId = user.id;

      // Join user to appropriate rooms
      const { userRoom, agentRooms } = await joinUserRooms(socket, userId, db);

      // Track connected client
      connectedClients.set(socket.id, {
        socket,
        userId,
        joinedAt: new Date(),
        lastActivity: new Date(),
      });

      // Send welcome message
      socket.emit('connected', {
        userId,
        rooms: [userRoom, ...agentRooms],
        timestamp: new Date(),
        message: 'Connected to AETERNA WebSocket server',
      });

      // Ping-Pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Agent status updates
      socket.on('agent_status_request', async (data) => {
        try {
          if (!await handleRateLimit(socket, userId, 'agent_status_request')) return;

          const { agentId } = data;

          // Verify agent ownership
          const agent = await db.agent.findUnique({
            where: { id: agentId },
            select: {
              id: true,
              ownerId: true,
              status: true,
              lastActiveAt: true,
              tasksCompleted: true,
              successRate: true,
            }
          });

          if (!agent || agent.ownerId !== userId) {
            socket.emit('error', {
              type: 'access_denied',
              message: 'Agent not found or access denied',
              agentId,
            });
            return;
          }

          socket.emit('agent_status', {
            agentId: agent.id,
            status: agent.status,
            lastActiveAt: agent.lastActiveAt,
            tasksCompleted: agent.tasksCompleted,
            successRate: agent.successRate,
            timestamp: new Date(),
          });

        } catch (error) {
          loggers.websocket.error(error as Error, userId, socket.id);
          socket.emit('error', {
            type: 'server_error',
            message: 'Failed to fetch agent status',
          });
        }
      });

      // Memory updates
      socket.on('memory_subscribe', async (data) => {
        try {
          if (!await handleRateLimit(socket, userId, 'memory_subscribe')) return;

          const { agentId } = data;

          // Verify agent ownership
          const agent = await db.agent.findUnique({
            where: { id: agentId },
            select: { id: true, ownerId: true }
          });

          if (!agent || agent.ownerId !== userId) {
            socket.emit('error', {
              type: 'access_denied',
              message: 'Agent not found or access denied',
              agentId,
            });
            return;
          }

          // Join agent-specific memory room
          const memoryRoom = `agent:${agentId}:memories`;
          socket.join(memoryRoom);

          socket.emit('memory_subscribed', {
            agentId,
            room: memoryRoom,
            timestamp: new Date(),
          });

        } catch (error) {
          loggers.websocket.error(error as Error, userId, socket.id);
          socket.emit('error', {
            type: 'server_error',
            message: 'Failed to subscribe to memory updates',
          });
        }
      });

      // Transaction updates
      socket.on('transaction_subscribe', async () => {
        try {
          if (!await handleRateLimit(socket, userId, 'transaction_subscribe')) return;

          // Join user transaction room
          const transactionRoom = `user:${userId}:transactions`;
          socket.join(transactionRoom);

          socket.emit('transaction_subscribed', {
            room: transactionRoom,
            timestamp: new Date(),
          });

        } catch (error) {
          loggers.websocket.error(error as Error, userId, socket.id);
          socket.emit('error', {
            type: 'server_error',
            message: 'Failed to subscribe to transaction updates',
          });
        }
      });

      // Chat/notification system
      socket.on('send_notification', async (data) => {
        try {
          if (!await handleRateLimit(socket, userId, 'send_notification')) return;

          const { targetUserId, type, message, data: notificationData } = data;

          // Basic validation
          if (!targetUserId || !type || !message) {
            socket.emit('error', {
              type: 'validation_error',
              message: 'Missing required fields',
            });
            return;
          }

          // Create notification record
          await db.auditLog.create({
            data: {
              action: 'notification_sent',
              entityType: 'notification',
              entityId: targetUserId,
              userId: userId,
              details: {
                type,
                message,
                data: notificationData,
                from: userId,
                to: targetUserId,
              }
            }
          });

          // Send to target user
          io.to(`user:${targetUserId}`).emit('notification', {
            type,
            message,
            data: notificationData,
            from: userId,
            timestamp: new Date(),
          });

          // Confirm to sender
          socket.emit('notification_sent', {
            targetUserId,
            type,
            timestamp: new Date(),
          });

        } catch (error) {
          loggers.websocket.error(error as Error, userId, socket.id);
          socket.emit('error', {
            type: 'server_error',
            message: 'Failed to send notification',
          });
        }
      });

      // Update last activity on any message
      socket.onAny(() => {
        const client = connectedClients.get(socket.id);
        if (client) {
          client.lastActivity = new Date();
        }
      });

      // Disconnect handler
      socket.on('disconnect', (reason) => {
        // Remove from connected clients
        connectedClients.delete(socket.id);
        userRooms.delete(userId);

        loggers.websocket.disconnect(userId, socket.id, reason);

        // Broadcast user offline status (if needed)
        socket.broadcast.emit('user_offline', {
          userId,
          timestamp: new Date(),
        });
      });

      // Error handler
      socket.on('error', (error) => {
        loggers.websocket.error(error, userId, socket.id);
      });

    } catch (error) {
      loggers.websocket.error(error as Error, undefined, socket.id);
      socket.disconnect(true);
    }
  });

  // Cleanup inactive connections every 5 minutes
  setInterval(() => {
    const now = new Date();
    const timeout = 30 * 60 * 1000; // 30 minutes

    for (const [socketId, client] of connectedClients.entries()) {
      if (now.getTime() - client.lastActivity.getTime() > timeout) {
        logger.info('Disconnecting inactive WebSocket client', {
          socketId,
          userId: client.userId,
          lastActivity: client.lastActivity,
        });

        client.socket.disconnect(true);
        connectedClients.delete(socketId);
      }
    }
  }, 5 * 60 * 1000);

  // Broadcast system status updates
  const broadcastSystemStatus = () => {
    const status = {
      connectedClients: connectedClients.size,
      uptime: process.uptime(),
      timestamp: new Date(),
    };

    io.emit('system_status', status);
  };

  // Broadcast system status every 30 seconds
  setInterval(broadcastSystemStatus, 30000);

  logger.info('WebSocket server initialized successfully');
};

/**
 * Broadcast message to specific user
 */
export const broadcastToUser = (io: Server, userId: string, event: string, data: any): void => {
  io.to(`user:${userId}`).emit(event, {
    ...data,
    timestamp: new Date(),
  });
};

/**
 * Broadcast message to agent subscribers
 */
export const broadcastToAgent = (io: Server, agentId: string, event: string, data: any): void => {
  io.to(`agent:${agentId}`).emit(event, {
    ...data,
    agentId,
    timestamp: new Date(),
  });
};

/**
 * Get connected clients count
 */
export const getConnectedClientsCount = (): number => {
  return connectedClients.size;
};

/**
 * Get user's connected sockets
 */
export const getUserSockets = (userId: string): Socket[] => {
  const sockets: Socket[] = [];

  for (const client of connectedClients.values()) {
    if (client.userId === userId) {
      sockets.push(client.socket);
    }
  }

  return sockets;
};

/**
 * Disconnect user's sockets
 */
export const disconnectUser = (userId: string, reason?: string): void => {
  const userSockets = getUserSockets(userId);

  userSockets.forEach(socket => {
    socket.emit('force_disconnect', {
      reason: reason || 'Admin disconnection',
      timestamp: new Date(),
    });

    socket.disconnect(true);
  });

  logger.info('User forcibly disconnected from WebSocket', { userId, reason });
};

export default {
  initializeWebSocket,
  broadcastToUser,
  broadcastToAgent,
  getConnectedClientsCount,
  getUserSockets,
  disconnectUser,
};