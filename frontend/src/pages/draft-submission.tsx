import { useEffect, useState, useMemo, useCallback, memo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import {
	DndContext,
	DragEndEvent,
	DragOverEvent,
	DragOverlay,
	DragStartEvent,
	closestCenter,
	useDraggable,
	useDroppable,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
	slotToRoundAndTeamIndex,
	roundAndTeamIndexToSlot,
	isValidSlot,
} from '@bingo-draft/shared'
import { api } from '../lib/api-client'
import { useAuth } from '../contexts/auth-context'
import { AppHeader } from '../components/app-header'
import { useFantasyRedirect } from '../hooks/use-fantasy-redirect'
import { useTap } from '../hooks/use-tap'
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

interface DraggableCellChipProps {
	player: Player
	round: number
	teamId: string
	disabled?: boolean
	armed?: boolean
	onArm?: (playerId: string) => void
}

interface EditingCell {
	round: number
	teamId: string
}

/** Where a drag would land right now. Drives the overlay label and the board cross-hair. */
type DropTarget =
	| { kind: 'cell'; round: number; teamId: string }
	| { kind: 'pool' }

interface DragPreviewProps {
	playerName: string
	destination: string | null
}

interface DraftCellProps {
	round: number
	teamId: string
	teamIndex: number
	numTeams: number
	totalSlots: number
	playerId: string | undefined
	players: Player[]
	disabled?: boolean
	editingCell: EditingCell | null
	onEmptySlotClick?: (round: number, teamId: string, anchorEl: HTMLElement) => void
	isColumnActive: boolean
	isRowActive: boolean
	armedPlayerId: string | null
	onArmPlayer?: (playerId: string) => void
	onArmedSlotClick?: (round: number, teamId: string) => void
}

interface PlayerPoolItemProps {
	player: Player
	disabled?: boolean
	armed?: boolean
	onArm?: (playerId: string) => void
}

interface DroppablePoolProps {
	children: ReactNode
	disabled?: boolean
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
	armed,
	onArm,
}: DraggableCellChipProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
	  id: `placed-${round}-${teamId}`,
	  data: { playerId: player.id, round, teamId, source: 'cell' as const },
	  disabled,
	})

	const canArm = !disabled && !!onArm
	const handleArm = useCallback(() => {
	  if (!onArm) {
	    return
	  }
	  onArm(player.id)
	}, [onArm, player.id])
	const tap = useTap(canArm ? handleArm : undefined)

	const handleKeyDown = useCallback(
	  (e: React.KeyboardEvent<HTMLDivElement>) => {
	    if (!canArm || (e.key !== 'Enter' && e.key !== ' ')) {
	      return
	    }
	    e.preventDefault()
	    handleArm()
	  },
	  [canArm, handleArm]
	)

	return (
	  <div
	    ref={setNodeRef}
	    {...attributes}
	    {...listeners}
	    onPointerDownCapture={tap.onPointerDownCapture}
	    onClick={tap.onClick}
	    onKeyDown={handleKeyDown}
	    aria-pressed={canArm ? !!armed : undefined}
	    title={canArm ? `${player.name} — drag to another slot, or tap to pick up and move` : player.name}
	    className={`text-sm font-medium text-gray-900 dark:text-gray-100 truncate px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-700 cursor-grab active:cursor-grabbing touch-none select-none ${
	      isDragging ? 'opacity-50' : ''
	    } ${armed ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
	  >
	    {player.name}
	  </div>
	)
}

/**
 * Droppable draft cell in the board. Accepts drops from pool or other cells; shows player or placeholder.
 * Empty valid slots are clickable to open the player picker (type-to-place).
 */
const DraftCell = memo(function DraftCell({
	round,
	teamId,
	teamIndex,
	numTeams,
	totalSlots,
	playerId,
	players,
	disabled,
	editingCell,
	onEmptySlotClick,
	isColumnActive,
	isRowActive,
	armedPlayerId,
	onArmPlayer,
	onArmedSlotClick,
}: DraftCellProps) {
	const cellRef = useRef<HTMLTableCellElement | null>(null)
	const valid = isValidSlot(round, teamIndex, numTeams, totalSlots)
	const { setNodeRef, isOver } = useDroppable({
	  id: `cell-${round}-${teamId}`,
	  data: { round, teamId },
	  disabled: disabled || !valid,
	})

	const setRef = useCallback(
		(el: HTMLTableCellElement | null) => {
		  setNodeRef(el)
		  cellRef.current = el
		},
		[setNodeRef]
	)

	const playerObj = playerId ? players.find((p) => p.id === playerId) : undefined
	const isEmpty = valid && !playerObj && !disabled
	const isEditing = editingCell?.round === round && editingCell?.teamId === teamId
	// A player picked up by tap rather than drag: every other valid slot becomes a tap
	// target, so a phone never has to drag across a board taller than the screen.
	const isArmedTarget =
		!!armedPlayerId && valid && !disabled && playerObj?.id !== armedPlayerId
	// Tapping a placed chip picks it up, and tapping the one already in hand puts it
	// back down. While a *different* player is in hand the tap belongs to the slot.
	const canArmChip = !armedPlayerId || armedPlayerId === playerObj?.id

	const handleEmptyClick = useCallback(() => {
		if (!isEmpty || !onEmptySlotClick || !cellRef.current) return
		onEmptySlotClick(round, teamId, cellRef.current)
	}, [isEmpty, onEmptySlotClick, round, teamId])

	const handleArmedClick = useCallback(() => {
		if (!isArmedTarget || !onArmedSlotClick) return
		onArmedSlotClick(round, teamId)
	}, [isArmedTarget, onArmedSlotClick, round, teamId])

	const compact = numTeams >= 5

	let cellTone = 'bg-white dark:bg-gray-800'
	if (!valid) {
		cellTone = 'bg-gray-50 dark:bg-gray-700/50'
	} else if (isOver) {
		cellTone = 'bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-300 dark:ring-indigo-600 ring-inset'
	} else if (isEditing) {
		cellTone = 'bg-indigo-50/80 dark:bg-indigo-900/20 ring-1 ring-indigo-300 dark:ring-indigo-600 ring-inset'
	} else if (isColumnActive || isRowActive) {
		// Cross-hair while dragging: the lit column runs up to the sticky header, so the
		// team name is readable without counting columns.
		cellTone = 'bg-indigo-50/60 dark:bg-indigo-900/20'
	} else if (isArmedTarget) {
		cellTone = 'bg-green-50/70 dark:bg-green-900/20'
	}
	return (
	  <td
	    ref={setRef}
	    onClick={isArmedTarget ? handleArmedClick : undefined}
	    className={`${compact ? 'min-w-[5rem]' : 'min-w-[7rem]'} p-1.5 align-top border-b ` +
		`border-gray-100 dark:border-gray-700 ${cellTone} ` +
		`${isArmedTarget ? 'cursor-pointer' : ''} ${!valid ? '' : 'min-h-[2.25rem]'}`}
	  >
	    {!valid ? (
	      <span className="text-gray-300 dark:text-gray-500 text-xs">-</span>
	    ) : playerObj ? (
	      <DraggableCellChip
	        player={playerObj}
	        round={round}
	        teamId={teamId}
	        disabled={disabled}
	        armed={armedPlayerId === playerObj.id}
	        onArm={canArmChip ? onArmPlayer : undefined}
	      />
	    ) : (
	      <div
	        role="button"
	        tabIndex={0}
	        onClick={isArmedTarget ? undefined : handleEmptyClick}
	        onKeyDown={(e) => {
	          if (e.key === 'Enter' || e.key === ' ') {
	            e.preventDefault()
	            if (isArmedTarget) {
	              handleArmedClick()
	            } else {
	              handleEmptyClick()
	            }
	          }
	        }}
	        className={`text-sm min-h-[1.5rem] ${isArmedTarget ? 'cursor-pointer font-medium text-green-700 dark:text-green-300' : isEmpty ? 'cursor-pointer text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 rounded px-1 -mx-1' : 'text-gray-400 dark:text-gray-500 italic'}`}
	        title={isArmedTarget ? 'Tap to place the player you picked up' : isEmpty ? 'Click to type a player name' : undefined}
	        aria-label={isArmedTarget ? `Place player here, round ${round}` : isEmpty ? `Pick player for round ${round}` : undefined}
	      >
	        {isArmedTarget ? 'Tap to place' : isEmpty ? 'Click to add…' : '\u00A0'}
	      </div>
	    )}
	  </td>
	)
})

/**
 * Popover for picking a player by typing. Rendered in a portal; only valid players can be selected.
 */
function PlayerPickerPopover({
	anchorRect,
	players,
	onSelect,
	onCancel,
}: {
	anchorRect: DOMRect
	players: Player[]
	onSelect: (playerId: string) => void
	onCancel: () => void
}) {
	const [query, setQuery] = useState('')
	const [highlightedIndex, setHighlightedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const highlightedRef = useRef<HTMLButtonElement>(null)

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return players.slice(0, 50)
		return players.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				(p.team !== null && p.team.toLowerCase().includes(q))
		).slice(0, 50)
	}, [players, query])

	useEffect(() => {
		inputRef.current?.focus()
		setHighlightedIndex(0)
	}, [])

	useEffect(() => {
		setHighlightedIndex((i) => (filtered.length ? Math.min(i, filtered.length - 1) : 0))
	}, [filtered.length])

	useEffect(() => {
		highlightedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
	}, [highlightedIndex])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onCancel()
				return
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setHighlightedIndex((i) => (i + 1) % Math.max(1, filtered.length))
				return
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setHighlightedIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length))
				return
			}
			if (e.key === 'Enter' && filtered[highlightedIndex]) {
				e.preventDefault()
				onSelect(filtered[highlightedIndex].id)
			}
		},
		[filtered, highlightedIndex, onCancel, onSelect]
	)

	const handleClickOutside = useCallback(
		(e: MouseEvent) => {
			const el = e.target as Node
			if (listRef.current?.contains(el) || inputRef.current?.contains(el)) return
			onCancel()
		},
		[onCancel]
	)

	useEffect(() => {
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [handleClickOutside])

	if (typeof document === 'undefined') return null

	const popover = (
		<div
			role="dialog"
			aria-label="Pick a player"
			className="fixed z-50 min-w-[12rem] max-w-[20rem] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-2"
			style={{
				top: anchorRect.bottom + 4,
				left: anchorRect.left,
			}}
			ref={listRef}
		>
			<div className="px-2 pb-2">
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Type player name..."
					className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
					aria-autocomplete="list"
					aria-expanded="true"
					aria-controls="player-picker-list"
				/>
			</div>
			<div
				id="player-picker-list"
				role="listbox"
				className="max-h-[14rem] overflow-y-auto"
			>
				{filtered.length === 0 ? (
					<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
						No matching players
					</div>
				) : (
					filtered.map((p, i) => (
						<button
							key={p.id}
							ref={i === highlightedIndex ? highlightedRef : undefined}
							type="button"
							role="option"
							aria-selected={i === highlightedIndex}
							className={`w-full text-left px-3 py-2 text-sm truncate ${
								i === highlightedIndex
									? 'bg-indigo-100 dark:bg-indigo-900/50 text-gray-900 dark:text-gray-100'
									: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
							}`}
							onClick={() => onSelect(p.id)}
							onMouseEnter={() => setHighlightedIndex(i)}
						>
							{p.team ? `${p.name} (${p.team})` : p.name}
						</button>
					))
				)}
			</div>
		</div>
	)

	return createPortal(popover, document.body)
}

/**
 * Draggable chip for a player in the pool. Can be dropped onto cells or back to the pool.
 */
const PlayerPoolItem = memo(function PlayerPoolItem({
	player,
	disabled,
	armed,
	onArm,
}: PlayerPoolItemProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
	  id: `player-${player.id}`,
	  data: { playerId: player.id, source: 'pool' as const },
	  disabled,
	})

	const canArm = !disabled && !!onArm
	const handleArm = useCallback(() => {
	  if (!onArm) {
	    return
	  }
	  onArm(player.id)
	}, [onArm, player.id])
	const tap = useTap(canArm ? handleArm : undefined)

	const handleKeyDown = useCallback(
	  (e: React.KeyboardEvent<HTMLDivElement>) => {
	    if (!canArm || (e.key !== 'Enter' && e.key !== ' ')) {
	      return
	    }
	    e.preventDefault()
	    handleArm()
	  },
	  [canArm, handleArm]
	)

	const name = player.team ? `${player.name} (${player.team})` : player.name
	const title = canArm ? `${name} — drag onto a slot, or tap to pick up` : name

	return (
	  <div
	    ref={setNodeRef}
	    {...attributes}
	    {...listeners}
	    onPointerDownCapture={tap.onPointerDownCapture}
	    onClick={tap.onClick}
	    onKeyDown={handleKeyDown}
	    aria-pressed={canArm ? !!armed : undefined}
	    title={title}
	    className={`inline-flex items-center px-2 py-1 rounded-md border text-sm cursor-grab active:cursor-grabbing transition-colors touch-none select-none ${
	      isDragging ? 'opacity-50' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/30'
	    } ${armed ? 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-300 dark:border-indigo-500' : ''} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
	  >
	    <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[11rem]">{player.name}</span>
	  </div>
	)
})

/**
 * Contents of the drag overlay. The chip tracks the pointer and the badge sits above it,
 * clear of the finger, naming the slot the player would land in — the board header can be
 * scrolled well out of view by the time you reach the round you want.
 */
function DragPreview({ playerName, destination }: DragPreviewProps) {
	return (
		<div className="relative pointer-events-none">
			<div className="absolute bottom-full left-0 mb-2 whitespace-nowrap rounded-md bg-gray-900 dark:bg-gray-100 px-2 py-1 text-xs font-semibold text-white dark:text-gray-900 shadow-lg">
				{destination ?? 'Drop on a slot to place'}
			</div>
			<div className="inline-flex items-center rounded-md border border-indigo-400 dark:border-indigo-500 bg-white dark:bg-gray-700 px-2 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 shadow-lg">
				{playerName}
			</div>
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
	    className={`flex items-center gap-2 py-1.5 px-3 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 touch-none select-none ${isDragging ? 'opacity-70 shadow-lg z-10' : ''} ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
	    {...(disabled ? {} : { ...attributes, ...listeners })}
	  >
	    {!disabled && <span className="text-gray-400 dark:text-gray-500 select-none" title="Drag to reorder" aria-hidden="true">⋮⋮</span>}
	    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{index}</span>
	    <span className="font-medium text-gray-900 dark:text-gray-100">{team.name}</span>
	  </div>
	)
}

function DraftSubmission() {
	const { eventCode } = useParams<{ eventCode: string }>()
	useAuth()
	const [event, setEvent] = useState<
		{ id: string; players: Player[]; teams: Team[]; fantasyEnabled?: boolean } | null
	>(null)
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
	const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
	const [pickerAnchorRect, setPickerAnchorRect] = useState<DOMRect | null>(null)
	const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
	const [armedPlayerId, setArmedPlayerId] = useState<string | null>(null)

	const sensors = useSensors(
	  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	  useSensor(TouchSensor, {
	    activationConstraint: { delay: 150, tolerance: 8 },
	  })
	)

	const fetchEventData = useCallback(async () => {
	  try {
	    const eventResponse = await api.get(`/api/events/code/${eventCode}`)
	    const ev = eventResponse.data.event
	    setEvent(ev)

	    const teams = ev.teams || []
	    const teamIds = teams.map((t: Team) => t.id)
	    const numTeams = teamIds.length || 1
	    const defaultOrder = teams.slice().sort((a: Team, b: Team) => a.name.localeCompare(b.name)).map((t: Team) => t.id)

	    try {
	      const subRes = await api.get(`/api/draft/${ev.id}/my-submission`)
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

	useFantasyRedirect(event?.fantasyEnabled, eventCode)

	useEffect(() => {
		if (!armedPlayerId) {
			return
		}
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setArmedPlayerId(null)
			}
		}
		document.addEventListener('keydown', handleEscape)
		return () => document.removeEventListener('keydown', handleEscape)
	}, [armedPlayerId])

	const teamIds = useMemo(() => teamOrder.length > 0 ? teamOrder : (event?.teams || []).map((t) => t.id), [teamOrder, event?.teams])
	const numTeams = teamIds.length || 1
	// Memoised so the empty-array fallback does not produce a new identity each render,
	// which would invalidate every downstream useMemo.
	const players = useMemo(() => event?.players ?? [], [event?.players])
	const totalSlots = players.length
	const maxRound = Math.ceil(totalSlots / numTeams) || 1

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

	const handleDragStart = (e: DragStartEvent) => {
	  const playerId = (e.active.data.current as { playerId?: string })?.playerId ?? null
	  setActivePlayerId(playerId)
	  setDropTarget(null)
	  // A drag supersedes anything picked up by tap.
	  setArmedPlayerId(null)
	}

	// Fires only when the hovered droppable changes, not on every pointer move.
	const handleDragOver = (e: DragOverEvent) => {
	  const { over } = e
	  if (!over) {
	    setDropTarget(null)
	    return
	  }
	  const overId = over.id.toString()
	  const overData = over.data.current as { round?: number; teamId?: string } | undefined
	  if (overId.startsWith('cell-') && overData?.round !== undefined && overData.teamId !== undefined) {
	    setDropTarget({ kind: 'cell', round: overData.round, teamId: overData.teamId })
	    return
	  }
	  if (overId === 'pool' || overId.startsWith('player-')) {
	    setDropTarget({ kind: 'pool' })
	    return
	  }
	  setDropTarget(null)
	}

	const handleDragCancel = () => {
	  setActivePlayerId(null)
	  setDropTarget(null)
	}

	const handleDragEnd = (e: DragEndEvent) => {
	  const { active, over } = e
	  setActivePlayerId(null)
	  setDropTarget(null)
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

	const handleEmptySlotClick = useCallback((round: number, teamId: string, anchorEl: HTMLElement) => {
		setEditingCell({ round, teamId })
		setPickerAnchorRect(anchorEl.getBoundingClientRect())
	}, [])

	const handlePlacePlayerInSlot = useCallback(
		(round: number, teamId: string, playerId: string) => {
			setGrid((g) => {
				const next = { ...g }
				for (const key of Object.keys(next)) {
					if (next[key] === playerId) delete next[key]
				}
				next[`${round}-${teamId}`] = playerId
				return next
			})
			setEditingCell(null)
			setPickerAnchorRect(null)
			setShowSavedState(false)
		},
		[]
	)

	const handleCancelPicker = useCallback(() => {
		setEditingCell(null)
		setPickerAnchorRect(null)
	}, [])

	/** Picks a player up (or puts them back down) for the tap-tap placement flow. */
	const handleArmPlayer = useCallback((playerId: string) => {
		setEditingCell(null)
		setPickerAnchorRect(null)
		setArmedPlayerId((current) => (current === playerId ? null : playerId))
	}, [])

	const handleArmedSlotClick = useCallback(
		(round: number, teamId: string) => {
			if (!armedPlayerId) {
				return
			}
			// Placing onto an occupied slot sends the player already there back to the
			// list, matching what the type-to-place picker does.
			handlePlacePlayerInSlot(round, teamId, armedPlayerId)
			setArmedPlayerId(null)
		},
		[armedPlayerId, handlePlacePlayerInSlot]
	)

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
	    const res = await api.post(`/api/draft/${event.id}/submit-order`, {
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

	const handleLockTeamOrder = () => {
		if (playersByTeamWhenEditing) {
			setGrid(playersByTeamToGrid(playersByTeamWhenEditing, teamOrder, numTeams, totalSlots))
			setPlayersByTeamWhenEditing(null)
		}
		setTeamOrderLocked(true)
	}
	const handleEditTeamOrder = () => {
		setArmedPlayerId(null)
		setPlayersByTeamWhenEditing(gridToPlayersByTeam(grid, teamIds, numTeams, totalSlots))
		setTeamOrderLocked(false)
		setGrid({})
	}

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

	// Redirecting to the live draft; render the loading state rather than a frame of
	// content the viewer is about to be navigated away from.
	if (event.fantasyEnabled === false) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
				<div className="text-lg text-gray-600 dark:text-gray-400">Opening live draft...</div>
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

	const activePlayer = activePlayerId ? players.find((p) => p.id === activePlayerId) : undefined
	const armedPlayer = armedPlayerId ? players.find((p) => p.id === armedPlayerId) : undefined
	let dropDestinationLabel: string | null = null
	if (dropTarget?.kind === 'pool') {
		dropDestinationLabel = 'Remove from board'
	} else if (dropTarget?.kind === 'cell') {
		const destinationTeam = event.teams.find((t) => t.id === dropTarget.teamId)
		dropDestinationLabel = `${destinationTeam?.name ?? 'Team'} \u00B7 Round ${dropTarget.round}`
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
	            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
	              Drag and drop the teams to put them in your predicted draft order. Top of the list is pick 1, then 2, 3, and so on. On mobile, tap and hold a team briefly, then drag.
	            </p>
	            <p className="text-sm text-gray-500 dark:text-gray-500 mb-3">
	              When you are done, click Lock team order to open the draft board.
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
	                onClick={handleLockTeamOrder}
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
	                  onClick={handleEditTeamOrder}
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
	              <p className="text-gray-600 dark:text-gray-400 mb-2">
	                Drag each player from the Players list onto a slot on the board. On a phone, tap a player and then tap the slot you want them in. You can also click an empty slot and type a player name. Each column is a team and each slot is one pick; drag a player back to the list to remove them.
	              </p>
	              <p className="text-gray-600 dark:text-gray-400">
	                Columns follow your team order above. Save anytime. Whatever you have saved when the draft starts will count.
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

	          {editingCell && pickerAnchorRect && (
	            <PlayerPickerPopover
	              anchorRect={pickerAnchorRect}
	              players={players}
	              onSelect={(playerId) =>
	                handlePlacePlayerInSlot(editingCell.round, editingCell.teamId, playerId)
	              }
	              onCancel={handleCancelPicker}
	            />
	          )}

	          {armedPlayer && (
	            <div
	              role="status"
	              className="sticky top-0 z-40 mb-4 flex items-center justify-between gap-3 rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/80 px-4 py-2 shadow-sm"
	            >
	              <span className="text-sm text-indigo-900 dark:text-indigo-100">
	                <span className="font-semibold">{armedPlayer.name}</span> picked up — tap a slot on the board to place them.
	              </span>
	              <button
	                type="button"
	                onClick={() => setArmedPlayerId(null)}
	                className="shrink-0 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100"
	              >
	                Cancel
	              </button>
	            </div>
	          )}

	          <DndContext
	            sensors={sensors}
	            onDragStart={handleDragStart}
	            onDragOver={handleDragOver}
	            onDragEnd={handleDragEnd}
	            onDragCancel={handleDragCancel}
	          >
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
	              {/* A bounded scroll box, not just overflow-x: `sticky top-0` on the header
	                  only pins against an ancestor that actually scrolls vertically. */}
	              <div className="max-h-[70vh] overflow-auto">
	                <table className="w-full border-collapse min-w-[400px]">
	                  <thead>
	                    <tr>
	                      {/* border-collapse drops the borders of sticky cells once they
	                          detach, so the header rule is an inset shadow instead. */}
	                      <th className="text-left p-2 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 top-0 bg-white dark:bg-gray-800 z-30 min-w-[4rem] shadow-[inset_0_-1px_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#374151]">
	                        Round
	                      </th>
	                      {teamIds.map((teamId) => {
	                        const t = event.teams.find((x) => x.id === teamId)
	                        const compact = numTeams >= 5
	                        const columnActive = dropTarget?.kind === 'cell' && dropTarget.teamId === teamId
	                        return (
	                          <th
	                            key={teamId}
	                            title={compact ? (t?.name ?? '') : undefined}
	                            className={`text-left p-2 font-semibold sticky top-0 z-20 shadow-[inset_0_-1px_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#374151] ${
	                              columnActive
	                                ? 'bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-100'
	                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
	                            } ${compact ? 'min-w-0 max-w-[5.5rem] truncate' : 'min-w-[7rem]'}`}
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
	                        <td
	                          className={`p-2 border-b border-gray-100 dark:border-gray-700 font-medium sticky left-0 z-10 ${
	                            dropTarget?.kind === 'cell' && dropTarget.round === round
	                              ? 'bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-100'
	                              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
	                          }`}
	                        >
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
	                            editingCell={editingCell}
	                            onEmptySlotClick={isLocked ? undefined : handleEmptySlotClick}
	                            isColumnActive={dropTarget?.kind === 'cell' && dropTarget.teamId === teamId}
	                            isRowActive={dropTarget?.kind === 'cell' && dropTarget.round === round}
	                            armedPlayerId={armedPlayerId}
	                            onArmPlayer={isLocked ? undefined : handleArmPlayer}
	                            onArmedSlotClick={isLocked ? undefined : handleArmedSlotClick}
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
	                <p className="text-sm text-gray-500 dark:text-gray-400">
	                  Drag a name onto a slot, or tap a name and then tap the slot you want it in.
	                </p>
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
	                    <PlayerPoolItem
	                      key={p.id}
	                      player={p}
	                      disabled={isLocked}
	                      armed={armedPlayerId === p.id}
	                      onArm={isLocked ? undefined : handleArmPlayer}
	                    />
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

	        <DragOverlay dropAnimation={null}>
	          {activePlayer ? (
	            <DragPreview playerName={activePlayer.name} destination={dropDestinationLabel} />
	          ) : null}
	        </DragOverlay>
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
function DroppablePool({ children, disabled }: DroppablePoolProps) {
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
