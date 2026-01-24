import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useAuth } from '../contexts/AuthContext';

interface Player {
  id: string;
  name: string;
  team: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface SubmissionItem {
  playerId: string;
  position: number;
  player: Player;
}

interface Submission {
  id: string;
  submittedAt: string;
  locked: boolean;
  items: SubmissionItem[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// --- Snake order helpers (must match backend) ---
function slotToRoundAndTeamIndex(slotIndex: number, numTeams: number): { round: number; teamIndex: number } {
  const round = Math.floor(slotIndex / numTeams) + 1;
  const posInRound = slotIndex % numTeams;
  const teamIndex = round % 2 === 1 ? posInRound : numTeams - 1 - posInRound;
  return { round, teamIndex };
}

function roundAndTeamIndexToSlot(round: number, teamIndex: number, numTeams: number): number {
  return (round - 1) * numTeams + (round % 2 === 1 ? teamIndex : numTeams - 1 - teamIndex);
}

function isValidSlot(round: number, teamIndex: number, numTeams: number, totalSlots: number): boolean {
  return roundAndTeamIndexToSlot(round, teamIndex, numTeams) < totalSlots;
}

// Convert grid (key: `${round}-${teamId}`, value: playerId) to playerOrder for API
function gridToPlayerOrder(
  grid: Record<string, string>,
  teamIds: string[],
  totalSlots: number
): string[] {
  const order: string[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const { round, teamIndex } = slotToRoundAndTeamIndex(i, teamIds.length);
    const teamId = teamIds[teamIndex];
    const playerId = grid[`${round}-${teamId}`];
    if (playerId) order.push(playerId);
  }
  return order;
}

// Convert submission items (position 1-based) to grid
function submissionToGrid(
  items: SubmissionItem[],
  teamIds: string[],
  numTeams: number
): Record<string, string> {
  const grid: Record<string, string> = {};
  for (const it of items) {
    const pickIndex = it.position - 1;
    const { round, teamIndex } = slotToRoundAndTeamIndex(pickIndex, numTeams);
    const teamId = teamIds[teamIndex];
    grid[`${round}-${teamId}`] = it.playerId;
  }
  return grid;
}

// --- Draggable chip (used in a filled cell) ---
function DraggableCellChip({
  player,
  round,
  teamId,
  disabled,
}: {
  player: Player;
  round: number;
  teamId: string;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `placed-${round}-${teamId}`,
    data: { playerId: player.id, round, teamId, source: 'cell' as const },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`text-sm font-medium text-gray-900 truncate px-2 py-1 rounded bg-indigo-100 border border-indigo-200 cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      {player.name}
    </div>
  );
}

// --- Droppable cell ---
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
  round: number;
  teamId: string;
  teamIndex: number;
  numTeams: number;
  totalSlots: number;
  playerId: string | undefined;
  players: Player[];
  disabled?: boolean;
}) {
  const valid = isValidSlot(round, teamIndex, numTeams, totalSlots);
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${round}-${teamId}`,
    data: { round, teamId },
    disabled: disabled || !valid,
  });

  const playerObj = playerId ? players.find((p) => p.id === playerId) : undefined;

  return (
    <td
      ref={setNodeRef}
      className={`min-w-[7rem] p-1.5 align-top border-b border-gray-100 ${
        !valid ? 'bg-gray-50' : isOver ? 'bg-indigo-50 ring-1 ring-indigo-300 ring-inset' : 'bg-white'
      } ${!valid ? '' : 'min-h-[2.25rem]'}`}
    >
      {!valid ? (
        <span className="text-gray-300 text-xs">—</span>
      ) : playerObj ? (
        <DraggableCellChip player={playerObj} round={round} teamId={teamId} disabled={disabled} />
      ) : (
        <div className="text-gray-400 text-sm italic min-h-[1.5rem]">&nbsp;</div>
      )}
    </td>
  );
}

// --- Pool droppable + draggable items ---
function PlayerPoolItem({ player, disabled }: { player: Player; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${player.id}`,
    data: { playerId: player.id, source: 'pool' as const },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center justify-between px-3 py-2 rounded-md border cursor-grab active:cursor-grabbing transition-colors ${
        isDragging ? 'opacity-50' : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="font-medium text-gray-900 truncate">{player.name}</div>
      {player.team && <div className="text-xs text-gray-500 truncate ml-2">{player.team}</div>}
    </div>
  );
}

const DraftSubmission = () => {
  const { eventCode } = useParams<{ eventCode: string }>();
  useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState<{ id: string; players: Player[]; teams: Team[] } | null>(null);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    if (eventCode) fetchEventData();
  }, [eventCode]);

  const fetchEventData = async () => {
    try {
      const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`);
      const ev = eventResponse.data.event;
      setEvent(ev);

      const teamIds = (ev.teams || []).map((t: Team) => t.id);
      const numTeams = teamIds.length || 1;

      try {
        const subRes = await axios.get(`${API_URL}/api/draft/${ev.id}/my-submission`);
        const sub = subRes.data.submission;
        if (sub && sub.items?.length) {
          setSubmission(sub);
          setGrid(submissionToGrid(sub.items, teamIds, numTeams));
        } else {
          setGrid({});
        }
      } catch {
        setGrid({});
      }
    } catch (e) {
      console.error('Failed to fetch event:', e);
      setError('Failed to load event data');
    } finally {
      setLoading(false);
    }
  };

  const teamIds = useMemo(() => (event?.teams || []).map((t) => t.id), [event]);
  const numTeams = teamIds.length || 1;
  const totalSlots = (event?.players || []).length;
  const maxRound = Math.ceil(totalSlots / numTeams) || 1;
  const players = event?.players || [];

  const placedIds = useMemo(() => Object.values(grid), [grid]);
  const unplacedPlayers = useMemo(
    () => players.filter((p) => !placedIds.includes(p.id)),
    [players, placedIds]
  );
  const filteredPool = useMemo(
    () =>
      unplacedPlayers.filter((p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [unplacedPlayers, searchTerm]
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || !event) return;

    const fromPool = active.id.toString().startsWith('player-');
    const fromCell = active.id.toString().startsWith('placed-');
    const toPool = over.id === 'pool' || over.id.toString().startsWith('player-');
    const toCell = over.id.toString().startsWith('cell-');

    let fromPlayerId: string | null = null;
    let fromRound: number | undefined;
    let fromTeamId: string | undefined;

    if (fromPool) {
      fromPlayerId = (active.id as string).replace(/^player-/, '');
    } else if (fromCell) {
      const str = (active.id as string).replace(/^placed-/, '');
      const [r, ...rest] = str.split('-');
      fromRound = parseInt(r, 10);
      fromTeamId = rest.join('-');
      fromPlayerId = (active.data.current as { playerId?: string })?.playerId ?? null;
    }

    if (!fromPlayerId) return;

    let toRound: number | undefined;
    let toTeamId: string | undefined;
    if (toCell) {
      const parts = (over.id as string).replace(/^cell-/, '').split('-');
      toRound = parseInt(parts[0], 10);
      toTeamId = parts.slice(1).join('-') || undefined;
    }

    setGrid((g) => {
      const next = { ...g };
      const fromKey = fromRound != null && fromTeamId ? `${fromRound}-${fromTeamId}` : null;
      if (fromKey) delete next[fromKey];

      if (toPool) {
        // drop on pool: remove from grid only (already deleted above)
        return next;
      }

      if (toCell && toRound != null && toTeamId) {
        const toKey = `${toRound}-${toTeamId}`;
        const existing = next[toKey];
        next[toKey] = fromPlayerId;
        if (existing && fromKey && fromKey !== toKey) next[fromKey] = existing;
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!eventCode || !event) return;

    const playerOrder = gridToPlayerOrder(grid, teamIds, totalSlots);
    if (playerOrder.length !== totalSlots) {
      setError(`Place all ${totalSlots} players on the board before submitting.`);
      return;
    }
    if (new Set(playerOrder).size !== playerOrder.length) {
      setError('Duplicate placements detected. Each player must appear exactly once.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await axios.post(`${API_URL}/api/draft/${event.id}/submit-order`, { playerOrder });
      navigate(`/event/${eventCode}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit draft order');
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = submission?.locked || false;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Event not found</div>
      </div>
    );
  }

  if (event.teams.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-amber-700">
          No teams configured for this event. The draft board is available once teams are added.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => navigate(`/event/${eventCode}`)}
                className="text-gray-600 hover:text-gray-800 mr-4"
              >
                ← Back
              </button>
              <h1 className="text-xl font-bold text-gray-900">Mock Draft – Predictions</h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Draft board</h2>
          <p className="text-gray-600">
            Drag players from the list into the slots to predict the draft order. Each slot
            corresponds to a pick in snake order (round 1 left-to-right, round 2 right-to-left, etc.).
          </p>
        </div>

        {isLocked && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded">
            This submission is locked. You can view it but cannot make changes.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Draft board grid */}
            <div className="flex-1 min-w-0">
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Board</h3>
                  <p className="text-sm text-gray-500">
                    {placedIds.length} of {totalSlots} players placed
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[400px]">
                    <thead>
                      <tr>
                        <th className="text-left p-2 border-b border-gray-200 font-semibold text-gray-700 sticky left-0 bg-white z-10 min-w-[4rem]">
                          Round
                        </th>
                        {event.teams.map((t) => (
                          <th
                            key={t.id}
                            className="text-left p-2 border-b border-gray-200 font-semibold text-gray-700 min-w-[7rem]"
                          >
                            {t.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
                        <tr key={round} className="hover:bg-gray-50/50">
                          <td className="p-2 border-b border-gray-100 font-medium text-gray-600 sticky left-0 bg-white z-10">
                            {round}
                          </td>
                          {event.teams.map((t, teamIndex) => (
                            <DraftCell
                              key={`${round}-${t.id}`}
                              round={round}
                              teamId={t.id}
                              teamIndex={teamIndex}
                              numTeams={numTeams}
                              totalSlots={totalSlots}
                              playerId={grid[`${round}-${t.id}`]}
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
            <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
              <div className="bg-white shadow rounded-lg flex flex-col h-fit max-h-[70vh]">
                <div className="p-4 border-b border-gray-200 flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">Players</h3>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <DroppablePool disabled={isLocked}>
                  <div className="p-3 flex-1 overflow-y-auto space-y-2 min-h-[12rem]">
                    {filteredPool.map((p) => (
                      <PlayerPoolItem key={p.id} player={p} disabled={isLocked} />
                    ))}
                    {filteredPool.length === 0 && (
                      <div className="text-sm text-gray-500 py-4 text-center">
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

        <div className="mt-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {placedIds.length} of {totalSlots} players placed
          </div>
          {!isLocked && (
            <button
              onClick={handleSubmit}
              disabled={submitting || placedIds.length !== totalSlots}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit predictions'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

// Wrapper so we can use useDroppable (hooks must be in a component)
function DroppablePool({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'pool',
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex flex-col min-h-0 ${isOver ? 'bg-indigo-50' : ''}`}
    >
      {children}
    </div>
  );
}

export default DraftSubmission;
