import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './auth-context'

interface SocketContextType {
	socket: Socket | null
	connectToEvent: (eventId: string) => void
	disconnectFromEvent: (eventId: string) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface SocketProviderProps {
	children: ReactNode
}

export function SocketProvider({ children }: SocketProviderProps) {
	const { token } = useAuth()
	const [socket, setSocket] = useState<Socket | null>(null)

	useEffect(() => {
	  if (token) {
	    const newSocket = io(API_URL, {
	      auth: {
	        token,
	      },
	    })

	    newSocket.on('connect', () => {
	      console.log('Socket connected')
	    })

	    newSocket.on('disconnect', () => {
	      console.log('Socket disconnected')
	    })

	    setSocket(newSocket)

	    return () => {
	      newSocket.close()
	    }
	  }
	}, [token])

	const connectToEvent = (eventId: string) => {
	  if (socket) {
	    socket.emit('join-event', eventId)
	  }
	}

	const disconnectFromEvent = (eventId: string) => {
	  if (socket) {
	    socket.emit('leave-event', eventId)
	  }
	}

	return (
	  <SocketContext.Provider value={{ socket, connectToEvent, disconnectFromEvent }}>
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
