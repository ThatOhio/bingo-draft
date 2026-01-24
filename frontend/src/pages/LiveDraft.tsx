import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

interface Player {
  id: string;
  name: string;
  team: string | null;
}

interface Team {
  id: string;
  name: string;
  draftPicks: Array<{
    id: string;
    player: Player;
    pickNumber: number;
    round: number;
  }>;
}

interface DraftPick {
  id: string;
  team: Team;
  player: Player;
  pickNumber: number;
  round: number;
  timestamp: string;
}

interface DraftState {
  draftOrder: {
    currentPick: number;
    currentRound: number;
    teamOrder: string[];
  } | null;
  teams: Team[];
  picks: DraftPick[];
  availablePlayers: Player[];
  currentTeam: Team | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const LiveDraft = () => {
  const { eventCode } = useParams<{ eventCode: string }>();
  const { user } = useAuth();
  const { socket, connectToEvent } = useSocket();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null); // For admin override
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (eventCode) {
      fetchEvent();
    }
  }, [eventCode]);

  useEffect(() => {
    if (event && socket) {
      connectToEvent(event.id);
      
      socket.on('draft-update', (data: DraftState) => {
        setDraftState(data);
      });

      socket.on('pick-made', (data: { pick: DraftPick; state: DraftState }) => {
        setDraftState(data.state);
      });

      socket.on('draft-paused', () => {
        if (event) {
          fetchEvent(); // Refresh event status
        }
      });

      socket.on('draft-resumed', () => {
        if (event) {
          fetchEvent(); // Refresh event status
        }
      });

      return () => {
        socket.off('draft-update');
        socket.off('pick-made');
        socket.off('draft-paused');
        socket.off('draft-resumed');
      };
    }
  }, [event, socket, connectToEvent]);

  useEffect(() => {
    if (event) {
      fetchDraftState();
      const interval = setInterval(fetchDraftState, 2000); // Poll every 2 seconds as fallback
      return () => clearInterval(interval);
    }
  }, [event]);

  const fetchEvent = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/events/code/${eventCode}`);
      setEvent(response.data.event);
    } catch (error) {
      console.error('Failed to fetch event:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDraftState = async () => {
    if (!event) return;
    try {
      const response = await axios.get(`${API_URL}/api/draft/${event.id}/state`);
      setDraftState(response.data);
    } catch (error) {
      console.error('Failed to fetch draft state:', error);
    }
  };

  const handleMakePick = async () => {
    if (!selectedPlayer || !event || !draftState) return;

    const isAdmin = user?.role === 'ADMIN';
    const isCaptain = event.captainId === user?.id;

    if (!isAdmin && !isCaptain) {
      alert('Only captains and admins can make picks');
      return;
    }

    try {
      const payload: any = { playerId: selectedPlayer };
      // If admin and team override selected, include it
      if (isAdmin && selectedTeamId) {
        payload.teamId = selectedTeamId;
      }

      await axios.post(`${API_URL}/api/draft/${event.id}/pick`, payload);
      setSelectedPlayer(null);
      setSelectedTeamId(null);
      // State will update via socket or polling
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to make pick');
    }
  };

  const handlePause = async () => {
    if (!event) return;
    try {
      await axios.post(`${API_URL}/api/draft/${event.id}/pause`);
      fetchEvent();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to pause draft');
    }
  };

  const handleResume = async () => {
    if (!event) return;
    try {
      await axios.post(`${API_URL}/api/draft/${event.id}/resume`);
      fetchEvent();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to resume draft');
    }
  };

  const handleUndo = async () => {
    if (!event) return;

    const isAdmin = user?.role === 'ADMIN';
    const isCaptain = event.captainId === user?.id;

    if (!isAdmin && !isCaptain) {
      alert('Only captains can undo picks');
      return;
    }

    if (!confirm('Are you sure you want to undo the last pick?')) {
      return;
    }

    try {
      await axios.post(`${API_URL}/api/draft/${event.id}/undo`);
      // State will update via socket or polling
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to undo pick');
    }
  };

  if (loading || !draftState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading draft...</div>
      </div>
    );
  }

  const filteredPlayers = draftState.availablePlayers.filter((player) =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canMakePick = user && (user.role === 'ADMIN' || event?.captainId === user.id);
  const isAdmin = user?.role === 'ADMIN';
  const canPauseResume = isAdmin && event && (event.status === 'DRAFTING' || event.status === 'PAUSED');

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
              <h1 className="text-xl font-bold text-gray-900">Live Draft</h1>
            </div>
            {canMakePick && (
              <div className="flex gap-2">
                {canPauseResume && (
                  <>
                    {event.status === 'DRAFTING' && (
                      <button
                        onClick={handlePause}
                        className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                      >
                        Pause Draft
                      </button>
                    )}
                    {event.status === 'PAUSED' && (
                      <button
                        onClick={handleResume}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Resume Draft
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={handleUndo}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Undo Last Pick
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6 bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Round {draftState.draftOrder?.currentRound || 1}
                </h2>
                <p className="text-gray-600">
                  Pick #{draftState.draftOrder ? draftState.draftOrder.currentPick + 1 : 0} of{' '}
                  {event.players.length}
                </p>
                {event.status === 'PAUSED' && (
                  <div className="mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-medium">
                    ⏸ Draft Paused
                  </div>
                )}
              </div>
              {draftState.currentTeam && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Current Team:</p>
                  <p className="text-xl font-semibold text-indigo-600">
                    {draftState.currentTeam.name}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Available Players */}
            <div className="lg:col-span-1">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Players</h3>
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {filteredPlayers.map((player) => (
                    <div
                      key={player.id}
                      className={`p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedPlayer === player.id
                          ? 'bg-indigo-100 border-indigo-500'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => canMakePick && setSelectedPlayer(player.id)}
                    >
                      <div className="font-medium text-gray-900">{player.name}</div>
                      {player.team && (
                        <div className="text-sm text-gray-500">{player.team}</div>
                      )}
                    </div>
                  ))}
                </div>
                {canMakePick && selectedPlayer && (
                  <div className="mt-4 space-y-3">
                    {isAdmin && draftState.teams.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Override Team (Admin Only)
                        </label>
                        <select
                          value={selectedTeamId || ''}
                          onChange={(e) => setSelectedTeamId(e.target.value || null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Use Current Team</option>
                          {draftState.teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Leave as "Use Current Team" to follow normal draft order
                        </p>
                      </div>
                    )}
                    <button
                      onClick={handleMakePick}
                      className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      Make Pick
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Teams & Recent Picks */}
            <div className="lg:col-span-2">
              {/* Draft Grid: teams as columns, rounds as rows */}
              <div className="bg-white shadow rounded-lg p-4 mb-6 overflow-x-auto">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Draft Board</h3>
                <table className="w-full border-collapse min-w-[400px]">
                  <thead>
                    <tr>
                      <th className="text-left p-2 border-b border-gray-200 font-semibold text-gray-700 sticky left-0 bg-white z-10 min-w-[4rem]">
                        Round
                      </th>
                      {(draftState.draftOrder
                        ? draftState.draftOrder.teamOrder.slice(0, draftState.teams.length)
                        : draftState.teams.map((t) => t.id)
                      ).map((teamId) => {
                        const team = draftState.teams.find((t) => t.id === teamId);
                        const isCurrentTeam =
                          draftState.draftOrder &&
                          draftState.currentTeam?.id === teamId &&
                          (draftState.draftOrder.currentPick ?? 0) < (event?.players?.length ?? 0);
                        return team ? (
                          <th
                            key={team.id}
                            className={`text-left p-2 border-b border-gray-200 font-semibold min-w-[7rem] ${
                              isCurrentTeam
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'text-gray-700'
                            }`}
                          >
                            {team.name}
                          </th>
                        ) : null;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      {
                        length: Math.ceil(
                          (event?.players?.length ?? 0) / (draftState.teams.length || 1)
                        ) || 1,
                      },
                      (_, i) => i + 1
                    ).map((round) => (
                      <tr key={round} className="hover:bg-gray-50/50">
                        <td className="p-2 border-b border-gray-100 font-medium text-gray-600 sticky left-0 bg-white z-10">
                          {round}
                        </td>
                        {(draftState.draftOrder
                          ? draftState.draftOrder.teamOrder.slice(0, draftState.teams.length)
                          : draftState.teams.map((t) => t.id)
                        ).map((teamId) => {
                          const team = draftState.teams.find((t) => t.id === teamId);
                          if (!team) return null;
                          const pick = team.draftPicks.find((p) => p.round === round);
                          const isCurrentCell =
                            draftState.draftOrder &&
                            (draftState.draftOrder.currentPick ?? 0) < (event?.players?.length ?? 0) &&
                            draftState.draftOrder.currentRound === round &&
                            draftState.draftOrder.teamOrder[draftState.draftOrder.currentPick] === teamId;
                          return (
                            <td
                              key={team.id}
                              className={`p-2 border-b border-gray-100 align-top ${
                                isCurrentCell
                                  ? 'bg-amber-200/80 ring-2 ring-amber-500 ring-inset'
                                  : 'bg-white'
                              }`}
                            >
                              {pick ? (
                                <span className="text-gray-900">{pick.player.name}</span>
                              ) : isCurrentCell ? (
                                <span className="text-amber-700 text-sm italic">On the clock</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Picks</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {draftState.picks.slice(-10).reverse().map((pick) => (
                    <div key={pick.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">#{pick.pickNumber}</span> -{' '}
                        <span className="font-semibold">{pick.player.name}</span> →{' '}
                        <span className="text-indigo-600">{pick.team.name}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        Round {pick.round}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LiveDraft;
