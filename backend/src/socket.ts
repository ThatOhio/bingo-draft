import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from './middleware/auth'

/**
 * Configures Socket.IO with auth middleware and connection handlers.
 */
export function setupSocketIO(io: Server): void {
	io.use((socket, next) => {
		const token = socket.handshake.auth.token
		if (!token) {
			return next(new Error('Authentication required'))
		}
		try {
			const decoded = jwt.verify(token, JWT_SECRET) as {
				userId: string
				role: string
			}
			socket.userId = decoded.userId
			socket.userRole = decoded.role
			next()
		} catch (err) {
			next(new Error('Invalid token'))
		}
	})
	io.on('connection', (socket) => {
		console.log(`User connected: ${socket.userId}`)
		socket.on('join-event', (eventId: string) => {
			socket.join(`event:${eventId}`)
			console.log(`User ${socket.userId} joined event ${eventId}`)
		})
		socket.on('leave-event', (eventId: string) => {
			socket.leave(`event:${eventId}`)
			console.log(`User ${socket.userId} left event ${eventId}`)
		})
		socket.on('disconnect', () => {
			console.log(`User disconnected: ${socket.userId}`)
		})
	})
	io.broadcastToEvent = (eventId: string, event: string, data: unknown) => {
		io.to(`event:${eventId}`).emit(event, data)
	}
}

declare module 'socket.io' {
	interface Socket {
		userId?: string
		userRole?: string
	}
	interface Server {
		broadcastToEvent(eventId: string, event: string, data: unknown): void
	}
}
