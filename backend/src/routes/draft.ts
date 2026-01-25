import express from 'express'
import { z } from 'zod'
import prisma from '../db'
import { authenticate, AuthRequest, requireRole } from '../middleware/auth'
import { getIO } from '../socketManager'

const router = express.Router()

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

// Initialize draft order (snake format) (admin only). Uses event.teamDraftOrder if set and valid, else teams by name.
router.post('/:eventId/initialize', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: { teams: { orderBy: { name: 'asc' } } },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  if (event.teams.length === 0) {
	    return res.status(400).json({ error: 'No teams configured for this event' })
	  }

	  const allTeamIds = event.teams.map((t) => t.id)
	  let baseOrder: string[] = allTeamIds
	  if (event.teamDraftOrder && event.teamDraftOrder.length === allTeamIds.length) {
	    const ok = allTeamIds.every((id) => event.teamDraftOrder!.includes(id))
	      && new Set(event.teamDraftOrder).size === event.teamDraftOrder.length
	    if (ok) baseOrder = event.teamDraftOrder!
	    else baseOrder = event.teams.map((t) => t.id)
	  } else {
	    baseOrder = event.teams.map((t) => t.id)
	  }

	  const snakeOrder: string[] = []
	  snakeOrder.push(...baseOrder)
	  const maxRounds = Math.ceil(200 / baseOrder.length)
	  for (let round = 2; round <= maxRounds; round++) {
	    if (round % 2 === 0) {
	      snakeOrder.push(...[...baseOrder].reverse())
	    } else {
	      snakeOrder.push(...baseOrder)
	    }
	  }

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
	      players: true,
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  if (event.status !== 'DRAFTING' && event.status !== 'PAUSED') {
	    return res.status(400).json({ error: 'Event is not in drafting status' })
	  }

	  if (!event.draftOrder) {
	    return res.status(400).json({ error: 'Draft not initialized' })
	  }

	  const isAdmin = req.userRole === 'ADMIN'
	  const currentTeamId = event.draftOrder.teamOrder[event.draftOrder.currentPick]
	  const currentTeam = event.teams.find((t) => t.id === currentTeamId)
	  const requestingUser = await prisma.user.findUnique({
	    where: { id: req.userId! },
	    select: { discordUsername: true },
	  })
	  const discordUsername = requestingUser?.discordUsername?.toLowerCase() ?? ''
	  const isCaptainOfCurrentTeam = !!currentTeam?.captains?.some(
	    (c) => c.discordUsername.toLowerCase() === discordUsername
	  )

	  if (!isAdmin && !isCaptainOfCurrentTeam) {
	    return res.status(403).json({ error: 'Only the current team\'s captains and admins can make picks' })
	  }

	  let targetTeamId = currentTeamId
	  if (isAdmin && req.body.teamId) {
	    targetTeamId = req.body.teamId
	  }

	  // Check if player exists and is available
	  const player = event.players.find(p => p.id === playerId)
	  if (!player) {
	    return res.status(404).json({ error: 'Player not found' })
	  }

	  // Check if player already drafted
	  const existingPick = await prisma.draftPick.findFirst({
	    where: {
	      eventId,
	      playerId,
	    },
	  })

	  if (existingPick) {
	    return res.status(400).json({ error: 'Player already drafted' })
	  }

	  // Calculate round and pick number
	  const round = event.draftOrder.currentRound
	  const pickNumber = event.draftOrder.currentPick + 1

	  // Create pick
	  const pick = await prisma.draftPick.create({
	    data: {
	      eventId,
	      teamId: targetTeamId,
	      playerId,
	      round,
	      pickNumber,
	    },
	    include: {
	      team: true,
	      player: true,
	    },
	  })

	  // Update draft order
	  const nextPick = event.draftOrder.currentPick + 1
	  const totalTeams = event.teams.length
	  const picksInRound = nextPick % totalTeams
	  
	  let nextRound = event.draftOrder.currentRound
	  let isReversed = event.draftOrder.isReversed

	  if (picksInRound === 0 && nextPick > 0) {
	    // Completed a round
	    nextRound += 1
	    isReversed = !isReversed
	  }

	  await prisma.draftOrder.update({
	    where: { id: event.draftOrder.id },
	    data: {
	      currentPick: nextPick,
	      currentRound: nextRound,
	      isReversed,
	    },
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

	  // Fetch updated draft state for socket emission
	  const updatedState = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      draftOrder: true,
	      teams: {
	        include: {
	          captains: { include: { player: true } },
	          draftPicks: {
	            include: {
	              player: true,
	            },
	            orderBy: {
	              pickNumber: 'asc',
	            },
	          },
	        },
	      },
	      draftPicks: {
	        include: {
	          team: true,
	          player: true,
	        },
	        orderBy: {
	          pickNumber: 'asc',
	        },
	      },
	      players: true,
	    },
	  })

	  if (updatedState) {
	    const draftedPlayerIds = updatedState.draftPicks.map(p => p.playerId)
	    const availablePlayers = updatedState.players.filter(p => !draftedPlayerIds.includes(p.id))
	    
	    const draftState = {
	      draftOrder: updatedState.draftOrder,
	      teams: updatedState.teams,
	      picks: updatedState.draftPicks,
	      availablePlayers,
	      currentTeam: updatedState.draftOrder
	        ? updatedState.teams.find(t => t.id === updatedState.draftOrder!.teamOrder[updatedState.draftOrder!.currentPick])
	        : null,
	    }

	    // Emit socket event
	    const io = getIO()
	    io.to(`event:${eventId}`).emit('pick-made', {
	      pick,
	      state: draftState,
	    })
	  }

	  res.json({ pick })
	} catch (error) {
	  console.error('Make pick error:', error)
	  res.status(500).json({ error: 'Failed to make pick' })
	}
})

// Get draft state
router.get('/:eventId/state', async (req, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      draftOrder: true,
	      teams: {
	        include: {
	          captains: { include: { player: true } },
	          draftPicks: {
	            include: {
	              player: true,
	            },
	            orderBy: {
	              pickNumber: 'asc',
	            },
	          },
	        },
	      },
	      draftPicks: {
	        include: {
	          team: { include: { captains: true } },
	          player: true,
	        },
	        orderBy: {
	          pickNumber: 'asc',
	        },
	      },
	      players: true,
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  // Get available players
	  const draftedPlayerIds = event.draftPicks.map(p => p.playerId)
	  const availablePlayers = event.players.filter(p => !draftedPlayerIds.includes(p.id))

	  res.json({
	    draftOrder: event.draftOrder,
	    teams: event.teams,
	    picks: event.draftPicks,
	    availablePlayers,
	    currentTeam: event.draftOrder
	      ? event.teams.find(t => t.id === event.draftOrder!.teamOrder[event.draftOrder!.currentPick])
	      : null,
	  })
	} catch (error) {
	  console.error('Get draft state error:', error)
	  res.status(500).json({ error: 'Failed to fetch draft state' })
	}
})

// Undo last pick (admin or captain of the team that made the last pick)
router.post('/:eventId/undo', authenticate, async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: { teams: { include: { captains: true } } },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const lastPick = await prisma.draftPick.findFirst({
	    where: { eventId },
	    orderBy: { pickNumber: 'desc' },
	    include: { team: { include: { captains: true } } },
	  })

	  if (!lastPick) {
	    return res.status(400).json({ error: 'No picks to undo' })
	  }

	  const isAdmin = req.userRole === 'ADMIN'
	  const requestingUser = await prisma.user.findUnique({
	    where: { id: req.userId! },
	    select: { discordUsername: true },
	  })
	  const discordUsername = requestingUser?.discordUsername?.toLowerCase() ?? ''
	  const isCaptainOfLastPickTeam = !!lastPick.team?.captains?.some(
	    (c) => c.discordUsername.toLowerCase() === discordUsername
	  )

	  if (!isAdmin && !isCaptainOfLastPickTeam) {
	    return res.status(403).json({ error: 'Insufficient permissions' })
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

	  const io = getIO()
	  io.to(`event:${eventId}`).emit('draft-paused', { eventId })

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

	  const io = getIO()
	  io.to(`event:${eventId}`).emit('draft-resumed', { eventId })

	  res.json({ success: true })
	} catch (error) {
	  console.error('Resume draft error:', error)
	  res.status(500).json({ error: 'Failed to resume draft' })
	}
})

export default router
