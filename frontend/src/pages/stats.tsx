import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/auth-context'
import { AppHeader } from '../components/app-header'
import { InfoTooltip } from '../components/info-tooltip'
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from 'recharts'

interface CategoryScores {
	playerSlot: number
	teamOrder: number
	correctTeam: number
	correctRound: number
}

interface Ranking {
	userId: string
	userName: string
	exactMatches: number
	closeMatches: number
	teamOrderExactMatches?: number
	teamOrderScore?: number
	correctTeamMatches?: number
	correctRoundMatches?: number
	correctTeamScore?: number
	correctRoundScore?: number
	playerSlotScore?: number
	score: number
	totalPlayers: number
	rank: number
	categoryScores?: CategoryScores
	matchDetails: Array<{
	  playerName: string
	  predicted: number
	  actual: number
	  difference: number
	}>
}

interface UserStats {
	submission: {
	  submittedAt: string
	  locked: boolean
	}
	stats: {
	  exactMatches: number
	  closeMatches: number
	  teamOrderExactMatches?: number
	  teamOrderScore?: number
	  correctTeamMatches?: number
	  correctRoundMatches?: number
	  correctTeamScore?: number
	  correctRoundScore?: number
	  playerSlotScore?: number
	  score: number
	  totalPlayers: number
	  categoryScores?: CategoryScores
	  matchDetails: Array<{
	    playerName: string
	    predicted: number
	    actual: number | null
	    difference: number | null
	    team: string | null
	    predictedTeam?: string | null
	    actualTeam?: string | null
	    predictedRound?: number | null
	    actualRound?: number | null
	    correctTeam?: boolean | null
	  }>
	}
}

// Aggregate draft stats (player/team accuracy across users)
interface PlayerAggregate {
	playerId: string
	playerName: string
	teamName: string | null
	actualPick: number
	exactCount: number
	totalPredicted: number
	pctExact: number
	avgPredicted?: number | null
	avgError?: number | null
}

interface TeamOrderAggregate {
	teamId: string
	teamName: string
	actualPosition: number
	correctCount: number
	totalSubmissions: number
	pct: number
}

interface CorrectTeamAggregate {
	teamId: string
	teamName: string
	correctCount: number
	totalPossible: number
	pct: number
}

interface AggregateStats {
	totalSubmissions: number
	totalWithTeamOrder: number
	players: {
	  mostAccuratelyPredicted: PlayerAggregate[]
	  leastAccuratelyPredicted: PlayerAggregate[]
	  biggestSurprises: PlayerAggregate[]
	}
	teamOrder: {
	  mostAccuratelyPredicted: TeamOrderAggregate[]
	  leastAccuratelyPredicted: TeamOrderAggregate[]
	}
	correctTeam: {
	  mostAccuratelyPredicted: CorrectTeamAggregate[]
	  leastAccuratelyPredicted: CorrectTeamAggregate[]
	}
	message?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function Stats() {
	const { eventCode } = useParams<{ eventCode: string }>()
	const { user } = useAuth()
	const [rankings, setRankings] = useState<Ranking[]>([])
	const [userStats, setUserStats] = useState<UserStats | null>(null)
	const [aggregate, setAggregate] = useState<AggregateStats | null>(null)
	const [loading, setLoading] = useState(true)

	const fetchData = useCallback(async () => {
	  try {
	    const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`)
	    const eventId = eventResponse.data.event.id

	    const [rankingsResponse, aggregateResponse] = await Promise.all([
	      axios.get(`${API_URL}/api/stats/${eventId}/rankings`),
	      axios.get(`${API_URL}/api/stats/${eventId}/aggregate`),
	    ])
	    setRankings(rankingsResponse.data.rankings)
	    setAggregate(aggregateResponse.data.message ? null : aggregateResponse.data)

	    if (user) {
	      try {
	        const statsResponse = await axios.get(`${API_URL}/api/stats/${eventId}/my-stats`)
	        setUserStats(statsResponse.data)
	      } catch (_err) {
	        // User may not have submitted
	      }
	    }
	  } catch (error) {
	    console.error('Failed to fetch stats:', error)
	  } finally {
	    setLoading(false)
	  }
	}, [eventCode, user])

	useEffect(() => {
	  if (eventCode) {
	    fetchData()
	  }
	}, [eventCode, user, fetchData])

	if (loading) {
	  return (
	    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	      <div className="text-lg text-gray-600 dark:text-gray-400">Loading stats...</div>
	    </div>
	  )
	}

	const chartData = rankings.slice(0, 10).map((r) => ({
	  name: r.userName,
	  score: r.score,
	  playerSlot: r.categoryScores?.playerSlot ?? r.playerSlotScore ?? 0,
	  teamOrder: r.categoryScores?.teamOrder ?? r.teamOrderScore ?? 0,
	  correctTeam: r.categoryScores?.correctTeam ?? r.correctTeamScore ?? 0,
	  correctRound: r.categoryScores?.correctRound ?? r.correctRoundScore ?? 0,
	  exact: r.exactMatches,
	  close: r.closeMatches,
	}))

	return (
	  <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
	    <AppHeader backLink={`/event/${eventCode}`} title="Stats & Rankings" />

	    <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
	      <div className="px-4 py-6 sm:px-0">
	        {userStats && (
	          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6 mb-6">
	            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
	            Your Stats <InfoTooltip content="Your submission’s counts and points by category." />
	          </h2>
	            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-4">
	              <div className="text-center p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
	                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
	                  {userStats.stats.exactMatches}
	                </div>
	                <div className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center justify-center gap-1">
	                Exact (slot) <InfoTooltip content="Predicted pick # = actual. 10 pts each." />
	              </div>
	              </div>
	              <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
	                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
	                  {userStats.stats.closeMatches}
	                </div>
	                <div className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center justify-center gap-1">
	                Near (±1–3) <InfoTooltip content="Within 1–3 slots: ±1→5 pts, ±2→3, ±3→1." />
	              </div>
	              </div>
	              <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
	                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
	                  {userStats.stats.teamOrderExactMatches ?? 0}
	                </div>
	                <div className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center justify-center gap-1">
	                Team order <InfoTooltip content="Your predicted draft order (which team picks 1st, 2nd, …) vs actual. 5 pts per team in the right position." />
	              </div>
	              </div>
	              <div className="text-center p-3 rounded-lg bg-cyan-50 dark:bg-cyan-900/30">
	                <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">
	                  {userStats.stats.correctTeamMatches ?? 0}
	                </div>
	                <div className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center justify-center gap-1">
	                Correct team <InfoTooltip content="For each player, you predicted which team drafts them (from your order + team order). 3 pts per match." />
	              </div>
	              </div>
	              <div className="text-center p-3 rounded-lg bg-violet-50 dark:bg-violet-900/30">
	                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
	                  {userStats.stats.correctRoundMatches ?? 0}
	                </div>
	                <div className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center justify-center gap-1">
	                Correct round <InfoTooltip content="For each player, you predicted the round. 2 pts per match." />
	              </div>
	              </div>
	            </div>
	            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
	              <div className="text-center">
	                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userStats.stats.playerSlotScore ?? userStats.stats.exactMatches * 10 + (userStats.stats.closeMatches || 0) * 3}</span>
	                <span className="text-xs text-gray-500 dark:text-gray-400 block">
	                Player slot pts <InfoTooltip content="Exact: 10 pts. ±1: 5, ±2: 3, ±3: 1. Sum over all drafted players." />
	              </span>
	              </div>
	              <div className="text-center">
	                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userStats.stats.teamOrderScore ?? 0}</span>
	                <span className="text-xs text-gray-500 dark:text-gray-400 block">
	                Team order pts <InfoTooltip content="5 pts per team in the correct draft-order position." />
	              </span>
	              </div>
	              <div className="text-center">
	                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userStats.stats.correctTeamScore ?? 0}</span>
	                <span className="text-xs text-gray-500 dark:text-gray-400 block">
	                Correct team pts <InfoTooltip content="3 pts per player where your predicted drafting team matched." />
	              </span>
	              </div>
	              <div className="text-center">
	                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userStats.stats.correctRoundScore ?? 0}</span>
	                <span className="text-xs text-gray-500 dark:text-gray-400 block">
	                Correct round pts <InfoTooltip content="2 pts per player where your predicted round matched." />
	              </span>
	              </div>
	            </div>
	            <div className="flex items-center justify-between">
	              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
	              Total <InfoTooltip content="Sum of player slot + team order + correct team + correct round." />: {userStats.stats.score}
	            </div>
	              <div className="text-sm text-gray-500 dark:text-gray-400">
	                Last saved: {new Date(userStats.submission.submittedAt).toLocaleString()}
	              </div>
	            </div>
	          </div>
	        )}

	        {aggregate !== null && aggregate !== undefined && (
	          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6 mb-6">
	            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
	            Draft Insights <InfoTooltip content="Aggregate accuracy across all submissions: which players and teams the crowd got right or wrong." />
	          </h2>
	            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
	              Based on {aggregate.totalSubmissions} submission{aggregate.totalSubmissions !== 1 ? 's' : ''}
	              {aggregate.totalWithTeamOrder > 0 && aggregate.totalWithTeamOrder !== aggregate.totalSubmissions
	                ? ` (${aggregate.totalWithTeamOrder} with team order)`
	                : ''}.
	            </p>

	            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
	              {/* Players: most / least / surprises */}
	              <div className="space-y-4">
	                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">
	                Players (slot) <InfoTooltip content="Pick # accuracy: how many had each player’s slot exactly right. exact/total = exact matches over submissions that included that player." />
	              </h3>
	                <div>
	                  <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2">Most accurately predicted</h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.players.mostAccuratelyPredicted.slice(0, 5).map((p) => (
	                      <li key={p.playerId} className="flex justify-between gap-2">
	                        <span className="truncate" title={p.teamName ?? undefined}>{p.playerName}{p.teamName ? ` (${p.teamName})` : ''}</span>
	                        <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{p.exactCount}/{p.totalPredicted}</span>
	                      </li>
	                    ))}
	                    {aggregate.players.mostAccuratelyPredicted.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	                <div>
	                  <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Least accurately predicted</h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.players.leastAccuratelyPredicted.slice(0, 5).map((p) => (
	                      <li key={p.playerId} className="flex justify-between gap-2">
	                        <span className="truncate" title={p.teamName ?? undefined}>{p.playerName}{p.teamName ? ` (${p.teamName})` : ''}</span>
	                        <span className="text-amber-600 dark:text-amber-400 shrink-0">{p.exactCount}/{p.totalPredicted}</span>
	                      </li>
	                    ))}
	                    {aggregate.players.leastAccuratelyPredicted.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	                <div>
	                  <h4 className="text-sm font-medium text-violet-600 dark:text-violet-400 mb-2">
	                  Biggest surprises <InfoTooltip content="|avg predicted # − actual #|. Higher Δ = crowd was more wrong. # = actual pick." />
	                </h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.players.biggestSurprises.slice(0, 5).map((p) => (
	                      <li key={p.playerId} className="flex justify-between gap-2">
	                        <span className="truncate" title={p.teamName ?? undefined}>{p.playerName}{p.teamName ? ` (${p.teamName})` : ''}</span>
	                        <span className="text-violet-600 dark:text-violet-400 shrink-0" title={`Avg predicted ~${p.avgPredicted}, actual #${p.actualPick}`}>
	                          #{p.actualPick} (Δ{p.avgError ?? '?'})
	                        </span>
	                      </li>
	                    ))}
	                    {aggregate.players.biggestSurprises.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	              </div>

	              {/* Team order */}
	              <div className="space-y-4">
	                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">
	                Team draft order <InfoTooltip content="Which team picks 1st, 2nd, … correct/total = submissions that had that team in the right position." />
	              </h3>
	                <div>
	                  <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2">Most accurately predicted</h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.teamOrder.mostAccuratelyPredicted.slice(0, 5).map((t) => (
	                      <li key={t.teamId} className="flex justify-between gap-2">
	                        <span>{t.teamName} <span className="text-gray-400 dark:text-gray-500">(#{t.actualPosition})</span></span>
	                        <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{t.correctCount}/{t.totalSubmissions}</span>
	                      </li>
	                    ))}
	                    {aggregate.teamOrder.mostAccuratelyPredicted.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	                <div>
	                  <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Least accurately predicted</h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.teamOrder.leastAccuratelyPredicted.slice(0, 5).map((t) => (
	                      <li key={t.teamId} className="flex justify-between gap-2">
	                        <span>{t.teamName} <span className="text-gray-400 dark:text-gray-500">(#{t.actualPosition})</span></span>
	                        <span className="text-amber-600 dark:text-amber-400 shrink-0">{t.correctCount}/{t.totalSubmissions}</span>
	                      </li>
	                    ))}
	                    {aggregate.teamOrder.leastAccuratelyPredicted.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	              </div>

	              {/* Correct team (which team drafts which player) */}
	              <div className="space-y-4">
	                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">
	                Correct team (who drafts whom) <InfoTooltip content="For each team: of (user, player) pairs where that team drafted the player, how many predicted it. correct/total possible." />
	              </h3>
	                <div>
	                  <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2">Most accurately predicted</h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.correctTeam.mostAccuratelyPredicted.slice(0, 5).map((t) => (
	                      <li key={t.teamId} className="flex justify-between gap-2">
	                        <span>{t.teamName}</span>
	                        <span className="text-emerald-600 dark:text-emerald-400 shrink-0">{t.correctCount}/{t.totalPossible}</span>
	                      </li>
	                    ))}
	                    {aggregate.correctTeam.mostAccuratelyPredicted.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	                <div>
	                  <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Least accurately predicted</h4>
	                  <ul className="text-sm space-y-1 text-gray-900 dark:text-gray-100">
	                    {aggregate.correctTeam.leastAccuratelyPredicted.slice(0, 5).map((t) => (
	                      <li key={t.teamId} className="flex justify-between gap-2">
	                        <span>{t.teamName}</span>
	                        <span className="text-amber-600 dark:text-amber-400 shrink-0">{t.correctCount}/{t.totalPossible}</span>
	                      </li>
	                    ))}
	                    {aggregate.correctTeam.leastAccuratelyPredicted.length === 0 && (
	                      <li className="text-gray-500 dark:text-gray-400">-</li>
	                    )}
	                  </ul>
	                </div>
	              </div>
	            </div>
	          </div>
	        )}

	        <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6 mb-6">
	          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
	          Leaderboard <InfoTooltip content="Bars = total score, split into the four categories. Table columns use the same scoring." />
	        </h2>
	          {rankings.length === 0 ? (
	            <p className="text-gray-600 dark:text-gray-400">No rankings available yet.</p>
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
	                    <Bar dataKey="playerSlot" stackId="score" fill="#6366f1" name="Player slot" />
	                    <Bar dataKey="teamOrder" stackId="score" fill="#f59e0b" name="Team order" />
	                    <Bar dataKey="correctTeam" stackId="score" fill="#06b6d4" name="Correct team" />
	                    <Bar dataKey="correctRound" stackId="score" fill="#8b5cf6" name="Correct round" />
	                  </BarChart>
	                </ResponsiveContainer>
	              </div>
	              <div className="overflow-x-auto">
	                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
	                  <thead className="bg-gray-50 dark:bg-gray-700/50">
	                    <tr>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        Rank
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        Name
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        <span className="inline-flex items-center gap-1">Score <InfoTooltip content="Total: player slot + team order + correct team + correct round." /></span>
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        <span className="inline-flex items-center gap-1">Exact <InfoTooltip content="Players with predicted # = actual #. 10 pts each." /></span>
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        <span className="inline-flex items-center gap-1">Near <InfoTooltip content="Within ±1–3 slots. ±1→5, ±2→3, ±3→1 pt." /></span>
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        <span className="inline-flex items-center gap-1">Team ord <InfoTooltip content="Teams in the correct draft-order position. 5 pts each." /></span>
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        <span className="inline-flex items-center gap-1">Corr. team <InfoTooltip content="Players where you predicted the right drafting team. 3 pts each." /></span>
	                      </th>
	                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                        <span className="inline-flex items-center gap-1">Corr. round <InfoTooltip content="Players where you predicted the right round. 2 pts each." /></span>
	                      </th>
	                    </tr>
	                  </thead>
	                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
	                    {rankings.map((ranking) => (
	                      <tr
	                        key={ranking.userId}
	                        className={ranking.userId === user?.id ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}
	                      >
	                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
	                          #{ranking.rank}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                          {ranking.userName}
	                          {ranking.userId === user?.id && (
	                            <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400">(You)</span>
	                          )}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
	                          {ranking.score}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                          {ranking.exactMatches}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                          {ranking.closeMatches}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                          {ranking.teamOrderExactMatches ?? '-'}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                          {ranking.correctTeamMatches ?? '-'}
	                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                          {ranking.correctRoundMatches ?? '-'}
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
	          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
	            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
	            Your Match Details <InfoTooltip content="One row per player. Green = exact; yellow = ±1–3." />
	          </h2>
	            <div className="overflow-x-auto">
	              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
	                <thead className="bg-gray-50 dark:bg-gray-700/50">
	                  <tr>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      Player
	                    </th>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      <span className="inline-flex items-center gap-1">Pred # <InfoTooltip content="Your predicted overall pick number." /></span>
	                    </th>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      <span className="inline-flex items-center gap-1">Actual # <InfoTooltip content="Actual pick number, or not drafted." /></span>
	                    </th>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      <span className="inline-flex items-center gap-1">Diff <InfoTooltip content="|predicted − actual|. 0 = exact; ±1–3 = near." /></span>
	                    </th>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      <span className="inline-flex items-center gap-1">Pred. team <InfoTooltip content="Team you had in that slot (from your order + team order)." /></span>
	                    </th>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      <span className="inline-flex items-center gap-1">Actual team <InfoTooltip content="Team that actually drafted them." /></span>
	                    </th>
	                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                      <span className="inline-flex items-center gap-1">Team ✓ <InfoTooltip content="Predicted drafting team matched actual." /></span>
	                    </th>
	                  </tr>
	                </thead>
	                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
	                  {userStats.stats.matchDetails.map((match) => (
	                    <tr
	                      key={`${match.playerName}-${match.predicted}`}
	                      className={
	                        match.difference === 0
	                          ? 'bg-green-50 dark:bg-green-900/20'
	                          : match.difference !== null && match.difference <= 3
	                          ? 'bg-yellow-50 dark:bg-yellow-900/20'
	                          : ''
	                      }
	                    >
	                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
	                        {match.playerName}
	                      </td>
	                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                        #{match.predicted}
	                      </td>
	                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                        {match.actual !== null && match.actual !== undefined ? `#${match.actual}` : 'Not drafted'}
	                      </td>
	                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
	                        {match.difference !== null ? (
	                          <span
	                            className={
	                              match.difference === 0
	                                ? 'text-green-600 dark:text-green-400 font-semibold'
	                                : match.difference <= 3
	                                ? 'text-yellow-600 dark:text-yellow-400'
	                                : 'text-red-600 dark:text-red-400'
	                            }
	                          >
	                            {match.difference === 0 ? 'Perfect!' : `±${match.difference}`}
	                          </span>
	                        ) : (
	                          '-'
	                        )}
	                      </td>
	                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
	                        {match.predictedTeam ?? '-'}
	                      </td>
	                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
	                        {match.team ?? match.actualTeam ?? '-'}
	                      </td>
	                      <td className="px-6 py-4 whitespace-nowrap text-sm">
	                        {match.correctTeam === true && <span className="text-green-600 dark:text-green-400" aria-label="Correct team">✓</span>}
	                        {match.correctTeam === false && <span className="text-gray-400 dark:text-gray-500">-</span>}
	                        {(match.correctTeam === null || match.correctTeam === undefined) && <span className="text-gray-400 dark:text-gray-500">-</span>}
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
	)
}

export default Stats
