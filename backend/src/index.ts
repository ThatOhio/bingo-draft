// Must come first: routes/auth.ts and middleware/auth.ts read process.env at module
// scope, and imports are evaluated before any statement in this file's body.
import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import authRoutes from './routes/auth'
import eventRoutes from './routes/events'
import userRoutes from './routes/users'
import draftRoutes from './routes/draft'
import statsRoutes from './routes/stats'
import { setupSocketIO } from './socket'
import { setIO } from './socketManager'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
	cors: {
		origin: process.env.FRONTEND_URL || 'http://localhost:5173',
		methods: ['GET', 'POST'],
		credentials: true,
	},
})

const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
	origin: process.env.FRONTEND_URL || 'http://localhost:5173',
	credentials: true,
}))
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/users', userRoutes)
app.use('/api/draft', draftRoutes)
app.use('/api/stats', statsRoutes)

// Health check
app.get('/api/health', (_req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Setup Socket.IO
setupSocketIO(io)
setIO(io)

httpServer.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`)
})
