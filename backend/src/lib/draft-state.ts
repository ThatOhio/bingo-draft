import prisma from '../db'
import { getIO } from '../socketManager'

/**
 * Builds the full live-draft payload for an event.
 *
 * Single source of truth for the shape returned by GET /api/draft/:eventId/state and
 * pushed over the `draft-update` socket event, so pollers and subscribers can never
 * disagree about the state.
 *
 * Deliberately excludes per-team draft picks: the top-level `picks` array already
 * carries every pick with its team, and duplicating them roughly doubled the payload
 * that gets fanned out to every viewer on each pick.
 *
 * Returns null when the event does not exist.
 */
export async function buildDraftState(eventId: string) {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		include: {
			draftOrder: true,
			teams: {
				include: {
					captains: { select: { id: true, discordUsername: true } },
				},
			},
			draftPicks: {
				include: {
					team: { select: { id: true, name: true } },
					player: true,
				},
				orderBy: { pickNumber: 'asc' },
			},
			players: { orderBy: { name: 'asc' } },
		},
	})

	if (!event) {
		return null
	}

	const draftedPlayerIds = new Set(event.draftPicks.map((p) => p.playerId))
	const availablePlayers = event.players.filter((p) => !draftedPlayerIds.has(p.id))

	const teamIds = event.teams.map((t) => t.id)
	const validDisplayOrder =
		event.teamDraftOrder.length === teamIds.length &&
		teamIds.every((id) => event.teamDraftOrder.includes(id)) &&
		new Set(event.teamDraftOrder).size === event.teamDraftOrder.length

	return {
		// Carried in the payload so pause/resume and completion reach viewers over the
		// socket instead of forcing a second request for the event.
		eventStatus: event.status,
		totalSlots: event.players.length,
		draftOrder: event.draftOrder,
		teams: event.teams,
		picks: event.draftPicks,
		availablePlayers,
		currentTeam: event.draftOrder
			? event.teams.find(
					(t) => t.id === event.draftOrder!.teamOrder[event.draftOrder!.currentPick],
				) ?? null
			: null,
		teamDraftOrder: validDisplayOrder ? event.teamDraftOrder : undefined,
	}
}

/**
 * Pushes the current draft state to everyone watching the event.
 *
 * Call after every mutation that changes what the draft board shows. Failures are logged
 * and swallowed: a broadcast problem must never fail the request that caused it, and
 * clients recover on their next reconnect or visibility refetch.
 */
export async function broadcastDraftState(eventId: string): Promise<void> {
	try {
		const state = await buildDraftState(eventId)
		if (!state) {
			return
		}
		getIO().to(`event:${eventId}`).emit('draft-update', state)
	} catch (err) {
		console.error('Failed to broadcast draft state:', err)
	}
}
