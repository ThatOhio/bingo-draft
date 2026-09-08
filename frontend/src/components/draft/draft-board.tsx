import { useMemo } from 'react'
import { DraftOrderState, DraftPick, Team } from './types'

interface DraftBoardProps {
	teams: Team[]
	picks: DraftPick[]
	/** Team ids in column order, left to right. */
	columnOrder: string[]
	draftOrder: DraftOrderState | null
	/** Total picks in the draft, used to size the board. */
	totalSlots: number
}

/**
 * Round-by-team grid of the draft.
 *
 * Picks are indexed from the flat `picks` list rather than read off each team, so the
 * state payload does not have to carry every pick twice.
 */
export function DraftBoard({
	teams,
	picks,
	columnOrder,
	draftOrder,
	totalSlots,
}: DraftBoardProps) {
	const numTeams = teams.length || 1
	const compact = teams.length >= 5

	const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])

	const pickByCell = useMemo(() => {
		const map = new Map<string, DraftPick>()
		for (const pick of picks) {
			map.set(`${pick.team.id}-${pick.round}`, pick)
		}
		return map
	}, [picks])

	const rounds = useMemo(() => {
		const count = Math.ceil(totalSlots / numTeams) || 1
		return Array.from({ length: count }, (_, i) => i + 1)
	}, [totalSlots, numTeams])

	const draftInProgress = draftOrder !== null && draftOrder.currentPick < totalSlots
	const onTheClockTeamId = draftOrder ? draftOrder.teamOrder[draftOrder.currentPick] : undefined

	return (
		<div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-4 overflow-x-auto">
			<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Draft Board</h3>
			<table className="w-full border-collapse min-w-[400px]">
				<thead>
					<tr>
						<th className="text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[4rem]">
							Round
						</th>
						{columnOrder.map((teamId) => {
							const team = teamsById.get(teamId)
							if (!team) return null
							const isCurrentTeam = draftInProgress && onTheClockTeamId === teamId
							return (
								<th
									key={team.id}
									title={compact ? team.name : undefined}
									className={`text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold ${
										compact ? 'min-w-0 max-w-[5.5rem] truncate' : 'min-w-[7rem]'
									} ${
										isCurrentTeam
											? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
											: 'text-gray-700 dark:text-gray-300'
									}`}
								>
									{team.name}
								</th>
							)
						})}
					</tr>
				</thead>
				<tbody>
					{rounds.map((round) => (
						<tr key={round} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
							<td className="p-2 border-b border-gray-100 dark:border-gray-700 font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10">
								{round}
							</td>
							{columnOrder.map((teamId) => {
								const team = teamsById.get(teamId)
								if (!team) return null
								const pick = pickByCell.get(`${teamId}-${round}`)
								const isCurrentCell =
									draftInProgress &&
									draftOrder!.currentRound === round &&
									onTheClockTeamId === teamId
								return (
									<td
										key={team.id}
										className={`p-2 border-b border-gray-100 dark:border-gray-700 align-top ${
											isCurrentCell
												? 'bg-amber-200/80 dark:bg-amber-900/50 ring-2 ring-amber-500 dark:ring-amber-600 ring-inset'
												: 'bg-white dark:bg-gray-800'
										}`}
									>
										{pick ? (
											<span className="text-gray-900 dark:text-gray-100">{pick.player.name}</span>
										) : isCurrentCell ? (
											<span className="text-amber-700 dark:text-amber-300 text-sm italic">
												On the clock
											</span>
										) : (
											<span className="text-gray-300 dark:text-gray-600">-</span>
										)}
									</td>
								)
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
