import { Player } from './types'

interface PlayerPoolProps {
	players: Player[]
	searchTerm: string
	onSearchChange: (value: string) => void
	selectedPlayerId: string | null
	onSelectPlayer: (playerId: string) => void
	/** Whether the viewer is allowed to pick right now. Read-only viewers still see the list. */
	canMakePick: boolean
	onMakePick: () => void
	submitting?: boolean
}

export function PlayerPool({
	players,
	searchTerm,
	onSearchChange,
	selectedPlayerId,
	onSelectPlayer,
	canMakePick,
	onMakePick,
	submitting = false,
}: PlayerPoolProps) {
	const filtered = players.filter((player) =>
		player.name.toLowerCase().includes(searchTerm.toLowerCase()),
	)

	return (
		<div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
			<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
				Available Players
			</h3>
			<input
				type="text"
				placeholder="Search players..."
				aria-label="Search available players"
				value={searchTerm}
				onChange={(e) => onSearchChange(e.target.value)}
				className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
			/>
			<div className="max-h-96 overflow-y-auto flex flex-wrap gap-2 content-start">
				{filtered.length === 0 ? (
					<p className="text-sm text-gray-500 dark:text-gray-400">
						{players.length === 0 ? 'Every player has been drafted.' : 'No matching players.'}
					</p>
				) : (
					filtered.map((player) => (
						<button
							key={player.id}
							type="button"
							title={player.team ? `${player.name} (${player.team})` : player.name}
							aria-pressed={selectedPlayerId === player.id}
							onClick={() => {
								if (canMakePick) onSelectPlayer(player.id)
							}}
							className={`inline-flex items-center px-2 py-1 rounded-md border text-sm transition-colors ${
								selectedPlayerId === player.id
									? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500 dark:border-indigo-400'
									: 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
							} ${canMakePick ? 'cursor-pointer' : 'cursor-default opacity-75'}`}
						>
							<span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[11rem]">
								{player.name}
							</span>
						</button>
					))
				)}
			</div>
			{canMakePick && selectedPlayerId && (
				<div className="mt-4">
					<button
						onClick={onMakePick}
						disabled={submitting}
						className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
					>
						{submitting ? 'Making pick...' : 'Make Pick'}
					</button>
				</div>
			)}
		</div>
	)
}
