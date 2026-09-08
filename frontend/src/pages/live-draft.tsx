import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSocket } from '../contexts/socket-context'
import { useAuth } from '../contexts/auth-context'
import { useToast } from '../contexts/toast-context'
import { useConfirm } from '../contexts/confirm-context'
import { AppHeader } from '../components/app-header'
import { DraftBoard } from '../components/draft/draft-board'
import { PlayerPool } from '../components/draft/player-pool'
import { RecentPicks } from '../components/draft/recent-picks'
import { DraftState } from '../components/draft/types'
import { api } from '../lib/api-client'
import { getErrorMessage } from '../utils/get-error-message'

/**
 * How often to re-fetch state while the socket is down. Only ever runs as a fallback:
 * while connected, updates arrive by push, so a room of viewers costs the server one
 * query per pick rather than one query per viewer per interval.
 */
const DISCONNECTED_POLL_MS = 30000

/** Teams at or above this count get the full-width board layout. */
const WIDE_LAYOUT_MIN_TEAMS = 6

function LiveDraft() {
	const { eventCode } = useParams<{ eventCode: string }>()
	const { user } = useAuth()
	const { socket, connected, connectToEvent } = useSocket()
	const { showError } = useToast()
	const confirm = useConfirm()

	const [eventId, setEventId] = useState<string | null>(null)
	// Live-draft-only events have no event detail page to go back to.
	const [fantasyEnabled, setFantasyEnabled] = useState(true)
	const [draftState, setDraftState] = useState<DraftState | null>(null)
	const [loading, setLoading] = useState(true)
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const hasConnectedBefore = useRef(false)

	// The event lookup exists only to turn the URL's event code into an id; everything
	// the page renders comes from the draft state payload.
	useEffect(() => {
		if (!eventCode) return
		let cancelled = false

		api
			.get(`/api/events/code/${eventCode}`)
			.then((res) => {
				if (cancelled) return
				setEventId(res.data.event.id)
				setFantasyEnabled(res.data.event.fantasyEnabled !== false)
			})
			.catch((error) => {
				console.error('Failed to fetch event:', error)
				if (!cancelled) setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [eventCode])

	const fetchDraftState = useCallback(async () => {
		if (!eventId) return
		try {
			const response = await api.get(`/api/draft/${eventId}/state`)
			setDraftState(response.data)
		} catch (error) {
			console.error('Failed to fetch draft state:', error)
		} finally {
			setLoading(false)
		}
	}, [eventId])

	useEffect(() => {
		if (eventId) fetchDraftState()
	}, [eventId, fetchDraftState])

	useEffect(() => {
		if (!eventId || !socket) return

		connectToEvent(eventId)

		const handleUpdate = (state: DraftState) => setDraftState(state)
		socket.on('draft-update', handleUpdate)

		return () => {
			socket.off('draft-update', handleUpdate)
		}
	}, [eventId, socket, connectToEvent])

	// Rejoin the room and resync after a reconnect, since updates published while the
	// socket was down were never delivered. The first connect is skipped: the initial
	// fetch above already covers it.
	useEffect(() => {
		if (!eventId || !connected) return

		connectToEvent(eventId)
		if (hasConnectedBefore.current) {
			fetchDraftState()
		}
		hasConnectedBefore.current = true
	}, [eventId, connected, connectToEvent, fetchDraftState])

	// A backgrounded tab can miss updates; resync when the viewer comes back.
	useEffect(() => {
		const handleVisibility = () => {
			if (document.visibilityState === 'visible') fetchDraftState()
		}
		document.addEventListener('visibilitychange', handleVisibility)
		return () => document.removeEventListener('visibilitychange', handleVisibility)
	}, [fetchDraftState])

	// Safety net, and only while the socket is actually down.
	useEffect(() => {
		if (connected || !eventId) return
		const interval = setInterval(fetchDraftState, DISCONNECTED_POLL_MS)
		return () => clearInterval(interval)
	}, [connected, eventId, fetchDraftState])

	const isAdmin = user?.role === 'ADMIN'
	const currentTeam = draftState?.currentTeam
	const discordUsername = (user?.discordUsername ?? '').toLowerCase()
	const isCaptainOfCurrentTeam = !!currentTeam?.captains?.some(
		(c) => (c.discordUsername || '').toLowerCase() === discordUsername,
	)
	const isDrafting = draftState?.eventStatus === 'DRAFTING'
	const canMakePick = !!user && isDrafting && (isAdmin || isCaptainOfCurrentTeam)
	const canPauseResume =
		isAdmin && (draftState?.eventStatus === 'DRAFTING' || draftState?.eventStatus === 'PAUSED')

	const handleMakePick = async () => {
		if (!selectedPlayer || !eventId) return

		setSubmitting(true)
		try {
			await api.post(`/api/draft/${eventId}/pick`, { playerId: selectedPlayer })
			setSelectedPlayer(null)
			// The resulting state arrives over the socket.
		} catch (err: unknown) {
			showError(getErrorMessage(err, 'Failed to make pick'))
		} finally {
			setSubmitting(false)
		}
	}

	const handlePause = async () => {
		if (!eventId) return
		try {
			await api.post(`/api/draft/${eventId}/pause`)
		} catch (err: unknown) {
			showError(getErrorMessage(err, 'Failed to pause draft'))
		}
	}

	const handleResume = async () => {
		if (!eventId) return
		try {
			await api.post(`/api/draft/${eventId}/resume`)
		} catch (err: unknown) {
			showError(getErrorMessage(err, 'Failed to resume draft'))
		}
	}

	const handleUndo = async () => {
		if (!eventId || !isAdmin) return

		const confirmed = await confirm({
			title: 'Undo the last pick?',
			message: 'The most recent pick is removed and the draft returns to that slot.',
			confirmLabel: 'Undo pick',
			destructive: true,
		})
		if (!confirmed) return

		try {
			await api.post(`/api/draft/${eventId}/undo`)
		} catch (err: unknown) {
			showError(getErrorMessage(err, 'Failed to undo pick'))
		}
	}

	const columnOrder = useMemo(() => {
		if (!draftState) return []
		const teamIds = draftState.teams.map((t) => t.id)
		const custom = draftState.teamDraftOrder
		if (
			custom &&
			custom.length === teamIds.length &&
			teamIds.every((id) => custom.includes(id)) &&
			new Set(custom).size === custom.length
		) {
			return custom
		}
		if (draftState.draftOrder) {
			return draftState.draftOrder.teamOrder.slice(0, teamIds.length)
		}
		return teamIds
	}, [draftState])

	if (loading || !draftState) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
				<div className="text-lg text-gray-600 dark:text-gray-400">Loading draft...</div>
			</div>
		)
	}

	const numTeams = draftState.teams.length
	const useWideLayout = numTeams >= WIDE_LAYOUT_MIN_TEAMS

	const board = (
		<DraftBoard
			teams={draftState.teams}
			picks={draftState.picks}
			columnOrder={columnOrder}
			draftOrder={draftState.draftOrder}
			totalSlots={draftState.totalSlots}
		/>
	)
	const pool = (
		<PlayerPool
			players={draftState.availablePlayers}
			searchTerm={searchTerm}
			onSearchChange={setSearchTerm}
			selectedPlayerId={selectedPlayer}
			onSelectPlayer={setSelectedPlayer}
			canMakePick={canMakePick}
			onMakePick={handleMakePick}
			submitting={submitting}
		/>
	)
	const recentPicks = <RecentPicks picks={draftState.picks} />

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-gray-900">
			<AppHeader
				backLink={fantasyEnabled ? `/event/${eventCode}` : '/'}
				title="Live Draft"
				rightSlot={
					isAdmin ? (
						<div className="flex gap-2">
							{canPauseResume && draftState.eventStatus === 'DRAFTING' && (
								<button
									onClick={handlePause}
									className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
								>
									Pause Draft
								</button>
							)}
							{canPauseResume && draftState.eventStatus === 'PAUSED' && (
								<button
									onClick={handleResume}
									className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
								>
									Resume Draft
								</button>
							)}
							<button
								onClick={handleUndo}
								className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
							>
								Undo Last Pick
							</button>
						</div>
					) : undefined
				}
			/>

			<main
				className={`mx-auto py-6 sm:px-6 lg:px-8 ${
					useWideLayout ? 'max-w-[min(1600px,96vw)]' : 'max-w-7xl'
				}`}
			>
				<div className="px-4 py-6 sm:px-0">
					<div className="mb-6 bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
						<div className="flex justify-between items-center">
							<div>
								<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
									Round {draftState.draftOrder?.currentRound || 1}
								</h2>
								<p className="text-gray-600 dark:text-gray-400">
									Pick #{draftState.draftOrder ? draftState.draftOrder.currentPick + 1 : 0} of{' '}
									{draftState.totalSlots}
								</p>
								{!draftState.draftOrder && (
									<div className="mt-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-sm font-medium">
										The draft has not been initialized yet.
									</div>
								)}
								{draftState.eventStatus === 'PAUSED' && (
									<div className="mt-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded text-sm font-medium">
										⏸ Draft Paused
									</div>
								)}
								{!connected && (
									<div className="mt-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm font-medium">
										Reconnecting… updates may lag
									</div>
								)}
							</div>
							{draftState.currentTeam && (
								<div className="text-right">
									<p className="text-sm text-gray-600 dark:text-gray-400">Current Team:</p>
									<p className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">
										{draftState.currentTeam.name}
									</p>
								</div>
							)}
						</div>
					</div>

					{useWideLayout ? (
						/* Many teams: board full width on top, then Players | Recent Picks */
						<div className="space-y-6">
							{board}
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								{pool}
								{recentPicks}
							</div>
						</div>
					) : (
						<div className="grid lg:grid-cols-3 gap-6">
							<div className="lg:col-span-1">{pool}</div>
							<div className="lg:col-span-2 space-y-6">
								{board}
								{recentPicks}
							</div>
						</div>
					)}
				</div>
			</main>
		</div>
	)
}

export default LiveDraft
