import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import {
	DndContext,
	DragEndEvent,
	closestCenter,
	useDraggable,
	useDroppable,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../contexts/auth-context'
import { AppHeader } from '../components/app-header'
import { getErrorMessage } from '../utils/get-error-message'

interface Player {
	id: string
	name: string
	team: string | null
}

interface Team {
	id: string
	name: string
}

interface SubmissionItem {
	playerId: string
	position: number
	player: Player
}

interface Submission {
	id: string
	submittedAt: string
	locked: boolean
	teamOrder?: string[]
	items: SubmissionItem[]
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// --- Snake order helpers (must match backend) ---

/**
 * Converts a 0-based slot index to round (1-based) and team index in snake order.
 */
function slotToRoundAndTeamIndex(
	slotIndex: number,
	numTeams: number
): { round: number; teamIndex: number } {
	const round = Math.floor(slotIndex / numTeams) + 1
	const posInRound = slotIndex % numTeams
	const teamIndex = round % 2 === 1 ? posInRound : numTeams - 1 - posInRound
	return { round, teamIndex }
}

/**
 * Converts round (1-based) and team index to 0-based slot index in snake order.
 */
function roundAndTeamIndexToSlot(round: number, teamIndex: number, numTeams: number): number {
	return (round - 1) * numTeams + (round % 2 === 1 ? teamIndex : numTeams - 1 - teamIndex)
}

function isValidSlot(round: number, teamIndex: number, numTeams: number, totalSlots: number): boolean {
	return roundAndTeamIndexToSlot(round, teamIndex, numTeams) < totalSlots
}

/**
 * Converts grid (round-teamId -> playerId) to placements for API. Position is 1-based pick number.
 * Preserves each player's board position for partial saves.
 */
function gridToPlacements(
	grid: Record<string, string>,
	teamIds: string[],
	numTeams: number,
	totalSlots: number
): { playerId: string; position: number }[] {
	const placements: { playerId: string; position: number }[] = []
	for (const key of Object.keys(grid)) {
	  const playerId = grid[key]
	  if (!playerId) continue
	  const dashIdx = key.indexOf('-')
	  if (dashIdx === -1) continue
	  const round = parseInt(key.slice(0, dashIdx), 10)
	  const teamId = key.slice(dashIdx + 1)
	  const teamIndex = teamIds.indexOf(teamId)
	  if (teamIndex === -1) continue
	  if (!isValidSlot(round, teamIndex, numTeams, totalSlots)) continue
	  const slotIndex = roundAndTeamIndexToSlot(round, teamIndex, numTeams)
	  placements.push({ playerId, position: slotIndex + 1 })
	}
	return placements
}

/**
 * Converts submission items (position 1-based) to grid keyed by round-teamId.
 */
function submissionToGrid(
	items: SubmissionItem[],
	teamIds: string[],
	numTeams: number
): Record<string, string> {
	const grid: Record<string, string> = {}
	for (const it of items) {
	  const pickIndex = it.position - 1
	  const { round, teamIndex } = slotToRoundAndTeamIndex(pickIndex, numTeams)
	  const teamId = teamIds[teamIndex]
	  grid[`${round}-${teamId}`] = it.playerId
	}
	return grid
}

/**
 * Extracts from grid: for each teamId, round -> playerId. Used when editing team order to
 * rebuild the grid after reorder; each team keeps its players in the same round/pick order.
 */
function gridToPlayersByTeam(
	grid: Record<string, string>,
	teamIds: string[],
	numTeams: number,
	totalSlots: number
): Record<string, Record<number, string>> {
	const byTeam: Record<string, Record<number, string>> = {}
	for (let slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
	  const { round, teamIndex } = slotToRoundAndTeamIndex(slotIndex, numTeams)
	  const teamId = teamIds[teamIndex]
	  if (teamIds.indexOf(teamId) === -1) continue
	  const key = `${round}-${teamId}`
	  const playerId = grid[key]
	  if (playerId) {
	    if (!byTeam[teamId]) byTeam[teamId] = {}
	    byTeam[teamId][round] = playerId
	  }
	}
	return byTeam
}

/**
 * Rebuilds grid from playersByTeam and a (possibly new) team order. Each team's players stay
 * with that team in the same round/pick order; only the columns (team order) change.
 */
function playersByTeamToGrid(
	playersByTeam: Record<string, Record<number, string>>,
	teamIds: string[],
	numTeams: number,
	totalSlots: number
): Record<string, string> {
	const grid: Record<string, string> = {}
	for (let slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
	  const { round, teamIndex } = slotToRoundAndTeamIndex(slotIndex, numTeams)
	  const teamId = teamIds[teamIndex]
	  const playerId = playersByTeam[teamId]?.[round]
	  if (playerId) grid[`${round}-${teamId}`] = playerId
	}
	return grid
}

/**
 * Draggable chip for a player placed in a draft cell. Used when the cell is filled.
 */
function DraggableCellChip({
	player,
	round,
	teamId,
	disabled,
}: {
	player: Player
	round: number
	teamId: string
	disabled?: boolean
}) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
	  id: `placed-${round}-${teamId}`,
	  data: { playerId: player.id, round, teamId, source: 'cell' as const },
	  disabled,
	})

	return (
	  <div
	    ref={setNodeRef}
	    {...attributes}
	    {...listeners}
	    className={`text-sm font-medium text-gray-900 dark:text-gray-100 truncate px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 cursor-grab active:cursor-grabbing ${
	      isDragging ? 'opacity-50' : ''
	    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
	  >
	    {player.name}
	  </div>
	)
}

/**
 * Droppable draft cell in the board. Accepts drops from pool or other cells; shows player or placeholder.
 */
function DraftCell({
	round,
	teamId,
	teamIndex,
	numTeams,
	totalSlots,
	playerId,
	players,
	disabled,
}: {
	round: number
	teamId: string
	teamIndex: number
	numTeams: number
	totalSlots: number
	playerId: string | undefined
	players: Player[]
	disabled?: boolean
}) {
	const valid = isValidSlot(round, teamIndex, numTeams, totalSlots)
	const { setNodeRef, isOver } = useDroppable({
	  id: `cell-${round}-${teamId}`,
	  data: { round, teamId },
	  disabled: disabled || !valid,
	})

	const playerObj = playerId ? players.find((p) => p.id === playerId) : undefined

	const compact = numTeams >= 5
	return (
	  <td
	    ref={setNodeRef}
	    className={`${compact ? 'min-w-[5rem]' : 'min-w-[7rem]'} p-1.5 align-top border-b ` +
		`border-gray-100 dark:border-gray-700 ${
			!valid ? 'bg-gray-50 dark:bg-gray-700/50'
				: isOver
					? 'bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-300 ' +
						'dark:ring-indigo-600 ring-inset'
					: 'bg-white dark:bg-gray-800'
		} ${!valid ? '' : 'min-h-[2.25rem]'}`}
	  >
	    {!valid ? (
	      <span className="text-gray-300 dark:text-gray-500 text-xs">-</span>
	    ) : playerObj ? (
	      <DraggableCellChip player={playerObj} round={round} teamId={teamId} disabled={disabled} />
	    ) : (
	      <div className="text-gray-400 dark:text-gray-500 text-sm italic min-h-[1.5rem]">&nbsp;</div>
	    )}
	  </td>
	)
}

/**
 * Draggable chip for a player in the pool. Can be dropped onto cells or back to the pool.
 */
function PlayerPoolItem({ player, disabled }: { player: Player; disabled?: boolean }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
	  id: `player-${player.id}`,
	  data: { playerId: player.id, source: 'pool' as const },
	  disabled,
	})

	const title = player.team ? `${player.name} (${player.team})` : player.name

	return (
	  <div
	    ref={setNodeRef}
	    {...attributes}
	    {...listeners}
	    title={title}
	    className={`inline-flex items-center px-2 py-1 rounded-md border text-sm cursor-grab active:cursor-grabbing transition-colors ${
	      isDragging ? 'opacity-50' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/30'
	    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
	  >
	    <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[11rem]">{player.name}</span>
	  </div>
	)
}

/**
 * Sortable team row for "Predict team draft order". Drag handle, index, and team name.
 */
function SortableTeamRowPrediction({
	id,
	team,
	index,
	disabled,
}: {
	id: string
	team: { id: string; name: string } | undefined
	index: number
	disabled?: boolean
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
	  id,
	  disabled,
	})
	if (!team) return null
	return (
	  <div
	    ref={setNodeRef}
	    style={{ transform: CSS.Transform.toString(transform), transition }}
	    className={`flex items-center gap-2 py-1.5 px-3 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 ${isDragging ? 'opacity-70 shadow-lg z-10' : ''} ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
	    {...(disabled ? {} : { ...attributes, ...listeners })}
	  >
	    {!disabled && <span className="text-gray-400 dark:text-gray-500 select-none" aria-hidden="true">⋮⋮</span>}
	    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{index}</span>
	    <span className="font-medium text-gray-900 dark:text-gray-100">{team.name}</span>
	  </div>
	)
}

function DraftSubmission() {
	const { eventCode } = useParams<{ eventCode: string }>()
	useAuth()
	const [event, setEvent] = useState<{ id: string; players: Player[]; teams: Team[] } | null>(null)
	const [grid, setGrid] = useState<Record<string, string>>({})
	const [teamOrder, setTeamOrder] = useState<string[]>([])
	const [teamOrderLocked, setTeamOrderLocked] = useState(false)
	const [playersByTeamWhenEditing, setPlayersByTeamWhenEditing] = useState<Record<string, Record<number, string>> | null>(null)
	const [showSavedState, setShowSavedState] = useState(false)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	const [submission, setSubmission] = useState<Submission | null>(null)
	const [searchTerm, setSearchTerm] = useState('')

	const sensors = useSensors(
	  useSensor(PointerSensor, {
	    activationConstraint: { distance: 8 },
	  })
	)

	const fetchEventData = useCallback(async () => {
	  try {
	    const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`)
	    const ev = eventResponse.data.event
	    setEvent(ev)

	    const teams = ev.teams || []
	    const teamIds = teams.map((t: Team) => t.id)
	    const numTeams = teamIds.length || 1
	    const defaultOrder = teams.slice().sort((a: Team, b: Team) => a.name.localeCompare(b.name)).map((t: Team) => t.id)

	    try {
	      const subRes = await axios.get(`${API_URL}/api/draft/${ev.id}/my-submission`)
	      const sub = subRes.data.submission
	      const hasValidTeamOrder = !!(sub?.teamOrder?.length === teamIds.length && teamIds.every((id: string) => sub!.teamOrder!.includes(id)))
	      if (sub && sub.items?.length) {
	        setSubmission(sub)
	        const order = hasValidTeamOrder ? sub.teamOrder! : defaultOrder
	        setTeamOrder(order)
	        setGrid(submissionToGrid(sub.items, order, numTeams))
	        setTeamOrderLocked(hasValidTeamOrder)
	      } else {
	        setSubmission(sub || null)
	        const order = hasValidTeamOrder ? sub.teamOrder! : defaultOrder
	        setTeamOrder(order)
	        setGrid({})
	        setTeamOrderLocked(hasValidTeamOrder)
	      }
	    } catch (_err) {
	      // User may not have submitted (404); treat as empty.
	      setSubmission(null)
	      setTeamOrder(defaultOrder)
	      setGrid({})
	      setTeamOrderLocked(false)
	    }
	  } catch (e) {
	    console.error('Failed to fetch event:', e)
	    setError(getErrorMessage(e, 'Failed to load event data'))
	  } finally {
	    setLoading(false)
	  }
	}, [eventCode])

	useEffect(() => {
	  if (eventCode) fetchEventData()
	}, [eventCode, fetchEventData])

	const teamIds = useMemo(() => teamOrder.length > 0 ? teamOrder : (event?.teams || []).map((t) => t.id), [teamOrder, event?.teams])
	const numTeams = teamIds.length || 1
	const totalSlots = (event?.players || []).length
	const maxRound = Math.ceil(totalSlots / numTeams) || 1
	const players = event?.players || []

	const placedIds = useMemo(() => Object.values(grid), [grid])
	const unplacedPlayers = useMemo(
	  () => players.filter((p) => !placedIds.includes(p.id)),
	  [players, placedIds]
	)
	const filteredPool = useMemo(
	  () =>
	    unplacedPlayers.filter((p) =>
	      p.name.toLowerCase().includes(searchTerm.toLowerCase())
	    ),
	  [unplacedPlayers, searchTerm]
	)

	const handleDragEnd = (e: DragEndEvent) => {
	  const { active, over } = e
	  if (!over || !event) return

	  const fromPool = active.id.toString().startsWith('player-')
	  const fromCell = active.id.toString().startsWith('placed-')
	  const toPool = over.id === 'pool' || over.id.toString().startsWith('player-')
	  const toCell = over.id.toString().startsWith('cell-')

	  let fromPlayerId: string | null = null
	  let fromRound: number | undefined
	  let fromTeamId: string | undefined

	  if (fromPool) {
	    fromPlayerId = (active.id as string).replace(/^player-/, '')
	  } else if (fromCell) {
	    const str = (active.id as string).replace(/^placed-/, '')
	    const [r, ...rest] = str.split('-')
	    fromRound = parseInt(r, 10)
	    fromTeamId = rest.join('-')
	    fromPlayerId = (active.data.current as { playerId?: string })?.playerId ?? null
	  }

	  if (!fromPlayerId) return

	  let toRound: number | undefined
	  let toTeamId: string | undefined
	  if (toCell) {
	    const parts = (over.id as string).replace(/^cell-/, '').split('-')
	    toRound = parseInt(parts[0], 10)
	    toTeamId = parts.slice(1).join('-') || undefined
	  }

	    setGrid((g) => {
	    const next = { ...g }
	    const fromKey = fromRound !== null && fromRound !== undefined && fromTeamId
				? `${fromRound}-${fromTeamId}` : null
	    if (fromKey) delete next[fromKey]

	    if (toPool) {
	      // drop on pool: remove from grid only (already deleted above)
	      return next
	    }

	    if (toCell && toRound !== null && toRound !== undefined && toTeamId) {
	      const toKey = `${toRound}-${toTeamId}`
	      const existing = next[toKey]
	      next[toKey] = fromPlayerId
	      if (existing && fromKey && fromKey !== toKey) next[fromKey] = existing
	    }
	    return next
	  })
	  setShowSavedState(false)
	}

	const handleSave = async () => {
	  if (!eventCode || !event) return

	  const placements = gridToPlacements(grid, teamIds, numTeams, totalSlots)
	  const playerIds = placements.map((p) => p.playerId)
	  if (new Set(playerIds).size !== playerIds.length) {
	    setError('Duplicate placements detected. Each player must appear exactly once.')
	    return
	  }

	  setSaving(true)
	  setError('')

	  try {
	    const res = await axios.post(`${API_URL}/api/draft/${event.id}/submit-order`, {
	      placements,
	      teamOrder: teamIds,
	    })
	    setSubmission(res.data.submission)
	    setShowSavedState(true)
	  } catch (err: unknown) {
	    setError(getErrorMessage(err, 'Failed to save prediction'))
	  } finally {
	    setSaving(false)
	  }
	}

	const isLocked = submission?.locked || false

	if (loading) {
	  return (
	    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	      <div className="text-lg text-gray-600 dark:text-gray-400">Loading...</div>
	    </div>
	  )
	}

	if (!event) {
	  return (
	    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	      <div className="text-lg text-red-600 dark:text-red-400">Event not found</div>
	    </div>
	  )
	}

	if (event.teams.length === 0) {
	  return (
	    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	      <div className="text-lg text-amber-700 dark:text-amber-400">
	        No teams configured for this event. The draft board is available once teams are added.
	      </div>
	    </div>
	  )
	}

	return (
	  <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
	    <AppHeader backLink={`/event/${eventCode}`} title="Mock Draft: Predictions" />

	    <main className={`mx-auto py-6 px-4 sm:px-6 lg:px-8 ${numTeams >= 5 ? 'max-w-[min(1600px,96vw)]' : 'max-w-7xl'}`}>
	      {isLocked && (
	        <div className="mb-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded">
	          This prediction is locked. You can view it but cannot make changes.
	        </div>
	      )}

	      {error && (
	        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded">
	          {error}
	        </div>
	      )}

	      {/* Step 1: Predict team draft order. Required before the board is shown. */}
	      <div className="mb-6 bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-4">
	        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Predict team draft order</h3>
	        {!teamOrderLocked ? (
	          <>
	            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
	              Drag teams to set which you think picks 1st, 2nd, 3rd, etc. in round 1. Lock this order to open the draft board and predict player picks.
	            </p>
	            <DndContext
	              sensors={sensors}
	              collisionDetection={closestCenter}
	              onDragEnd={(e) => {
	                const { active, over } = e
	                if (!over || active.id === over.id) return
	                const o = teamIds.indexOf(active.id as string)
	                const n = teamIds.indexOf(over.id as string)
	                if (o === -1 || n === -1) return
	                setTeamOrder(arrayMove(teamIds, o, n))
	                setShowSavedState(false)
	              }}
	            >
	              <SortableContext items={teamIds} strategy={verticalListSortingStrategy}>
	                <div className="space-y-2">
	                  {teamIds.map((id, i) => {
	                    const t = event.teams.find((x) => x.id === id)
	                    return (
	                      <SortableTeamRowPrediction
	                        key={id}
	                        id={id}
	                        team={t}
	                        index={i + 1}
	                        disabled={isLocked}
	                      />
	                    )
	                  })}
	                </div>
	              </SortableContext>
	            </DndContext>
	            {!isLocked && (
	              <button
	                type="button"
	                onClick={() => {
	                  if (playersByTeamWhenEditing) {
	                    setGrid(playersByTeamToGrid(playersByTeamWhenEditing, teamOrder, numTeams, totalSlots))
	                    setPlayersByTeamWhenEditing(null)
	                  }
	                  setTeamOrderLocked(true)
	                }}
	                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
	              >
	                Lock team order
	              </button>
	            )}
	          </>
	        ) : (
	          <>
	            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Your order (board columns follow this):</p>
	            <div className="flex flex-wrap items-center gap-2 mb-2">
	              {teamIds.map((id, i) => {
	                const t = event.teams.find((x) => x.id === id)
	                return t ? (
	                  <span key={id} className="text-sm text-gray-900 dark:text-gray-100">
	                    <span className="text-gray-500 dark:text-gray-400">{i + 1}.</span> {t.name}
	                    {i < teamIds.length - 1 && <span className="text-gray-400 dark:text-gray-500 mx-1">→</span>}
	                  </span>
	                ) : null
	              })}
	            </div>
	            {!isLocked && (
	              <>
	                <button
	                  type="button"
	                  onClick={() => {
	                    setPlayersByTeamWhenEditing(gridToPlayersByTeam(grid, teamIds, numTeams, totalSlots))
	                    setTeamOrderLocked(false)
	                    setGrid({})
	                  }}
	                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
	                >
	                  Edit team order
	                </button>
	                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
	                  Your player predictions will move with each team to their new column.
	                </span>
	              </>
	            )}
	          </>
	        )}
	      </div>

	      {/* Step 2: Draft board and player pool. Shown after team order is locked. */}
	      {teamOrderLocked && (
	        <>
	          <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
	            <div>
	              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Draft board</h2>
	              <p className="text-gray-600 dark:text-gray-400">
	                Drag players from the list into the slots to predict the draft order. Columns follow your team order above. Each slot is a pick in snake order. Save anytime; partial predictions are fine. Whatever you have saved when the draft starts will count.
	              </p>
	            </div>
	            {!isLocked && (
	              <button
	                onClick={handleSave}
	                disabled={saving}
	                className={`shrink-0 px-6 py-2 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
	                  showSavedState
	                    ? 'bg-green-600 hover:bg-green-700'
	                    : 'bg-indigo-600 hover:bg-indigo-700'
	                }`}
	              >
	                {saving ? 'Saving...' : showSavedState ? 'Saved ✓' : 'Save prediction'}
	              </button>
	            )}
	          </div>

	          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
	        <div className={`flex flex-col gap-6 ${numTeams >= 5 ? '' : 'lg:flex-row'}`}>
	          {/* Draft board grid */}
	          <div className="flex-1 min-w-0">
	            <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg overflow-hidden">
	              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Board</h3>
	                <p className="text-sm text-gray-500 dark:text-gray-400">
	                  {placedIds.length} of {totalSlots} players placed
	                </p>
	              </div>
	              <div className="overflow-x-auto">
	                <table className="w-full border-collapse min-w-[400px]">
	                  <thead>
	                    <tr>
	                      <th className="text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[4rem]">
	                        Round
	                      </th>
	                      {teamIds.map((teamId) => {
	                        const t = event.teams.find((x) => x.id === teamId)
	                        const compact = numTeams >= 5
	                        return (
	                          <th
	                            key={teamId}
	                            title={compact ? (t?.name ?? '') : undefined}
	                            className={`text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 ${
	                              compact ? 'min-w-0 max-w-[5.5rem] truncate' : 'min-w-[7rem]'
	                            }`}
	                          >
	                            {t?.name ?? ''}
	                          </th>
	                        )
	                      })}
	                    </tr>
	                  </thead>
	                  <tbody>
	                    {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
	                      <tr key={round} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
	                        <td className="p-2 border-b border-gray-100 dark:border-gray-700 font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10">
	                          {round}
	                        </td>
	                        {teamIds.map((teamId, teamIndex) => (
	                          <DraftCell
	                            key={`${round}-${teamId}`}
	                            round={round}
	                            teamId={teamId}
	                            teamIndex={teamIndex}
	                            numTeams={numTeams}
	                            totalSlots={totalSlots}
	                            playerId={grid[`${round}-${teamId}`]}
	                            players={players}
	                            disabled={isLocked}
	                          />
	                        ))}
	                      </tr>
	                    ))}
	                  </tbody>
	                </table>
	              </div>
	            </div>
	          </div>

	          {/* Player pool */}
	          <div className={`w-full flex-shrink-0 ${numTeams >= 5 ? 'max-w-2xl' : 'lg:w-80 xl:w-96'}`}>
	            <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg flex flex-col h-fit max-h-[70vh]">
	              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Players</h3>
	                <input
	                  type="text"
	                  placeholder="Search..."
	                  value={searchTerm}
	                  onChange={(e) => setSearchTerm(e.target.value)}
	                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
	                />
	              </div>
	              <DroppablePool disabled={isLocked}>
	                <div className="p-3 flex-1 overflow-y-auto min-h-[12rem] flex flex-wrap gap-2 content-start">
	                  {filteredPool.map((p) => (
	                    <PlayerPoolItem key={p.id} player={p} disabled={isLocked} />
	                  ))}
	                  {filteredPool.length === 0 && (
	                    <div className="text-sm text-gray-500 dark:text-gray-400 py-4 w-full text-center">
	                      {unplacedPlayers.length === 0
	                        ? 'All players are on the board'
	                        : 'No players match the search'}
	                    </div>
	                  )}
	                </div>
	              </DroppablePool>
	            </div>
	          </div>
	        </div>
	      </DndContext>

	      <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
	        {placedIds.length} of {totalSlots} players placed
	        {submission?.submittedAt && !isLocked && (
	          <span className="ml-3 text-gray-500 dark:text-gray-400">
	            · Last saved: {new Date(submission.submittedAt).toLocaleString()}
	          </span>
	        )}
	      </div>
	        </>
	      )}
	    </main>
	  </div>
	)
}

/**
 * Droppable area for the player pool. Wrapper for useDroppable (hooks must be in a component).
 */
function DroppablePool({
	children,
	disabled,
}: {
	children: React.ReactNode
	disabled?: boolean
}) {
	const { setNodeRef, isOver } = useDroppable({
	  id: 'pool',
	  disabled,
	})

	return (
	  <div
	    ref={setNodeRef}
	    className={`flex-1 flex flex-col min-h-0 ${isOver ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
	  >
	    {children}
	  </div>
	)
}

export default DraftSubmission
