import express from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { buildSnakeOrder } from '@bingo-draft/shared'
import prisma from '../db'
import {
	authenticate,
	AuthRequest,
	requireRole,
	isAdmin,
	loadCurrentUser,
} from '../middleware/auth'
import { buildDraftState, broadcastDraftState } from '../lib/draft-state'

const router = express.Router()

/** Thrown inside the pick transaction when another request advanced the pointer first. */
class PickConflictError extends Error {
	constructor() {
		super('Draft pointer moved before this pick could be recorded')
		this.name = 'PickConflictError'
	}
}

/** Thrown inside the pick transaction when the player is already off the board. */
class PlayerAlreadyDraftedError extends Error {
	constructor() {
		super('Player already drafted')
		this.name = 'PlayerAlreadyDraftedError'
	}
}

const placementSchema = z.object({
	playerId: z.string(),
	position: z.number().int().min(1), // 1-based pick number (slot) on the board
})

const submitDraftOrderSchema = z.object({
	placements: z.array(placementSchema), // Each { playerId, position } preserves board slot for partial saves
	teamOrder: z.array(z.string()).optional(), // User's predicted team draft order (team IDs: 1st, 2nd, ...)
})

// Submit draft order (user's prediction)
router.post('/:eventId/submit-order', authenticate, async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params
	  const { placements, teamOrder: rawTeamOrder } = submitDraftOrderSchema.parse(req.body)
	  const userId = req.userId!

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: { players: true, teams: true },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const draftStarted = event.status === 'DRAFTING' || event.status === 'PAUSED' || event.status === 'COMPLETED'
	  if (event.draftDeadline && new Date() > new Date(event.draftDeadline)) {
	    return res.status(400).json({ error: 'Draft deadline has passed' })
	  }
	  if (draftStarted) {
	    return res.status(400).json({ error: 'Draft has already started. Predictions are locked.' })
	  }

	  const totalSlots = event.players.length
	  const playerIds = event.players.map(p => p.id)

	  const placementPlayerIds = placements.map(p => p.playerId)
	  const invalidPlayers = placementPlayerIds.filter(id => !playerIds.includes(id))
	  if (invalidPlayers.length > 0) {
	    return res.status(400).json({ error: 'Invalid players in draft order' })
	  }
	  if (new Set(placementPlayerIds).size !== placementPlayerIds.length) {
	    return res.status(400).json({ error: 'Duplicate players in draft order' })
	  }
	  const invalidPositions = placements.filter(p => p.position < 1 || p.position > totalSlots)
	  if (invalidPositions.length > 0) {
	    return res.status(400).json({ error: 'Placement position must be between 1 and the number of players' })
	  }
	  const positionCount = new Set(placements.map(p => p.position))
	  if (positionCount.size !== placements.length) {
	    return res.status(400).json({ error: 'Duplicate slot positions in draft order' })
	  }

	  const teamIds = event.teams.map((t) => t.id)
	  let teamOrder: string[] = rawTeamOrder ?? []
	  if (teamIds.length > 0) {
	    if (teamOrder.length !== teamIds.length) {
	      return res.status(400).json({ error: 'Team order prediction is required and must include each team exactly once' })
	    }
	    const invalid = teamOrder.filter((id) => !teamIds.includes(id))
	    if (invalid.length > 0 || new Set(teamOrder).size !== teamOrder.length) {
	      return res.status(400).json({ error: 'Team order must contain each team exactly once' })
	    }
	  } else {
	    teamOrder = []
	  }

	  await prisma.draftOrderSubmission.deleteMany({
	    where: { userId, eventId },
	  })

	  const submission = await prisma.draftOrderSubmission.create({
	    data: {
	      userId,
	      eventId,
	      teamOrder,
	      locked: draftStarted || (event.draftDeadline ? new Date() > new Date(event.draftDeadline) : false),
	      items: {
	        create: placements.map(({ playerId, position }) => ({
	          playerId,
	          position,
	        })),
	      },
	    },
	    include: {
	      items: {
	        include: { player: true },
	        orderBy: { position: 'asc' },
	      },
	    },
	  })

	  res.json({ submission })
	} catch (error) {
	  if (error instanceof z.ZodError) {
	    return res.status(400).json({ error: error.errors })
	  }
	  console.error('Submit draft order error:', error)
	  res.status(500).json({ error: 'Failed to submit draft order' })
	}
})

// Get user's draft order submission
router.get('/:eventId/my-submission', authenticate, async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params
	  const userId = req.userId!

	  const submission = await prisma.draftOrderSubmission.findUnique({
	    where: {
	      userId_eventId: {
	        userId,
	        eventId,
	      },
	    },
	    include: {
	      items: {
	        include: {
	          player: true,
	        },
	        orderBy: {
	          position: 'asc',
	        },
	      },
	    },
	  })

	  res.json({ submission })
	} catch (error) {
	  console.error('Get submission error:', error)
	  res.status(500).json({ error: 'Failed to fetch submission' })
	}
})

/**
 * Initialize draft order (snake format). Admin only.
 * Uses event.teamDraftOrder if set and valid; else teams by name.
 */
router.post('/:eventId/initialize', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      teams: { orderBy: { name: 'asc' } },
	      _count: { select: { players: true, draftPicks: true } },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  if (event.teams.length === 0) {
	    return res.status(400).json({ error: 'No teams configured for this event' })
	  }

	  // Re-initializing resets the pick pointer to 0 while every existing pick survives,
	  // which produces colliding pick numbers on everything drafted afterwards.
	  if (event._count.draftPicks > 0) {
	    return res.status(400).json({
	      error: 'This draft already has picks. Undo them before re-initializing.',
	    })
	  }

	  const allTeamIds = event.teams.map((t) => t.id)
	  let baseOrder: string[] = allTeamIds
	  if (event.teamDraftOrder.length === allTeamIds.length) {
	    const ok = allTeamIds.every((id) => event.teamDraftOrder.includes(id))
	      && new Set(event.teamDraftOrder).size === event.teamDraftOrder.length
	    if (ok) baseOrder = event.teamDraftOrder
	  }

	  const snakeOrder = buildSnakeOrder(baseOrder, event._count.players)

	  await prisma.draftOrder.deleteMany({ where: { eventId } })

	  const draftOrder = await prisma.draftOrder.create({
	    data: {
	      eventId,
	      teamOrder: snakeOrder,
	      currentPick: 0,
	      currentRound: 1,
	      isReversed: false,
	    },
	  })

	  await prisma.event.update({
	    where: { id: eventId },
	    data: { status: 'DRAFTING' },
	  })

	  await broadcastDraftState(eventId)

	  res.json({ draftOrder })
	} catch (error) {
	  console.error('Initialize draft error:', error)
	  res.status(500).json({ error: 'Failed to initialize draft' })
	}
})

// Make a pick (admin or captain of current team)
router.post('/:eventId/pick', authenticate, async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params
	  const { playerId } = req.body

	  if (!playerId) {
	    return res.status(400).json({ error: 'Player ID is required' })
	  }

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      teams: {
	        include: {
	          captains: true,
	        },
	      },
	      draftOrder: true,
	      players: { select: { id: true } },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  // A paused draft has to actually reject picks, not just hide the button.
	  if (event.status !== 'DRAFTING') {
	    return res.status(400).json({
	      error: event.status === 'PAUSED'
	        ? 'Draft is paused'
	        : 'Event is not in drafting status',
	    })
	  }

	  if (!event.draftOrder) {
	    return res.status(400).json({ error: 'Draft not initialized' })
	  }

	  const currentTeamId = event.draftOrder.teamOrder[event.draftOrder.currentPick]
	  if (!currentTeamId) {
	    return res.status(400).json({ error: 'Every pick in this draft has been made' })
	  }

	  // Role comes from the database, not the token claim, so a demoted admin loses the
	  // ability to pick immediately rather than when their token expires.
	  const admin = await isAdmin(req)
	  const currentTeam = event.teams.find((t) => t.id === currentTeamId)
	  const requestingUser = await loadCurrentUser(req)
	  const discordUsername = requestingUser?.discordUsername?.toLowerCase() ?? ''
	  const isCaptainOfCurrentTeam = !!currentTeam?.captains?.some(
	    (c) => c.discordUsername.toLowerCase() === discordUsername
	  )

	  if (!admin && !isCaptainOfCurrentTeam) {
	    return res.status(403).json({ error: 'Only the current team\'s captains and admins can make picks' })
	  }

	  if (!event.players.some((p) => p.id === playerId)) {
	    return res.status(404).json({ error: 'Player not found' })
	  }

	  // Pointer values this request is claiming.
	  const expectedPick = event.draftOrder.currentPick
	  const round = event.draftOrder.currentRound
	  const pickNumber = expectedPick + 1
	  const nextPick = expectedPick + 1
	  const totalTeams = event.teams.length

	  let nextRound = round
	  let isReversed = event.draftOrder.isReversed

	  if (totalTeams > 0 && nextPick % totalTeams === 0) {
	    // Completed a round
	    nextRound += 1
	    isReversed = !isReversed
	  }

	  const draftOrderId = event.draftOrder.id

	  const pick = await prisma.$transaction(async (tx) => {
	    // Claim the slot by advancing the pointer, conditioned on it not having moved.
	    // A concurrent pick that got there first leaves this matching zero rows and the
	    // whole transaction rolls back, so two requests can never take the same slot.
	    const advanced = await tx.draftOrder.updateMany({
	      where: { id: draftOrderId, currentPick: expectedPick },
	      data: {
	        currentPick: nextPick,
	        currentRound: nextRound,
	        isReversed,
	      },
	    })

	    if (advanced.count === 0) {
	      throw new PickConflictError()
	    }

	    // Advancing the pointer above takes a row lock on the draft order, so picks for an
	    // event serialize here and this check cannot be raced. It also means a correct
	    // rejection even on a database that has not had the unique constraints applied yet.
	    const alreadyDrafted = await tx.draftPick.findFirst({
	      where: { eventId, playerId },
	      select: { id: true },
	    })
	    if (alreadyDrafted) {
	      throw new PlayerAlreadyDraftedError()
	    }

	    // The unique constraints on (eventId, playerId) and (eventId, pickNumber) are the
	    // backstop; a violation here rolls back the pointer too.
	    return tx.draftPick.create({
	      data: {
	        eventId,
	        teamId: currentTeamId,
	        playerId,
	        round,
	        pickNumber,
	      },
	      include: {
	        team: true,
	        player: true,
	      },
	    })
	  })

	  // Check if draft is complete
	  const totalPicks = await prisma.draftPick.count({
	    where: { eventId },
	  })

	  if (totalPicks >= event.players.length) {
	    await prisma.event.update({
	      where: { id: eventId },
	      data: { status: 'COMPLETED' },
	    })
	  }

	  await broadcastDraftState(eventId)

	  res.json({ pick })
	} catch (error) {
	  if (error instanceof PlayerAlreadyDraftedError) {
	    return res.status(400).json({ error: 'Player already drafted' })
	  }
	  if (error instanceof PickConflictError) {
	    return res.status(409).json({ error: 'Someone else just picked. Refresh and try again.' })
	  }
	  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
	    const target = String(error.meta?.target ?? '')
	    return res.status(400).json({
	      error: target.includes('playerId')
	        ? 'Player already drafted'
	        : 'That pick has already been made. Refresh and try again.',
	    })
	  }
	  console.error('Make pick error:', error)
	  res.status(500).json({ error: 'Failed to make pick' })
	}
})

// Get draft state
router.get('/:eventId/state', async (req, res) => {
	try {
	  const { eventId } = req.params

	  const state = await buildDraftState(eventId)

	  if (!state) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  res.json(state)
	} catch (error) {
	  console.error('Get draft state error:', error)
	  res.status(500).json({ error: 'Failed to fetch draft state' })
	}
})

// Undo last pick (admin only)
router.post('/:eventId/undo', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: { teams: true },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const lastPick = await prisma.draftPick.findFirst({
	    where: { eventId },
	    orderBy: { pickNumber: 'desc' },
	  })

	  if (!lastPick) {
	    return res.status(400).json({ error: 'No picks to undo' })
	  }

	  // Delete last pick
	  await prisma.draftPick.delete({
	    where: { id: lastPick.id },
	  })

	  // Update draft order
	  const draftOrder = await prisma.draftOrder.findUnique({
	    where: { eventId },
	  })

	  if (draftOrder) {
	    const newPick = Math.max(0, draftOrder.currentPick - 1)
	    const totalTeams = event.teams.length
	    const picksInRound = newPick % totalTeams
	    
	    let newRound = draftOrder.currentRound
	    let isReversed = draftOrder.isReversed

	    if (picksInRound === totalTeams - 1 && newPick < draftOrder.currentPick) {
	      // Going back a round
	      newRound = Math.max(1, newRound - 1)
	      isReversed = !isReversed
	    }

	    await prisma.draftOrder.update({
	      where: { id: draftOrder.id },
	      data: {
	        currentPick: newPick,
	        currentRound: newRound,
	        isReversed,
	      },
	    })
	  }

	  // Update event status if needed
	  if (event.status === 'COMPLETED') {
	    await prisma.event.update({
	      where: { id: eventId },
	      data: { status: 'DRAFTING' },
	    })
	  }

	  await broadcastDraftState(eventId)

	  res.json({ success: true })
	} catch (error) {
	  console.error('Undo pick error:', error)
	  res.status(500).json({ error: 'Failed to undo pick' })
	}
})

// Pause draft (admin only)
router.post('/:eventId/pause', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params
	  const event = await prisma.event.findUnique({ where: { id: eventId } })
	  
	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  if (event.status !== 'DRAFTING') {
	    return res.status(400).json({ error: 'Event is not in drafting status' })
	  }

	  await prisma.event.update({
	    where: { id: eventId },
	    data: { status: 'PAUSED' },
	  })

	  await broadcastDraftState(eventId)

	  res.json({ success: true })
	} catch (error) {
	  console.error('Pause draft error:', error)
	  res.status(500).json({ error: 'Failed to pause draft' })
	}
})

// Resume draft (admin only)
router.post('/:eventId/resume', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params
	  const event = await prisma.event.findUnique({ where: { id: eventId } })
	  
	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  if (event.status !== 'PAUSED') {
	    return res.status(400).json({ error: 'Event is not paused' })
	  }

	  await prisma.event.update({
	    where: { id: eventId },
	    data: { status: 'DRAFTING' },
	  })

	  await broadcastDraftState(eventId)

	  res.json({ success: true })
	} catch (error) {
	  console.error('Resume draft error:', error)
	  res.status(500).json({ error: 'Failed to resume draft' })
	}
})

export default router
