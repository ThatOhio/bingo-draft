import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Ranking {
  userId: string;
  userName: string;
  exactMatches: number;
  closeMatches: number;
  score: number;
  totalPlayers: number;
  rank: number;
  matchDetails: Array<{
    playerName: string;
    predicted: number;
    actual: number;
    difference: number;
  }>;
}

interface UserStats {
  submission: {
    submittedAt: string;
    locked: boolean;
  };
  stats: {
    exactMatches: number;
    closeMatches: number;
    score: number;
    totalPlayers: number;
    matchDetails: Array<{
      playerName: string;
      predicted: number;
      actual: number | null;
      difference: number | null;
      team: string | null;
    }>;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const Stats = () => {
  const { eventCode } = useParams<{ eventCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);

  useEffect(() => {
    if (eventCode) {
      fetchData();
    }
  }, [eventCode, user]);

  const fetchData = async () => {
    try {
      const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`);
      setEvent(eventResponse.data.event);

      const rankingsResponse = await axios.get(
        `${API_URL}/api/stats/${eventResponse.data.event.id}/rankings`
      );
      setRankings(rankingsResponse.data.rankings);

      if (user) {
        try {
          const statsResponse = await axios.get(
            `${API_URL}/api/stats/${eventResponse.data.event.id}/my-stats`
          );
          setUserStats(statsResponse.data);
        } catch (error) {
          // User may not have submitted
        }
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading stats...</div>
      </div>
    );
  }

  const chartData = rankings.slice(0, 10).map((r) => ({
    name: r.userName,
    score: r.score,
    exact: r.exactMatches,
    close: r.closeMatches,
  }));

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
              <h1 className="text-xl font-bold text-gray-900">Stats & Rankings</h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {userStats && (
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Stats</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">
                    {userStats.stats.exactMatches}
                  </div>
                  <div className="text-sm text-gray-600">Exact Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {userStats.stats.closeMatches}
                  </div>
                  <div className="text-sm text-gray-600">Close Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {userStats.stats.score}
                  </div>
                  <div className="text-sm text-gray-600">Total Score</div>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Last saved: {new Date(userStats.submission.submittedAt).toLocaleString()}
              </div>
            </div>
          )}

          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Leaderboard</h2>
            {rankings.length === 0 ? (
              <p className="text-gray-600">No rankings available yet.</p>
            ) : (
              <>
                <div className="mb-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="score" fill="#6366f1" name="Score" />
                      <Bar dataKey="exact" fill="#10b981" name="Exact Matches" />
                      <Bar dataKey="close" fill="#3b82f6" name="Close Matches" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rank
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Score
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Exact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Close
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rankings.map((ranking) => (
                        <tr
                          key={ranking.userId}
                          className={ranking.userId === user?.id ? 'bg-indigo-50' : ''}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{ranking.rank}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {ranking.userName}
                            {ranking.userId === user?.id && (
                              <span className="ml-2 text-xs text-indigo-600">(You)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {ranking.score}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {ranking.exactMatches}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {ranking.closeMatches}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {userStats && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Match Details</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Predicted
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actual
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Difference
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {userStats.stats.matchDetails.map((match, index) => (
                      <tr
                        key={index}
                        className={
                          match.difference === 0
                            ? 'bg-green-50'
                            : match.difference !== null && match.difference <= 3
                            ? 'bg-yellow-50'
                            : ''
                        }
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {match.playerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          #{match.predicted}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {match.actual ? `#${match.actual}` : 'Not drafted'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {match.difference !== null ? (
                            <span
                              className={
                                match.difference === 0
                                  ? 'text-green-600 font-semibold'
                                  : match.difference <= 3
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }
                            >
                              {match.difference === 0 ? 'Perfect!' : `±${match.difference}`}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {match.team || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Stats;
