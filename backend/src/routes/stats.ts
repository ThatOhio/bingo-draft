import express from 'express'
import prisma from '../db'
import { authenticate, AuthRequest, requireRole } from '../middleware/auth'

const router = express.Router()

// Snake order: slotIndex (0-based) -> { round, teamIndex }. Must match frontend DraftSubmission.
function slotToRoundAndTeamIndex(slotIndex: number, numTeams: number): { round: number; teamIndex: number } {
	const round = Math.floor(slotIndex / numTeams) + 1
	const posInRound = slotIndex % numTeams
	const teamIndex = round % 2 === 1 ? posInRound : numTeams - 1 - posInRound
	return { round, teamIndex }
}

// Points: exact 10; ±1: 5; ±2: 3; ±3: 1; else 0.
function playerSlotPoints(difference: number): number {
	if (difference === 0) return 10
	if (difference === 1) return 5
	if (difference === 2) return 3
	if (difference === 3) return 1
	return 0
}

// Get rankings for an event
router.get('/:eventId/rankings', async (req, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      teams: true,
	      draftOrder: true,
	      draftPicks: {
	        include: { player: true },
	        orderBy: { pickNumber: 'asc' },
	      },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  // Only show rankings if draft is completed
	  if (event.status !== 'COMPLETED') {
	    return res.json({ rankings: [], message: 'Rankings will be available after the draft completes' })
	  }

	  const submissions = await prisma.draftOrderSubmission.findMany({
	    where: { eventId },
	    include: {
	      user: { select: { id: true, discordUsername: true } },
	      items: { include: { player: true }, orderBy: { position: 'asc' } },
	    },
	  })

	  const actualOrder = event.draftPicks.map(p => ({
	    playerId: p.playerId,
	    pickNumber: p.pickNumber,
	    round: p.round,
	    teamId: p.teamId,
	  }))

	  const numTeams = event.teams?.length ?? 0
	  const actualTeamOrder = event.draftOrder?.teamOrder?.slice(0, numTeams) ?? []

	  const POINTS_TEAM_ORDER = 5
	  const POINTS_CORRECT_TEAM = 3
	  const POINTS_CORRECT_ROUND = 2

	  const rankings = submissions.map(submission => {
	    const userOrder = submission.items.map(item => ({
	      playerId: item.playerId,
	      predictedPosition: item.position,
	    }))

	    let exactMatches = 0
	    let closeMatches = 0 // 1 <= diff <= 3 (for display)
	    let correctTeamMatches = 0
	    let correctRoundMatches = 0
	    let playerSlotScore = 0
	    const matchDetails: Array<{
	      playerName: string
	      predicted: number
	      actual: number
	      difference: number
	    }> = []

	    const predTeamOrder = submission.teamOrder ?? []
	    const canDerivePredicted = numTeams > 0 && predTeamOrder.length === numTeams

	    userOrder.forEach(userPick => {
	      const actualPick = actualOrder.find(ap => ap.playerId === userPick.playerId)
	      if (actualPick) {
	        const difference = Math.abs(userPick.predictedPosition - actualPick.pickNumber)
	        if (difference === 0) exactMatches++
	        else if (difference >= 1 && difference <= 3) closeMatches++

	        playerSlotScore += playerSlotPoints(difference)

	        if (canDerivePredicted) {
	          const slotIndex = userPick.predictedPosition - 1
	          const { round: predRound, teamIndex } = slotToRoundAndTeamIndex(slotIndex, numTeams)
	          const predTeamId = predTeamOrder[teamIndex]
	          if (predTeamId === actualPick.teamId) correctTeamMatches++
	          if (predRound === actualPick.round) correctRoundMatches++
	        }

	        const player = submission.items.find(i => i.playerId === userPick.playerId)?.player
	        if (player) {
	          matchDetails.push({
	            playerName: player.name,
	            predicted: userPick.predictedPosition,
	            actual: actualPick.pickNumber,
	            difference,
	          })
	        }
	      }
	    })

	    let teamOrderExactMatches = 0
	    if (numTeams > 0 && predTeamOrder.length === numTeams && actualTeamOrder.length === numTeams) {
	      for (let i = 0; i < numTeams; i++) {
	        if (predTeamOrder[i] === actualTeamOrder[i]) teamOrderExactMatches++
	      }
	    }
	    const teamOrderScore = teamOrderExactMatches * POINTS_TEAM_ORDER
	    const correctTeamScore = correctTeamMatches * POINTS_CORRECT_TEAM
	    const correctRoundScore = correctRoundMatches * POINTS_CORRECT_ROUND

	    const score = playerSlotScore + teamOrderScore + correctTeamScore + correctRoundScore

	    return {
	      userId: submission.user.id,
	      userName: submission.user.discordUsername,
	      exactMatches,
	      closeMatches,
	      teamOrderExactMatches,
	      teamOrderScore,
	      correctTeamMatches,
	      correctRoundMatches,
	      correctTeamScore,
	      correctRoundScore,
	      playerSlotScore,
	      score,
	      totalPlayers: userOrder.length,
	      matchDetails: matchDetails.sort((a, b) => a.difference - b.difference),
	      categoryScores: {
	        playerSlot: playerSlotScore,
	        teamOrder: teamOrderScore,
	        correctTeam: correctTeamScore,
	        correctRound: correctRoundScore,
	      },
	    }
	  })

	  // Sort by score (descending)
	  rankings.sort((a, b) => b.score - a.score)

	  // Add rank
	  const rankingsWithRank = rankings.map((ranking, index) => ({
	    ...ranking,
	    rank: index + 1,
	  }))

	  res.json({ rankings: rankingsWithRank })
	} catch (error) {
	  console.error('Get rankings error:', error)
	  res.status(500).json({ error: 'Failed to calculate rankings' })
	}
})

// Get aggregate draft stats (player/team accuracy across all users; no user score)
router.get('/:eventId/aggregate', async (req, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      teams: true,
	      draftOrder: true,
	      draftPicks: {
	        include: { player: true, team: true },
	        orderBy: { pickNumber: 'asc' },
	      },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  if (event.status !== 'COMPLETED') {
	    return res.json({
	      totalSubmissions: 0,
	      players: { mostAccuratelyPredicted: [], leastAccuratelyPredicted: [], biggestSurprises: [] },
	      teamOrder: { mostAccuratelyPredicted: [], leastAccuratelyPredicted: [] },
	      correctTeam: { mostAccuratelyPredicted: [], leastAccuratelyPredicted: [] },
	      message: 'Aggregate stats will be available after the draft completes',
	    })
	  }

	  const submissions = await prisma.draftOrderSubmission.findMany({
	    where: { eventId },
	    include: {
	      items: { include: { player: true }, orderBy: { position: 'asc' } },
	    },
	  })

	  const actualOrder = event.draftPicks.map(p => ({
	    playerId: p.playerId,
	    pickNumber: p.pickNumber,
	    round: p.round,
	    teamId: p.teamId,
	    player: p.player,
	    team: p.team,
	  }))

	  const numTeams = event.teams?.length ?? 0
	  const actualTeamOrder = event.draftOrder?.teamOrder?.slice(0, numTeams) ?? []

	  const submissionsWithTeamOrder = submissions.filter(
	    s => (s.teamOrder ?? []).length === numTeams && numTeams > 0
	  )
	  const totalSubmissions = submissions.length
	  const totalWithTeamOrder = submissionsWithTeamOrder.length

	  // --- Players: exact and totalPredicted per drafted player ---
	  const playerAcc: Map<string, { exactCount: number; totalPredicted: number; sumPredicted: number; playerName: string; teamName: string | null; actualPick: number }> = new Map()

	  for (const p of actualOrder) {
	    playerAcc.set(p.playerId, {
	      exactCount: 0,
	      totalPredicted: 0,
	      sumPredicted: 0,
	      playerName: p.player?.name ?? '?',
	      teamName: p.team?.name ?? null,
	      actualPick: p.pickNumber,
	    })
	  }

	  for (const s of submissions) {
	    for (const it of s.items) {
	      const a = playerAcc.get(it.playerId)
	      if (!a) continue
	      a.totalPredicted += 1
	      a.sumPredicted += it.position
	      const ap = actualOrder.find(x => x.playerId === it.playerId)
	      if (ap && Math.abs(it.position - ap.pickNumber) === 0) a.exactCount += 1
	    }
	  }

	  const playerList = Array.from(playerAcc.entries()).map(([playerId, a]) => ({
	    playerId,
	    playerName: a.playerName,
	    teamName: a.teamName,
	    actualPick: a.actualPick,
	    exactCount: a.exactCount,
	    totalPredicted: a.totalPredicted,
	    pctExact: a.totalPredicted > 0 ? Math.round((a.exactCount / a.totalPredicted) * 100) : 0,
	    avgPredicted: a.totalPredicted > 0 ? Math.round((a.sumPredicted / a.totalPredicted) * 10) / 10 : null,
	    avgError: a.totalPredicted > 0 ? Math.round(Math.abs(a.sumPredicted / a.totalPredicted - a.actualPick) * 10) / 10 : null,
	  }))

	  const mostAccuratelyPredicted = [...playerList]
	    .filter(p => p.totalPredicted >= 1)
	    .sort((a, b) => b.exactCount - a.exactCount)
	    .slice(0, 10)

	  const leastAccuratelyPredicted = [...playerList]
	    .filter(p => p.totalPredicted >= 1)
	    .sort((a, b) => a.exactCount - b.exactCount)
	    .slice(0, 10)

	  const biggestSurprises = [...playerList]
	    .filter(p => p.totalPredicted >= 2 && p.avgError !== null && p.avgError !== undefined)
	    .sort((a, b) => (b.avgError ?? 0) - (a.avgError ?? 0))
	    .slice(0, 10)

	  // --- Team order: per team, how many had them in the correct position ---
	  const teamOrderAcc: Map<string, { teamName: string; correctCount: number; actualPosition: number }> = new Map()
	  for (const t of event.teams || []) {
	    const idx = actualTeamOrder.indexOf(t.id)
	    if (idx === -1) continue
	    let correctCount = 0
	    for (const s of submissionsWithTeamOrder) {
	      if (s.teamOrder![idx] === t.id) correctCount += 1
	    }
	    teamOrderAcc.set(t.id, { teamName: t.name, correctCount, actualPosition: idx + 1 })
	  }

	  const teamOrderList = Array.from(teamOrderAcc.entries()).map(([teamId, a]) => ({
	    teamId,
	    teamName: a.teamName,
	    actualPosition: a.actualPosition,
	    correctCount: a.correctCount,
	    totalSubmissions: totalWithTeamOrder,
	    pct: totalWithTeamOrder > 0 ? Math.round((a.correctCount / totalWithTeamOrder) * 100) : 0,
	  }))

	  const mostAccuratelyPredictedTeamOrder = [...teamOrderList].sort((a, b) => b.correctCount - a.correctCount).slice(0, 10)
	  const leastAccuratelyPredictedTeamOrder = [...teamOrderList].sort((a, b) => a.correctCount - b.correctCount).slice(0, 10)

	  // --- Correct team: per team, sum over their drafted players of (users who predicted that team for that player) ---
	  const correctTeamAcc: Map<string, { teamName: string; correctCount: number; totalPossible: number }> = new Map()
	  for (const t of event.teams || []) {
	    correctTeamAcc.set(t.id, { teamName: t.name, correctCount: 0, totalPossible: 0 })
	  }

	  for (const p of actualOrder) {
	    const teamId = p.teamId
	    const acc = correctTeamAcc.get(teamId)
	    if (!acc) continue
	    for (const s of submissions) {
	      const predTeamOrder = s.teamOrder ?? []
	      if (predTeamOrder.length !== numTeams || numTeams === 0) continue
	      const it = s.items.find(i => i.playerId === p.playerId)
	      if (!it) continue
	      acc.totalPossible += 1
	      const slotIndex = it.position - 1
	      const { teamIndex } = slotToRoundAndTeamIndex(slotIndex, numTeams)
	      const predTeamId = predTeamOrder[teamIndex]
	      if (predTeamId === teamId) acc.correctCount += 1
	    }
	  }

	  const correctTeamList = Array.from(correctTeamAcc.entries()).map(([teamId, a]) => ({
	    teamId,
	    teamName: a.teamName,
	    correctCount: a.correctCount,
	    totalPossible: a.totalPossible,
	    pct: a.totalPossible > 0 ? Math.round((a.correctCount / a.totalPossible) * 100) : 0,
	  }))

	  const mostAccuratelyPredictedCorrectTeam = [...correctTeamList]
	    .filter(x => x.totalPossible >= 1)
	    .sort((a, b) => b.correctCount - a.correctCount)
	    .slice(0, 10)

	  const leastAccuratelyPredictedCorrectTeam = [...correctTeamList]
	    .filter(x => x.totalPossible >= 1)
	    .sort((a, b) => a.correctCount - b.correctCount)
	    .slice(0, 10)

	  res.json({
	    totalSubmissions,
	    totalWithTeamOrder,
	    players: {
	      mostAccuratelyPredicted,
	      leastAccuratelyPredicted,
	      biggestSurprises,
	    },
	    teamOrder: {
	      mostAccuratelyPredicted: mostAccuratelyPredictedTeamOrder,
	      leastAccuratelyPredicted: leastAccuratelyPredictedTeamOrder,
	    },
	    correctTeam: {
	      mostAccuratelyPredicted: mostAccuratelyPredictedCorrectTeam,
	      leastAccuratelyPredicted: leastAccuratelyPredictedCorrectTeam,
	    },
	  })
	} catch (error) {
	  console.error('Get aggregate stats error:', error)
	  res.status(500).json({ error: 'Failed to calculate aggregate stats' })
	}
})

// Get user's stats
router.get('/:eventId/my-stats', authenticate, async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params
	  const userId = req.userId!

	  // Get user's submission
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

	  if (!submission) {
	    return res.status(404).json({ error: 'No submission found' })
	  }

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      teams: true,
	      draftOrder: true,
	      draftPicks: {
	        include: { player: true, team: true },
	        orderBy: { pickNumber: 'asc' },
	      },
	    },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  const actualOrder = event.draftPicks.map(p => ({
	    playerId: p.playerId,
	    pickNumber: p.pickNumber,
	    round: p.round,
	    teamId: p.teamId,
	    player: p.player,
	    team: p.team,
	  }))

	  const userOrder = submission.items.map(item => ({
	    playerId: item.playerId,
	    predictedPosition: item.position,
	    player: item.player,
	  }))

	  const numTeams = event.teams?.length ?? 0
	  const actualTeamOrder = event.draftOrder?.teamOrder?.slice(0, numTeams) ?? []
	  const predTeamOrder = submission.teamOrder ?? []
	  const canDerivePredicted = numTeams > 0 && predTeamOrder.length === numTeams
	  const teamsById = new Map((event.teams || []).map((t: { id: string; name: string }) => [t.id, t]))

	  let exactMatches = 0
	  let closeMatches = 0
	  let correctTeamMatches = 0
	  let correctRoundMatches = 0
	  let playerSlotScore = 0
	  const matchDetails: Array<{
	    playerName: string
	    predicted: number
	    actual: number | null
	    difference: number | null
	    team: string | null
	    predictedTeam: string | null
	    actualTeam: string | null
	    predictedRound: number | null
	    actualRound: number | null
	    correctTeam: boolean | null
	  }> = []

	  userOrder.forEach(userPick => {
	    const actualPick = actualOrder.find(ap => ap.playerId === userPick.playerId)
	    if (actualPick) {
	      const difference = Math.abs(userPick.predictedPosition - actualPick.pickNumber)
	      if (difference === 0) exactMatches++
	      else if (difference >= 1 && difference <= 3) closeMatches++

	      playerSlotScore += playerSlotPoints(difference)

	      let predTeamId: string | null = null
	      let predRound: number | null = null
	      let correctTeam: boolean | null = null

	      if (canDerivePredicted) {
	        const slotIndex = userPick.predictedPosition - 1
	        const { round: r, teamIndex } = slotToRoundAndTeamIndex(slotIndex, numTeams)
	        predRound = r
	        predTeamId = predTeamOrder[teamIndex] ?? null
	        if (predTeamId === actualPick.teamId) {
	          correctTeamMatches++
	          correctTeam = true
	        } else {
	          correctTeam = false
	        }
	        if (predRound === actualPick.round) correctRoundMatches++
	      }

	      const predTeamName = predTeamId ? (teamsById.get(predTeamId)?.name ?? null) : null

	      matchDetails.push({
	        playerName: userPick.player.name,
	        predicted: userPick.predictedPosition,
	        actual: actualPick.pickNumber,
	        difference,
	        team: actualPick.team?.name ?? null,
	        predictedTeam: predTeamName,
	        actualTeam: actualPick.team?.name ?? null,
	        predictedRound: predRound,
	        actualRound: actualPick.round,
	        correctTeam,
	      })
	    } else {
	      matchDetails.push({
	        playerName: userPick.player.name,
	        predicted: userPick.predictedPosition,
	        actual: null,
	        difference: null,
	        team: null,
	        predictedTeam: null,
	        actualTeam: null,
	        predictedRound: null,
	        actualRound: null,
	        correctTeam: null,
	      })
	    }
	  })

	  const POINTS_TEAM_ORDER = 5
	  const POINTS_CORRECT_TEAM = 3
	  const POINTS_CORRECT_ROUND = 2

	  let teamOrderExactMatches = 0
	  if (numTeams > 0 && predTeamOrder.length === numTeams && actualTeamOrder.length === numTeams) {
	    for (let i = 0; i < numTeams; i++) {
	      if (predTeamOrder[i] === actualTeamOrder[i]) teamOrderExactMatches++
	    }
	  }
	  const teamOrderScore = teamOrderExactMatches * POINTS_TEAM_ORDER
	  const correctTeamScore = correctTeamMatches * POINTS_CORRECT_TEAM
	  const correctRoundScore = correctRoundMatches * POINTS_CORRECT_ROUND

	  const score = playerSlotScore + teamOrderScore + correctTeamScore + correctRoundScore

	  res.json({
	    submission: {
	      submittedAt: submission.submittedAt,
	      locked: submission.locked,
	    },
	    stats: {
	      exactMatches,
	      closeMatches,
	      teamOrderExactMatches,
	      teamOrderScore,
	      correctTeamMatches,
	      correctRoundMatches,
	      correctTeamScore,
	      correctRoundScore,
	      playerSlotScore,
	      score,
	      totalPlayers: userOrder.length,
	      categoryScores: {
	        playerSlot: playerSlotScore,
	        teamOrder: teamOrderScore,
	        correctTeam: correctTeamScore,
	        correctRound: correctRoundScore,
	      },
	      matchDetails: matchDetails.sort((a, b) => {
	        if (a.actual === null) return 1
	        if (b.actual === null) return -1
	        return (a.difference || 0) - (b.difference || 0)
	      }),
	    },
	  })
	} catch (error) {
	  console.error('Get user stats error:', error)
	  res.status(500).json({ error: 'Failed to fetch stats' })
	}
})

// Export data (admin only)
router.get('/:eventId/export', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
	try {
	  const { eventId } = req.params

	  const event = await prisma.event.findUnique({
	    where: { id: eventId },
	  })

	  if (!event) {
	    return res.status(404).json({ error: 'Event not found' })
	  }

	  // Get all data
	  const eventData = await prisma.event.findUnique({
	    where: { id: eventId },
	    include: {
	      players: true,
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
	      submissions: {
	        include: {
	          user: {
	            select: {
	              id: true,
	              discordUsername: true,
	            },
	          },
	          items: {
	            include: {
	              player: true,
	            },
	            orderBy: {
	              position: 'asc',
	            },
	          },
	        },
	      },
	    },
	  })

	  res.json({ event: eventData })
	} catch (error) {
	  console.error('Export data error:', error)
	  res.status(500).json({ error: 'Failed to export data' })
	}
})

export default router
