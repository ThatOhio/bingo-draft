import {
	POINTS_TEAM_ORDER,
	POINTS_CORRECT_TEAM,
	POINTS_CORRECT_ROUND,
	playerSlotPoints,
	slotToRoundAndTeamIndex,
} from '@bingo-draft/shared'
import prisma from '../db'

/**
 * One prediction compared against what actually happened.
 * `actual` and everything derived from it are null when the player was never drafted.
 */
export interface MatchDetail {
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
}

export interface UserStatsPayload {
	submission: {
		submittedAt: Date
		locked: boolean
	}
	stats: {
		exactMatches: number
		closeMatches: number
		teamOrderExactMatches: number
		teamOrderScore: number
		correctTeamMatches: number
		correctRoundMatches: number
		correctTeamScore: number
		correctRoundScore: number
		playerSlotScore: number
		score: number
		totalPlayers: number
		categoryScores: {
			playerSlot: number
			teamOrder: number
			correctTeam: number
			correctRound: number
		}
		matchDetails: MatchDetail[]
	}
	userName: string
}

export type UserStatsResult =
	| { ok: true; data: UserStatsPayload }
	| { ok: false; reason: 'event-not-found' | 'no-submission' }

/**
 * Scores one user's prediction for an event.
 *
 * Backs both GET /api/stats/:eventId/my-stats and GET /api/stats/:eventId/user/:userId,
 * which were previously two verbatim copies of this logic. Deliberately does not check
 * event status: the two routes gate on completion differently and each keeps its own rule.
 */
export async function computeUserStats(
	eventId: string,
	userId: string,
): Promise<UserStatsResult> {
	const [submission, event] = await Promise.all([
		prisma.draftOrderSubmission.findUnique({
			where: { userId_eventId: { userId, eventId } },
			include: {
				user: { select: { discordUsername: true } },
				items: {
					include: { player: true },
					orderBy: { position: 'asc' },
				},
			},
		}),
		prisma.event.findUnique({
			where: { id: eventId },
			include: {
				teams: true,
				draftOrder: true,
				draftPicks: {
					include: { player: true, team: true },
					orderBy: { pickNumber: 'asc' },
				},
			},
		}),
	])

	if (!event) {
		return { ok: false, reason: 'event-not-found' }
	}
	if (!submission) {
		return { ok: false, reason: 'no-submission' }
	}

	const actualByPlayerId = new Map(event.draftPicks.map((p) => [p.playerId, p]))

	const numTeams = event.teams.length
	const actualTeamOrder = event.draftOrder?.teamOrder?.slice(0, numTeams) ?? []
	const predTeamOrder = submission.teamOrder ?? []
	const canDerivePredicted = numTeams > 0 && predTeamOrder.length === numTeams
	const teamNamesById = new Map(event.teams.map((t) => [t.id, t.name]))

	let exactMatches = 0
	let closeMatches = 0
	let correctTeamMatches = 0
	let correctRoundMatches = 0
	let playerSlotScore = 0
	const matchDetails: MatchDetail[] = []

	for (const item of submission.items) {
		const actualPick = actualByPlayerId.get(item.playerId)

		if (!actualPick) {
			matchDetails.push({
				playerName: item.player.name,
				predicted: item.position,
				actual: null,
				difference: null,
				team: null,
				predictedTeam: null,
				actualTeam: null,
				predictedRound: null,
				actualRound: null,
				correctTeam: null,
			})
			continue
		}

		const difference = Math.abs(item.position - actualPick.pickNumber)
		if (difference === 0) {
			exactMatches++
		} else if (difference <= 3) {
			closeMatches++
		}
		playerSlotScore += playerSlotPoints(difference)

		let predTeamId: string | null = null
		let predRound: number | null = null
		let correctTeam: boolean | null = null

		if (canDerivePredicted) {
			const { round, teamIndex } = slotToRoundAndTeamIndex(item.position - 1, numTeams)
			predRound = round
			predTeamId = predTeamOrder[teamIndex] ?? null
			correctTeam = predTeamId === actualPick.teamId
			if (correctTeam) {
				correctTeamMatches++
			}
			if (predRound === actualPick.round) {
				correctRoundMatches++
			}
		}

		matchDetails.push({
			playerName: item.player.name,
			predicted: item.position,
			actual: actualPick.pickNumber,
			difference,
			team: actualPick.team?.name ?? null,
			predictedTeam: predTeamId ? teamNamesById.get(predTeamId) ?? null : null,
			actualTeam: actualPick.team?.name ?? null,
			predictedRound: predRound,
			actualRound: actualPick.round,
			correctTeam,
		})
	}

	let teamOrderExactMatches = 0
	if (canDerivePredicted && actualTeamOrder.length === numTeams) {
		for (let i = 0; i < numTeams; i++) {
			if (predTeamOrder[i] === actualTeamOrder[i]) {
				teamOrderExactMatches++
			}
		}
	}

	const teamOrderScore = teamOrderExactMatches * POINTS_TEAM_ORDER
	const correctTeamScore = correctTeamMatches * POINTS_CORRECT_TEAM
	const correctRoundScore = correctRoundMatches * POINTS_CORRECT_ROUND

	// Undrafted players sort last; the rest by how close the prediction was.
	matchDetails.sort((a, b) => {
		if (a.actual === null) return 1
		if (b.actual === null) return -1
		return (a.difference ?? 0) - (b.difference ?? 0)
	})

	return {
		ok: true,
		data: {
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
				score: playerSlotScore + teamOrderScore + correctTeamScore + correctRoundScore,
				totalPlayers: submission.items.length,
				categoryScores: {
					playerSlot: playerSlotScore,
					teamOrder: teamOrderScore,
					correctTeam: correctTeamScore,
					correctRound: correctRoundScore,
				},
				matchDetails,
			},
			userName: submission.user.discordUsername,
		},
	}
}
