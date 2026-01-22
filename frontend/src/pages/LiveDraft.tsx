import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

interface Player {
  id: string;
  name: string;
  position: string | null;
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

      return () => {
        socket.off('draft-update');
        socket.off('pick-made');
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
      alert('Only captains can make picks');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/draft/${event.id}/pick`, {
        playerId: selectedPlayer,
      });
      setSelectedPlayer(null);
      // State will update via socket or polling
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to make pick');
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

  const canMakePick = user && (user.role === 'ADMIN' || event.captainId === user.id);

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
              <button
                onClick={handleUndo}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Undo Last Pick
              </button>
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
                      {(player.position || player.team) && (
                        <div className="text-sm text-gray-500">
                          {player.position && <span>{player.position}</span>}
                          {player.position && player.team && <span> • </span>}
                          {player.team && <span>{player.team}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {canMakePick && selectedPlayer && (
                  <button
                    onClick={handleMakePick}
                    className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    Make Pick
                  </button>
                )}
              </div>
            </div>

            {/* Teams & Recent Picks */}
            <div className="lg:col-span-2">
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                {draftState.teams.map((team) => (
                  <div key={team.id} className="bg-white shadow rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{team.name}</h4>
                    <div className="space-y-1">
                      {team.draftPicks.map((pick) => (
                        <div key={pick.id} className="text-sm text-gray-600">
                          #{pick.pickNumber} - {pick.player.name}
                        </div>
                      ))}
                      {team.draftPicks.length === 0 && (
                        <div className="text-sm text-gray-400">No picks yet</div>
                      )}
                    </div>
                  </div>
                ))}
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
