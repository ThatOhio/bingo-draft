import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_URL, getStoredToken } from '../lib/api-client'

interface SocketContextType {
	socket: Socket | null
	/** Whether the socket is currently connected. Consumers fall back to polling when false. */
	connected: boolean
	connectToEvent: (eventId: string) => void
	disconnectFromEvent: (eventId: string) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

interface SocketProviderProps {
	children: ReactNode
}

/**
 * Provides a Socket.IO client instance and join/leave helpers. Must wrap any
 * subtree that uses useSocket.
 *
 * Connects unconditionally, signed in or not: event rooms are read-only broadcast
 * channels, and gating them on a token used to force anonymous viewers onto HTTP polling
 * for data the socket already carries.
 *
 * The connection is deliberately not keyed on the token. The server does not use it for
 * room access, and re-keying would drop every viewer's socket on each 15-minute renewal.
 */
export function SocketProvider({ children }: SocketProviderProps) {
	const [socket, setSocket] = useState<Socket | null>(null)
	const [connected, setConnected] = useState(false)

	useEffect(() => {
		const token = getStoredToken()
		const newSocket = io(API_URL, {
			auth: token ? { token } : {},
		})

		newSocket.on('connect', () => setConnected(true))
		newSocket.on('disconnect', () => setConnected(false))

		setSocket(newSocket)

		return () => {
			newSocket.close()
			setConnected(false)
		}
	}, [])

	const connectToEvent = useCallback((eventId: string) => {
		if (socket) socket.emit('join-event', eventId)
	}, [socket])

	const disconnectFromEvent = useCallback((eventId: string) => {
		if (socket) socket.emit('leave-event', eventId)
	}, [socket])

	return (
		<SocketContext.Provider value={{ socket, connected, connectToEvent, disconnectFromEvent }}>
			{children}
		</SocketContext.Provider>
	)
}

/**
 * Returns the socket context. Throws if used outside SocketProvider.
 */
export function useSocket(): SocketContextType {
	const context = useContext(SocketContext)
	if (context === undefined) {
		throw new Error('useSocket must be used within a SocketProvider')
	}
	return context
}
