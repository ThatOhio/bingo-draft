import express from 'express'
import { z } from 'zod'
import { buildSnakeOrder } from '@bingo-draft/shared'
import prisma from '../db'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { broadcastDraftState } from '../lib/draft-state'

const router = express.Router()

const createEventSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	eventCode: z.string().min(3).max(20),
	draftDeadline: z.string().datetime().optional(),
	draftStartTime: z.string().datetime().optional(),
	fantasyEnabled: z.boolean().optional(),
})

const updateEventSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().nullish(),
	status: z.enum(['PLANNED', 'OPEN', 'DRAFTING', 'PAUSED', 'COMPLETED', 'CLOSED']).optional(),
	draftDeadline: z.string().datetime().optional(),
	draftStartTime: z.string().datetime().optional(),
	fantasyEnabled: z.boolean().optional(),
})

interface ImportPlayer {
	name: string
	team?: string | null
	notes?: string | null
}

const playersImportSchema = z.object({
	players: z.array(z.object({
		name: z.string().min(1),
		team: z.string().nullish(),
		notes: z.string().nullish(),
	})),
})

const bulkImportBodySchema = z.object({
	text: z.string().min(1, 'Text content is required'),
})

const bulkRemoveBodySchema = z.object({
	text: z.string().min(1, 'Text content is required'),
})

/** Normalize player name for duplicate check (trim + lowercase). */
function playerKey(name: string): string {
	return name.trim().toLowerCase()
}

// Get all events (public)
router.get('/', async (req, res) => {
	try {
	  const events = await prisma.event.findMany({
	    include: {
	      _count: {
	        select: {
	          submissions: true,
	          players: true,
	          teams: true,
	        },
	      },
	    },
	    orderBy: {
	      createdAt: 'desc',
	    },
	  })

	  res.json({ events })
	} catch (error) {
	  console.error('Get events error:', error)
	  res.status(500).json({ error: 'Failed to fetch events' })
	}
})

// Get event by code (public)
router.get('/code/:eventCode', async (req, res) => {
	try {
	  const { eventCode } = req.params
	  const event = await prisma.event.findUnique({
	    where: { eventCode },
	    include: {
	      players: {
	        orderBy: {
	          name: 'asc',
	        },
	      },
	      teams: {
	        orderBy: {
	          name: 'asc',
	        },
	        include: {
	          captains: {
	            include: {
	              player: true,
	            },
	          },
	        },
	      },
	      _count: {
	        select: {
	          submissions: true,
	        },
	      },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  res.json({ event })
	} catch (error) {
	  console.error('Get event error:', error)
	  res.status(500).json({ error: 'Failed to fetch event' })
	}
})

// Get single event
router.get('/:id', async (req, res) => {
	try {
	  const { id } = req.params
	  const event = await prisma.event.findUnique({
	    where: { id },
	    include: {
	      players: {
	        orderBy: {
	          name: 'asc',
	        },
	      },
	      teams: {
	        orderBy: {
	          name: 'asc',
	        },
	        include: {
	          captains: {
	            include: {
	              player: true,
	            },
	          },
	        },
	      },
	      draftOrder: true,
	      _count: {
	        select: {
	          submissions: true,
	          draftPicks: true,
	        },
	      },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  res.json({ event })
	} catch (error) {
	  console.error('Get event error:', error)
	  res.status(500).json({ error: 'Failed to fetch event' })
	}
})

// Create event (admin only)
router.post('/', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const data = createEventSchema.parse(req.body)

	  // Check if event code already exists
	  const existingEvent = await prisma.event.findUnique({
	    where: { eventCode: data.eventCode },
	  })

	  if (existingEvent) {
	    return res.status(400).json({ error: 'Event code already exists' })
	  }

	  const event = await prisma.event.create({
	    data: {
	      ...data,
	      draftDeadline: data.draftDeadline ? new Date(data.draftDeadline) : null,
	      draftStartTime: data.draftStartTime ? new Date(data.draftStartTime) : null,
	    },
	  })

	  res.status(201).json({ event })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Create event error:', error)
	  res.status(500).json({ error: 'Failed to create event' })
	}
})

// Update event (admin only)
router.put('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const data = updateEventSchema.parse(req.body)

	  const event = await prisma.event.findUnique({
	    where: { id },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const updatedEvent = await prisma.event.update({
	    where: { id },
	    data: {
	      ...data,
	      draftDeadline: data.draftDeadline ? new Date(data.draftDeadline) : undefined,
	      draftStartTime: data.draftStartTime ? new Date(data.draftStartTime) : undefined,
	    },
	  })

	  res.json({ event: updatedEvent })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Update event error:', error)
	  res.status(500).json({ error: 'Failed to update event' })
	}
})

const teamDraftOrderSchema = z.object({
	teamOrder: z.array(z.string()),
})

// Set team draft order (admin only): which team picks 1st, 2nd, etc.
// Before initialize: sets order used when initializing.
// After initialize, no picks yet: rebuilds actual pick order (snake) from new order so the "true" draft uses it.
// After initialize, picks already made: only updates column display order on live draft board.
router.put('/:id/team-draft-order', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const { teamOrder } = teamDraftOrderSchema.parse(req.body)

	  const event = await prisma.event.findUnique({
	    where: { id },
	    include: { teams: true, draftOrder: true },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const teamIds = event.teams.map((t) => t.id)
	  if (teamOrder.length !== teamIds.length) {
	    return res.status(400).json({ error: 'teamOrder must contain each team exactly once' })
	  }
	  const invalid = teamOrder.filter((tid) => !teamIds.includes(tid))
	  if (invalid.length > 0) {
	    return res.status(400).json({ error: 'teamOrder contains invalid or duplicate team IDs' })
	  }
	  if (new Set(teamOrder).size !== teamOrder.length) {
	    return res.status(400).json({ error: 'teamOrder must not contain duplicates' })
	  }

	  await prisma.event.update({
	    where: { id },
	    data: { teamDraftOrder: teamOrder },
	  })

	  // If draft is initialized but no picks have been made, rebuild the snake so the real pick order matches the new team order.
	  if (event.draftOrder) {
	    const pickCount = await prisma.draftPick.count({ where: { eventId: id } })
	    if (pickCount === 0) {
	      const playerCount = await prisma.player.count({ where: { eventId: id } })
	      await prisma.draftOrder.update({
	        where: { eventId: id },
	        data: {
	          teamOrder: buildSnakeOrder(teamOrder, playerCount),
	          currentPick: 0,
	          currentRound: 1,
	          isReversed: false,
	        },
	      })
	    }
	  }

	  // Column order on the live board changed; push it to anyone watching.
	  await broadcastDraftState(id)

	  res.json({ success: true, teamOrder })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Set team draft order error:', error)
	  res.status(500).json({ error: 'Failed to set team draft order' })
	}
})

// Bulk import players from text (pasteable list) (admin only)
router.post('/:id/players/bulk-import', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const { text } = bulkImportBodySchema.parse(req.body)

	  const event = await prisma.event.findUnique({
	    where: { id },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  // Parse text: one player per line, optionally with format "Name | Team | Notes"
	  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
	  const players = lines.map(line => {
	    const parts = line.split('|').map(p => p.trim())
	    return {
	      name: parts[0] || line.trim(),
	      team: parts[1] || null,
	      notes: parts[2] || null,
	    }
	  })

	  // Load existing players to avoid duplicates (preserves captains and other data)
	  const existing = await prisma.player.findMany({
	    where: { eventId: id },
	    select: { name: true },
	  })
	  const existingKeys = new Set(existing.map((p) => playerKey(p.name)))

	  const toCreate = players.filter((p) => !existingKeys.has(playerKey(p.name)))
	  const skipped = players.length - toCreate.length

	  const createdPlayers = await prisma.player.createMany({
	    data: toCreate.map((p) => ({
	      eventId: id,
	      name: p.name,
	      team: p.team || null,
	      notes: p.notes || null,
	    })),
	  })

	  res.json({ count: createdPlayers.count, skipped })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Bulk import players error:', error)
	  res.status(500).json({ error: 'Failed to bulk import players' })
	}
})

// Bulk remove players by name (line-separated list) (admin only)
router.post('/:id/players/bulk-remove', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const { text } = bulkRemoveBodySchema.parse(req.body)

	  const event = await prisma.event.findUnique({
	    where: { id },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
	  const requestedNames = lines.map((line) => {
	    const parts = line.split('|').map((p) => p.trim())
	    return parts[0] || line
	  })
	  const requestedKeys = new Set(requestedNames.map((n) => playerKey(n)))

	  const existingPlayers = await prisma.player.findMany({
	    where: { eventId: id },
	    select: { id: true, name: true },
	  })

	  const toDeleteIds = existingPlayers
	    .filter((p) => requestedKeys.has(playerKey(p.name)))
	    .map((p) => p.id)
	  const foundKeys = new Set(
	    existingPlayers.filter((p) => requestedKeys.has(playerKey(p.name))).map((p) => playerKey(p.name))
	  )
	  const notFound = requestedNames.filter((n) => !foundKeys.has(playerKey(n)))

	  await prisma.player.deleteMany({
	    where: { id: { in: toDeleteIds } },
	  })

	  res.json({ deleted: toDeleteIds.length, notFound })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Bulk remove players error:', error)
	  res.status(500).json({ error: 'Failed to bulk remove players' })
	}
})

// Import players (admin only)
router.post('/:id/players/import', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const { players } = playersImportSchema.parse(req.body)

	  const event = await prisma.event.findUnique({
	    where: { id },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  // Load existing players to avoid duplicates (preserves captains and other data)
	  const existing = await prisma.player.findMany({
	    where: { eventId: id },
	    select: { name: true },
	  })
	  const existingKeys = new Set(existing.map((p) => playerKey(p.name)))

	  const toCreate = players.filter((p) => !existingKeys.has(playerKey(p.name)))
	  const skipped = players.length - toCreate.length

	  const createdPlayers = await prisma.player.createMany({
	    data: toCreate.map((p) => ({
	      eventId: id,
	      name: p.name,
	      team: p.team ?? null,
	      notes: p.notes ?? null,
	    })),
	  })

	  res.json({ count: createdPlayers.count, skipped })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Import players error:', error)
	  res.status(500).json({ error: 'Failed to import players' })
	}
})

const addCaptainSchema = z.object({
	playerId: z.string().min(1),
	discordUsername: z.string().min(1),
})

// Add captain to team (admin only)
router.post('/:id/teams/:teamId/captains', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id: eventId, teamId } = req.params
	  const data = addCaptainSchema.parse(req.body)

	  const team = await prisma.team.findFirst({
	    where: { id: teamId, eventId },
	    include: { event: { select: { id: true } } },
	  })
	  if (!team) {
	    return res.status(404).json({ error: 'Team not found' })
	  }

	  const player = await prisma.player.findFirst({
	    where: { id: data.playerId, eventId },
	  })
	  if (!player) {
	    return res.status(400).json({ error: 'Player must belong to this event' })
	  }

	  const captain = await prisma.teamCaptain.create({
	    data: {
	      teamId,
	      playerId: data.playerId,
	      discordUsername: data.discordUsername.trim(),
	    },
	    include: {
	      player: true,
	    },
	  })
	  res.status(201).json({ captain })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Add captain error:', error)
	  res.status(500).json({ error: 'Failed to add captain' })
	}
})

// Remove captain from team (admin only)
router.delete('/:id/teams/:teamId/captains/:captainId', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { teamId, captainId } = req.params

	  const captain = await prisma.teamCaptain.findFirst({
	    where: { id: captainId, teamId },
	  })
	  if (!captain) {
	    return res.status(404).json({ error: 'Captain not found' })
	  }

	  await prisma.teamCaptain.delete({
	    where: { id: captainId },
	  })
	  res.json({ success: true })
	} catch (error) {
	  console.error('Remove captain error:', error)
	  res.status(500).json({ error: 'Failed to remove captain' })
	}
})

const createTeamSchema = z.object({
	name: z.string().min(1),
	captains: z.array(z.object({
	  playerId: z.string().min(1),
	  discordUsername: z.string().min(1),
	})).optional().default([]),
})

// Add team (admin only). Name required; captains optional.
router.post('/:id/teams', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { id } = req.params
	  const { name, captains } = createTeamSchema.parse(req.body)

	  const event = await prisma.event.findUnique({
	    where: { id },
	    include: { players: { select: { id: true } } },
	  })
	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const playerIds = event.players.map((p) => p.id)
	  for (const c of captains) {
	    if (!playerIds.includes(c.playerId)) {
	      return res.status(400).json({ error: `Player ${c.playerId} is not in this event` })
	    }
	  }

	  const team = await prisma.team.create({
	    data: {
	      eventId: id,
	      name,
	      captains: {
	        create: captains.map((c) => ({
	          playerId: c.playerId,
	          discordUsername: c.discordUsername.trim(),
	        })),
	      },
	    },
	    include: {
	      captains: {
	        include: {
	          player: true,
	        },
	      },
	    },
	  })

	  res.status(201).json({ team })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Create team error:', error)
	  res.status(500).json({ error: 'Failed to create team' })
	}
})

export default router
