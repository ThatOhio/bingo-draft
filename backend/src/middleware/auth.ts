import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../db'

/**
 * The requesting user as stored in the database. Always prefer this over the JWT claims
 * when making an authorization decision.
 */
export interface CurrentUser {
	id: string
	discordUsername: string
	role: string
}

/**
 * Express Request extended with user info set by the authenticate middleware.
 */
export interface AuthRequest extends Request {
	userId?: string
	/**
	 * Role claim carried by the JWT. Advisory only: it reflects the role at sign-in and
	 * goes stale when an admin is promoted or demoted. Use loadCurrentUser instead.
	 */
	userRole?: string
	/** Memoised result of loadCurrentUser for this request. */
	currentUser?: CurrentUser | null
}

const DEFAULT_JWT_SECRET = 'your-secret-key-change-in-production'
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET

// Fail loudly rather than signing production tokens with a secret that is published in
// the README. This runs at import time, so a misconfigured deploy never starts serving.
if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
	throw new Error(
		'JWT_SECRET is unset or still the default value. Refusing to start in production.',
	)
}

/**
 * Authenticates the request using the Bearer JWT in the Authorization header.
 */
export function authenticate(
	req: AuthRequest,
	res: Response,
	next: NextFunction,
): void {
	try {
		const token = req.headers.authorization?.replace('Bearer ', '')
		if (!token) {
			res.status(401).json({ error: 'Authentication required' })
			return
		}
		const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string }
		req.userId = decoded.userId
		req.userRole = decoded.role
		next()
	} catch (err) {
		console.error('Auth error:', err)
		res.status(401).json({ error: 'Invalid or expired token' })
	}
}

/**
 * Loads the requesting user from the database, memoised for the lifetime of the request
 * so that authenticate + requireRole + a handler cost one lookup rather than three.
 *
 * Roles are read here rather than from the token so promoting or demoting a user takes
 * effect on their very next request instead of when their token expires.
 */
export async function loadCurrentUser(req: AuthRequest): Promise<CurrentUser | null> {
	if (req.currentUser !== undefined) {
		return req.currentUser
	}
	if (!req.userId) {
		req.currentUser = null
		return null
	}
	const user = await prisma.user.findUnique({
		where: { id: req.userId },
		select: { id: true, discordUsername: true, role: true },
	})
	req.currentUser = user
	return user
}

/**
 * Returns middleware that requires the user to hold one of the given roles, checked
 * against the database rather than the token claim.
 */
export function requireRole(...roles: string[]) {
	return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
		try {
			const user = await loadCurrentUser(req)
			if (!user) {
				res.status(401).json({ error: 'Authentication required' })
				return
			}
			if (!roles.includes(user.role)) {
				res.status(403).json({ error: 'Insufficient permissions' })
				return
			}
			next()
		} catch (err) {
			console.error('Role check error:', err)
			res.status(500).json({ error: 'Failed to verify permissions' })
		}
	}
}

/**
 * True when the requesting user is an admin according to the database.
 * For handlers that branch on role rather than gating on it outright.
 */
export async function isAdmin(req: AuthRequest): Promise<boolean> {
	const user = await loadCurrentUser(req)
	return user?.role === 'ADMIN'
}

export { JWT_SECRET }
