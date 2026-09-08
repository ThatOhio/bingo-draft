import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from './middleware/auth'

/**
 * Configures Socket.IO with auth middleware and connection handlers.
 *
 * Authentication is optional. Event rooms are read-only broadcast channels — the only
 * client-to-server messages are join-event and leave-event, and the draft state they
 * carry is already served publicly by GET /api/draft/:eventId/state. Requiring a token
 * only meant anonymous viewers fell back to HTTP polling for data the socket already had.
 */
export function setupSocketIO(io: Server): void {
	io.use((socket, next) => {
		const token = socket.handshake.auth.token
		if (!token) {
			return next()
		}
		try {
			const decoded = jwt.verify(token, JWT_SECRET) as {
				userId: string
				role: string
			}
			socket.userId = decoded.userId
			socket.userRole = decoded.role
		} catch (err) {
			// Connect anonymously rather than refusing: a stale token should degrade a
			// viewer to read-only, not cut them off from live updates entirely.
			console.error('Socket auth error:', err)
		}
		next()
	})
	io.on('connection', (socket) => {
		socket.on('join-event', (eventId: string) => {
			if (typeof eventId !== 'string' || eventId.length === 0) {
				return
			}
			socket.join(`event:${eventId}`)
		})
		socket.on('leave-event', (eventId: string) => {
			if (typeof eventId !== 'string' || eventId.length === 0) {
				return
			}
			socket.leave(`event:${eventId}`)
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
