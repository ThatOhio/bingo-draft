import { DraftPick } from './types'

interface RecentPicksProps {
	picks: DraftPick[]
	/** How many of the most recent picks to show. */
	limit?: number
}

export function RecentPicks({ picks, limit = 10 }: RecentPicksProps) {
	const recent = picks.slice(-limit).reverse()

	return (
		<div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
			<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Picks</h3>
			<div className="space-y-2 max-h-64 overflow-y-auto">
				{recent.length === 0 ? (
					<p className="text-sm text-gray-500 dark:text-gray-400">No picks yet.</p>
				) : (
					recent.map((pick) => (
						<div
							key={pick.id}
							className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
						>
							<div>
								<span className="font-medium text-gray-900 dark:text-gray-100">#{pick.pickNumber}</span>{' '}
								-{' '}
								<span className="font-semibold text-gray-900 dark:text-gray-100">
									{pick.player.name}
								</span>{' '}
								→ <span className="text-indigo-600 dark:text-indigo-400">{pick.team.name}</span>
							</div>
							<div className="text-sm text-gray-500 dark:text-gray-400">Round {pick.round}</div>
						</div>
					))
				)}
			</div>
		</div>
	)
}
