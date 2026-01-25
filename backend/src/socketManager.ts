import { Server } from 'socket.io'

let ioInstance: Server | null = null

export function setIO(io: Server): void {
	ioInstance = io
}

/**
 * Returns the Socket.IO server instance. Throws if not initialized.
 */
export function getIO(): Server {
	if (!ioInstance) {
		throw new Error('Socket.IO not initialized')
	}
	return ioInstance
}
