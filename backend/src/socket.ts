import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './middleware/auth';

export const setupSocketIO = (io: Server) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
      (socket as any).userId = decoded.userId;
      (socket as any).userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${(socket as any).userId}`);

    // Join event room
    socket.on('join-event', (eventId: string) => {
      socket.join(`event:${eventId}`);
      console.log(`User ${(socket as any).userId} joined event ${eventId}`);
    });

    // Leave event room
    socket.on('leave-event', (eventId: string) => {
      socket.leave(`event:${eventId}`);
      console.log(`User ${(socket as any).userId} left event ${eventId}`);
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${(socket as any).userId}`);
    });
  });

  // Helper function to broadcast to event room
  io.broadcastToEvent = (eventId: string, event: string, data: any) => {
    io.to(`event:${eventId}`).emit(event, data);
  };
};

declare module 'socket.io' {
  interface Server {
    broadcastToEvent(eventId: string, event: string, data: any): void;
  }
}
