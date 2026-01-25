import express from 'express'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import prisma from '../db'
import { JWT_SECRET } from '../middleware/auth'

const router = express.Router()

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || ''
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''
const DISCORD_REDIRECT_URI =
	process.env.DISCORD_REDIRECT_URI ||
	'http://localhost:3001/api/auth/discord/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Discord OAuth callback
router.get('/discord/callback', async (req, res) => {
	try {
		const { code, state } = req.query
		if (!code) {
			return res.redirect(`${FRONTEND_URL}/login?error=no_code`)
		}
		const tokenResponse = await axios.post(
			'https://discord.com/api/oauth2/token',
			new URLSearchParams({
				client_id: DISCORD_CLIENT_ID,
				client_secret: DISCORD_CLIENT_SECRET,
				grant_type: 'authorization_code',
				code: code as string,
				redirect_uri: DISCORD_REDIRECT_URI,
			}),
			{
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			},
		)
		const { access_token } = tokenResponse.data
		const userResponse = await axios.get('https://discord.com/api/users/@me', {
			headers: { Authorization: `Bearer ${access_token}` },
		})
		const discordUser = userResponse.data
		const discordId = discordUser.id
		const discordUsername = discordUser.username
		let user = await prisma.user.findUnique({ where: { discordId } })
		if (!user) {
			user = await prisma.user.create({
				data: { discordId, discordUsername, role: 'USER' },
			})
		} else {
			user = await prisma.user.update({
				where: { id: user.id },
				data: { discordUsername },
			})
		}
		const token = jwt.sign(
			{ userId: user.id, role: user.role },
			JWT_SECRET,
			{ expiresIn: '7d' },
		)
		let eventCode: string | undefined
		if (state && typeof state === 'string') {
			try {
				const decoded = JSON.parse(
					Buffer.from(state, 'base64').toString('utf8'),
				)
				if (decoded?.eventCode && typeof decoded.eventCode === 'string') {
					eventCode = decoded.eventCode
				}
			} catch (_err) {
				// invalid state, ignore
			}
		}
		const callbackUrl = new URL(`${FRONTEND_URL}/auth/callback`)
		callbackUrl.searchParams.set('token', token)
		if (eventCode) callbackUrl.searchParams.set('eventCode', eventCode)
		res.redirect(callbackUrl.toString())
	} catch (err) {
		console.error('Discord OAuth error:', err)
		res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`)
	}
})

router.get('/discord/url', (req, res) => {
	const eventCode = req.query.eventCode as string | undefined
	const state = eventCode
		? Buffer.from(JSON.stringify({ eventCode })).toString('base64')
		: undefined
	const params = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		redirect_uri: DISCORD_REDIRECT_URI,
		response_type: 'code',
		scope: 'identify',
		...(state && { state }),
	})
	const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`
	res.json({ url: discordAuthUrl })
})

router.get('/me', async (req, res) => {
	try {
		const token = req.headers.authorization?.replace('Bearer ', '')
		if (!token) {
			return res.status(401).json({ error: 'Authentication required' })
		}
		const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
			select: {
				id: true,
				discordId: true,
				discordUsername: true,
				role: true,
			},
		})
		if (!user) {
			return res.status(404).json({ error: 'User not found' })
		}
		res.json({ user })
	} catch (_err) {
		res.status(401).json({ error: 'Invalid token' })
	}
})

export default router
