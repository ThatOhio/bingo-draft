/**
 * Snake-draft order math.
 *
 * Single source of truth for both sides of the wire: the backend uses this to build the
 * stored pick order and to score predictions, and the frontend uses it to render the
 * prediction board. These two must agree exactly or predictions score against the wrong
 * slots, so do not reimplement any of it locally.
 *
 * Convention: odd rounds run through the teams forwards, even rounds backwards.
 */

/**
 * Converts a 0-based slot index to round (1-based) and team index in snake order.
 */
export function slotToRoundAndTeamIndex(
	slotIndex: number,
	numTeams: number,
): { round: number; teamIndex: number } {
	const round = Math.floor(slotIndex / numTeams) + 1
	const posInRound = slotIndex % numTeams
	const teamIndex = round % 2 === 1 ? posInRound : numTeams - 1 - posInRound
	return { round, teamIndex }
}

/**
 * Converts round (1-based) and team index to 0-based slot index in snake order.
 */
export function roundAndTeamIndexToSlot(
	round: number,
	teamIndex: number,
	numTeams: number,
): number {
	return (round - 1) * numTeams + (round % 2 === 1 ? teamIndex : numTeams - 1 - teamIndex)
}

/**
 * True when the given round/team cell maps to a slot that actually exists in the draft.
 * The final round is partial whenever the player count is not a multiple of the team count.
 */
export function isValidSlot(
	round: number,
	teamIndex: number,
	numTeams: number,
	totalSlots: number,
): boolean {
	return roundAndTeamIndexToSlot(round, teamIndex, numTeams) < totalSlots
}

/**
 * Expands a base team order (who picks 1st, 2nd, ...) into the full snake pick order,
 * long enough to cover totalPicks. Index i of the result is the team that owns pick i + 1.
 *
 * The length derives from the actual pick count, so there is no upper bound on event size.
 */
export function buildSnakeOrder(baseOrder: string[], totalPicks: number): string[] {
	if (baseOrder.length === 0) return []

	const rounds = Math.max(1, Math.ceil(totalPicks / baseOrder.length))
	const snakeOrder: string[] = []
	for (let round = 1; round <= rounds; round++) {
		if (round % 2 === 1) {
			snakeOrder.push(...baseOrder)
		} else {
			snakeOrder.push(...[...baseOrder].reverse())
		}
	}
	return snakeOrder
}
