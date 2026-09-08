export interface Player {
	id: string
	name: string
	team: string | null
}

export interface Captain {
	id?: string
	discordUsername: string
}

export interface Team {
	id: string
	name: string
	captains?: Captain[]
}

export interface DraftPick {
	id: string
	team: { id: string; name: string }
	player: Player
	pickNumber: number
	round: number
	timestamp?: string
}

export interface DraftOrderState {
	currentPick: number
	currentRound: number
	teamOrder: string[]
}

/**
 * Live draft payload from GET /api/draft/:eventId/state and the `draft-update` socket
 * event. Both come from buildDraftState on the server, so this shape covers both.
 */
export interface DraftState {
	eventStatus: string
	/** Number of picks in the whole draft, i.e. the event's player count. */
	totalSlots: number
	draftOrder: DraftOrderState | null
	teams: Team[]
	picks: DraftPick[]
	availablePlayers: Player[]
	currentTeam: Team | null
	/** Column order for the board; admins can change it during a draft. */
	teamDraftOrder?: string[]
}
