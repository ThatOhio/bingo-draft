import express from 'express'
import { z } from 'zod'
import prisma from '../db'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = express.Router()

const updateRoleSchema = z.object({
	role: z.enum(['USER', 'ADMIN']),
})

// Get all users (admin only)
router.get('/', authenticate, requireRole('ADMIN'), async (req, res) => {
	try {
	  const users = await prisma.user.findMany({
	    select: {
	      id: true,
	      discordId: true,
	      discordUsername: true,
	      role: true,
	      createdAt: true,
	    },
	    orderBy: {
	      createdAt: 'desc',
	    },
	  })

	  res.json({ users })
	} catch (error) {
	  console.error('Get users error:', error)
	  res.status(500).json({ error: 'Failed to fetch users' })
	}
})

// Update user role (admin only)
router.put('/:id/role', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const { role } = updateRoleSchema.parse(req.body)

	  const user = await prisma.user.update({
	    where: { id },
	    data: { role },
	    select: {
	      id: true,
	      discordId: true,
	      discordUsername: true,
	      role: true,
	    },
	  })

	  res.json({ user })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Update user role error:', error)
	  res.status(500).json({ error: 'Failed to update user role' })
	}
})

export default router
