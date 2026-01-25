import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

/**
 * Express Request extended with user info set by the authenticate middleware.
 */
export interface AuthRequest extends Request {
	userId?: string
	userRole?: string
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

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
 * Returns middleware that requires the user to have one of the given roles.
 */
export function requireRole(...roles: string[]) {
	return (req: AuthRequest, res: Response, next: NextFunction): void => {
		if (!req.userRole || !roles.includes(req.userRole)) {
			res.status(403).json({ error: 'Insufficient permissions' })
			return
		}
		next()
	}
}

export { JWT_SECRET }
