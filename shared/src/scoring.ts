/**
 * Prediction scoring rules. Shared so the frontend can explain the scoring the backend applies.
 */

/** Points for predicting a team's position in the draft order exactly right. */
export const POINTS_TEAM_ORDER = 5

/** Points for predicting which team drafts a given player, regardless of slot. */
export const POINTS_CORRECT_TEAM = 3

/** Points for predicting the round a given player goes in, regardless of slot. */
export const POINTS_CORRECT_ROUND = 2

/**
 * Points for how close a player's predicted pick number was to their actual one.
 * Exact 10; off by 1: 5; by 2: 3; by 3: 1; further: 0.
 */
export function playerSlotPoints(difference: number): number {
	if (difference === 0) return 10
	if (difference === 1) return 5
	if (difference === 2) return 3
	if (difference === 3) return 1
	return 0
}
