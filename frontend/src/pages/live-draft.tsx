import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { useSocket } from '../contexts/socket-context'
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
	captains?: Array<{ id?: string; discordUsername: string; player?: Player }>
	draftPicks: Array<{
	  id: string
	  player: Player
	  pickNumber: number
	  round: number
	}>
}

interface DraftPick {
	id: string
	team: Team
	player: Player
	pickNumber: number
	round: number
	timestamp: string
}

interface DraftState {
	draftOrder: {
	  currentPick: number
	  currentRound: number
	  teamOrder: string[]
	} | null
	teams: Team[]
	picks: DraftPick[]
	availablePlayers: Player[]
	currentTeam: Team | null
}

interface LiveDraftEvent {
	id: string
	players: Player[]
	status: string
}

interface Captain {
	id?: string
	discordUsername: string
	player?: Player
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function LiveDraft() {
	const { eventCode } = useParams<{ eventCode: string }>()
	const { user } = useAuth()
	const { socket, connectToEvent } = useSocket()
	const [event, setEvent] = useState<LiveDraftEvent | null>(null)
	const [draftState, setDraftState] = useState<DraftState | null>(null)
	const [loading, setLoading] = useState(true)
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null) // For admin override
	const [searchTerm, setSearchTerm] = useState('')

	const fetchEvent = useCallback(async () => {
	  try {
	    const response = await axios.get(`${API_URL}/api/events/code/${eventCode}`)
	    setEvent(response.data.event)
	  } catch (error) {
	    console.error('Failed to fetch event:', error)
	  } finally {
	    setLoading(false)
	  }
	}, [eventCode])

	const fetchDraftState = useCallback(async () => {
	  if (!event) return
	  try {
	    const response = await axios.get(`${API_URL}/api/draft/${event.id}/state`)
	    setDraftState(response.data)
	  } catch (error) {
	    console.error('Failed to fetch draft state:', error)
	  }
	}, [event])

	useEffect(() => {
	  if (eventCode) {
	    fetchEvent()
	  }
	}, [eventCode, fetchEvent])

	useEffect(() => {
	  if (event && socket) {
	    connectToEvent(event.id)

	    socket.on('draft-update', (data: DraftState) => {
	      setDraftState(data)
	    })

	    socket.on('pick-made', (data: { pick: DraftPick; state: DraftState }) => {
	      setDraftState(data.state)
	    })

	    socket.on('draft-paused', () => {
	      if (event) fetchEvent()
	    })

	    socket.on('draft-resumed', () => {
	      if (event) fetchEvent()
	    })

	    return () => {
	      socket.off('draft-update')
	      socket.off('pick-made')
	      socket.off('draft-paused')
	      socket.off('draft-resumed')
	    }
	  }
	}, [event, socket, connectToEvent, fetchEvent])

	useEffect(() => {
	  if (event) {
	    fetchDraftState()
	    const interval = setInterval(fetchDraftState, 2000)
	    return () => clearInterval(interval)
	  }
	}, [event, fetchDraftState])

	const handleMakePick = async () => {
	  if (!selectedPlayer || !event || !draftState) return

	  const isAdmin = user?.role === 'ADMIN'
	  const currentTeam = draftState.currentTeam
	  const discordUsername = (user?.discordUsername ?? '').toLowerCase()
	  const isCaptainOfCurrentTeam = !!currentTeam?.captains?.some(
	    (c: Captain) => (c.discordUsername || '').toLowerCase() === discordUsername
	  )

	  if (!isAdmin && !isCaptainOfCurrentTeam) {
	    alert('Only the current team\'s captains and admins can make picks')
	    return
	  }

	  try {
	    const payload: { playerId: string; teamId?: string } = { playerId: selectedPlayer }
	    if (isAdmin && selectedTeamId) payload.teamId = selectedTeamId

	    await axios.post(`${API_URL}/api/draft/${event.id}/pick`, payload)
	    setSelectedPlayer(null)
	    setSelectedTeamId(null)
	    // State will update via socket or polling
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to make pick'))
	  }
	}

	const handlePause = async () => {
	  if (!event) return
	  try {
	    await axios.post(`${API_URL}/api/draft/${event.id}/pause`)
	    fetchEvent()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to pause draft'))
	  }
	}

	const handleResume = async () => {
	  if (!event) return
	  try {
	    await axios.post(`${API_URL}/api/draft/${event.id}/resume`)
	    fetchEvent()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to resume draft'))
	  }
	}

	const handleUndo = async () => {
	  if (!event) return

	  const isAdmin = user?.role === 'ADMIN'
	  const lastPick = draftState?.picks?.length ? draftState.picks[draftState.picks.length - 1] : null
	  const lastTeam = lastPick?.team
	  const discordUsername = (user?.discordUsername ?? '').toLowerCase()
	  const isCaptainOfLastTeam = !!lastTeam?.captains?.some(
	    (c: Captain) => (c.discordUsername || '').toLowerCase() === discordUsername
	  )

	  if (!isAdmin && !isCaptainOfLastTeam) {
	    alert('Only the picking team\'s captains and admins can undo')
	    return
	  }

	  if (!confirm('Are you sure you want to undo the last pick?')) {
	    return
	  }

	  try {
	    await axios.post(`${API_URL}/api/draft/${event.id}/undo`)
	    // State will update via socket or polling
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to undo pick'))
	  }
	}

	if (loading || !draftState || !event) {
	  return (
	    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	      <div className="text-lg text-gray-600 dark:text-gray-400">Loading draft...</div>
	    </div>
	  )
	}

	const filteredPlayers = draftState.availablePlayers.filter((player) =>
	  player.name.toLowerCase().includes(searchTerm.toLowerCase())
	)

	const currentTeam = draftState?.currentTeam
	const discordUsername = (user?.discordUsername ?? '').toLowerCase()
	const isCaptainOfCurrentTeam = !!currentTeam?.captains?.some(
	  (c: Captain) => (c.discordUsername || '').toLowerCase() === discordUsername
	)
	const canMakePick = user && (user.role === 'ADMIN' || isCaptainOfCurrentTeam)
	const isAdmin = user?.role === 'ADMIN'
	const canPauseResume = isAdmin && event && (event.status === 'DRAFTING' || event.status === 'PAUSED')
	const numTeams = draftState.teams.length || 1
	const useWideLayout = numTeams >= 6
	const handleSelectPlayer = (playerId: string) => () => {
		if (canMakePick) setSelectedPlayer(playerId)
	}

	return (
	  <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
	    <AppHeader
	      backLink={`/event/${eventCode}`}
	      title="Live Draft"
	      rightSlot={
	        canMakePick ? (
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
	        ) : undefined
	      }
	    />

	    <main
	      className={`mx-auto py-6 sm:px-6 lg:px-8 ${
	        numTeams >= 6 ? 'max-w-[min(1600px,96vw)]' : 'max-w-7xl'
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
	                {event.players.length}
	              </p>
	              {event.status === 'PAUSED' && (
	                <div className="mt-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded text-sm font-medium">
	                  ⏸ Draft Paused
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
	          /* Many teams: Draft Board full width on top, then Players | Recent Picks in 2 cols */
	          <div className="space-y-6">
	            <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-4 overflow-x-auto">
	              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Draft Board</h3>
	              <table className="w-full border-collapse min-w-[400px]">
	                <thead>
	                  <tr>
	                    <th className="text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[4rem]">
	                      Round
	                    </th>
	                    {(draftState.draftOrder
	                      ? draftState.draftOrder.teamOrder.slice(0, draftState.teams.length)
	                      : draftState.teams.map((t) => t.id)
	                    ).map((teamId) => {
	                      const team = draftState.teams.find((t) => t.id === teamId)
	                      const isCurrentTeam =
	                        draftState.draftOrder &&
	                        draftState.currentTeam?.id === teamId &&
	                        (draftState.draftOrder.currentPick ?? 0) < (event?.players?.length ?? 0)
	                      const compact = numTeams >= 5
	                      return team ? (
	                        <th
	                          key={team.id}
	                          title={compact ? team.name : undefined}
	                          className={`text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold ${
	                            compact ? 'min-w-0 max-w-[5.5rem] truncate' : 'min-w-[7rem]'
	                          } ${
	                            isCurrentTeam
	                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
	                              : 'text-gray-700 dark:text-gray-300'
	                          }`}
	                        >
	                          {team.name}
	                        </th>
	                      ) : null
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
	                    <tr key={round} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
	                      <td className="p-2 border-b border-gray-100 dark:border-gray-700 font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10">
	                        {round}
	                      </td>
	                      {(draftState.draftOrder
	                        ? draftState.draftOrder.teamOrder.slice(0, draftState.teams.length)
	                        : draftState.teams.map((t) => t.id)
	                      ).map((teamId) => {
	                        const team = draftState.teams.find((t) => t.id === teamId)
	                        if (!team) return null
	                        const pick = team.draftPicks.find((p) => p.round === round)
	                        const isCurrentCell =
	                          draftState.draftOrder &&
	                          (draftState.draftOrder.currentPick ?? 0) < (event?.players?.length ?? 0) &&
	                          draftState.draftOrder.currentRound === round &&
	                          draftState.draftOrder.teamOrder[draftState.draftOrder.currentPick] === teamId
	                        return (
	                          <td
	                            key={team.id}
	                            className={`p-2 border-b border-gray-100 dark:border-gray-700 align-top ${
	                              isCurrentCell
	                                ? 'bg-amber-200/80 dark:bg-amber-900/50 ring-2 ring-amber-500 dark:ring-amber-600 ring-inset'
	                                : 'bg-white dark:bg-gray-800'
	                            }`}
	                          >
	                            {pick ? (
	                              <span className="text-gray-900 dark:text-gray-100">{pick.player.name}</span>
	                            ) : isCurrentCell ? (
	                              <span className="text-amber-700 dark:text-amber-300 text-sm italic">On the clock</span>
	                            ) : (
	                              <span className="text-gray-300 dark:text-gray-600">-</span>
	                            )}
	                          </td>
	                        )
	                      })}
	                    </tr>
	                  ))}
	                </tbody>
	              </table>
	            </div>
	            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
	              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Available Players</h3>
	                <input
	                  type="text"
	                  placeholder="Search players..."
	                  value={searchTerm}
	                  onChange={(e) => setSearchTerm(e.target.value)}
	                  className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                />
	                <div className="max-h-96 overflow-y-auto flex flex-wrap gap-2 content-start">
	                  {filteredPlayers.map((player) => {
	                    const title = player.team ? `${player.name} (${player.team})` : player.name
	                    return (
	                      <button
	                        key={player.id}
	                        type="button"
	                        title={title}
	                        onClick={handleSelectPlayer(player.id)}
	                        className={`inline-flex items-center px-2 py-1 rounded-md border text-sm transition-colors ${
	                          selectedPlayer === player.id
	                            ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500 dark:border-indigo-400'
	                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
	                        } ${canMakePick ? 'cursor-pointer' : 'cursor-default opacity-75'}`}
	                      >
	                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[11rem]">{player.name}</span>
	                      </button>
	                    )
	                  })}
	                </div>
	                {canMakePick && selectedPlayer && (
	                  <div className="mt-4 space-y-3">
	                    {isAdmin && draftState.teams.length > 0 && (
	                      <div>
	                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                          Override Team (Admin Only)
	                        </label>
	                        <select
	                          value={selectedTeamId || ''}
	                          onChange={(e) => setSelectedTeamId(e.target.value || null)}
	                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                        >
	                          <option value="">Use Current Team</option>
	                          {draftState.teams.map((team) => (
	                            <option key={team.id} value={team.id}>
	                              {team.name}
	                            </option>
	                          ))}
	                        </select>
	                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
	              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Picks</h3>
	                <div className="space-y-2 max-h-64 overflow-y-auto">
	                  {draftState.picks.slice(-10).reverse().map((pick) => (
	                    <div key={pick.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
	                      <div>
	                        <span className="font-medium text-gray-900 dark:text-gray-100">#{pick.pickNumber}</span> -{' '}
	                        <span className="font-semibold text-gray-900 dark:text-gray-100">{pick.player.name}</span> →{' '}
	                        <span className="text-indigo-600 dark:text-indigo-400">{pick.team.name}</span>
	                      </div>
	                      <div className="text-sm text-gray-500 dark:text-gray-400">
	                        Round {pick.round}
	                      </div>
	                    </div>
	                  ))}
	                </div>
	              </div>
	            </div>
	          </div>
	        ) : (
	          <div className="grid lg:grid-cols-3 gap-6">
	            {/* Available Players */}
	            <div className="lg:col-span-1">
	              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Available Players</h3>
	                <input
	                  type="text"
	                  placeholder="Search players..."
	                  value={searchTerm}
	                  onChange={(e) => setSearchTerm(e.target.value)}
	                  className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                />
	                <div className="max-h-96 overflow-y-auto flex flex-wrap gap-2 content-start">
	                  {filteredPlayers.map((player) => {
	                    const title = player.team ? `${player.name} (${player.team})` : player.name
	                    return (
	                      <button
	                        key={player.id}
	                        type="button"
	                        title={title}
	                        onClick={handleSelectPlayer(player.id)}
	                        className={`inline-flex items-center px-2 py-1 rounded-md border text-sm transition-colors ${
	                          selectedPlayer === player.id
	                            ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500 dark:border-indigo-400'
	                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
	                        } ${canMakePick ? 'cursor-pointer' : 'cursor-default opacity-75'}`}
	                      >
	                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[11rem]">{player.name}</span>
	                      </button>
	                    )
	                  })}
	                </div>
	                {canMakePick && selectedPlayer && (
	                  <div className="mt-4 space-y-3">
	                    {isAdmin && draftState.teams.length > 0 && (
	                      <div>
	                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                          Override Team (Admin Only)
	                        </label>
	                        <select
	                          value={selectedTeamId || ''}
	                          onChange={(e) => setSelectedTeamId(e.target.value || null)}
	                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                        >
	                          <option value="">Use Current Team</option>
	                          {draftState.teams.map((team) => (
	                            <option key={team.id} value={team.id}>
	                              {team.name}
	                            </option>
	                          ))}
	                        </select>
	                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
	              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-4 mb-6 overflow-x-auto">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Draft Board</h3>
	                <table className="w-full border-collapse min-w-[400px]">
	                  <thead>
	                    <tr>
	                      <th className="text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[4rem]">
	                        Round
	                      </th>
	                      {(draftState.draftOrder
	                        ? draftState.draftOrder.teamOrder.slice(0, draftState.teams.length)
	                        : draftState.teams.map((t) => t.id)
	                      ).map((teamId) => {
	                        const team = draftState.teams.find((t) => t.id === teamId)
	                        const isCurrentTeam =
	                          draftState.draftOrder &&
	                          draftState.currentTeam?.id === teamId &&
	                          (draftState.draftOrder.currentPick ?? 0) < (event?.players?.length ?? 0)
	                        const compact = numTeams >= 5
	                        return team ? (
	                          <th
	                            key={team.id}
	                            title={compact ? team.name : undefined}
	                            className={`text-left p-2 border-b border-gray-200 dark:border-gray-700 font-semibold ${
	                              compact ? 'min-w-0 max-w-[5.5rem] truncate' : 'min-w-[7rem]'
	                            } ${
	                              isCurrentTeam
	                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
	                                : 'text-gray-700 dark:text-gray-300'
	                            }`}
	                          >
	                            {team.name}
	                          </th>
	                        ) : null
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
	                      <tr key={round} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
	                        <td className="p-2 border-b border-gray-100 dark:border-gray-700 font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10">
	                          {round}
	                        </td>
	                        {(draftState.draftOrder
	                          ? draftState.draftOrder.teamOrder.slice(0, draftState.teams.length)
	                          : draftState.teams.map((t) => t.id)
	                        ).map((teamId) => {
	                          const team = draftState.teams.find((t) => t.id === teamId)
	                          if (!team) return null
	                          const pick = team.draftPicks.find((p) => p.round === round)
	                          const isCurrentCell =
	                            draftState.draftOrder &&
	                            (draftState.draftOrder.currentPick ?? 0) < (event?.players?.length ?? 0) &&
	                            draftState.draftOrder.currentRound === round &&
	                            draftState.draftOrder.teamOrder[draftState.draftOrder.currentPick] === teamId
	                          return (
	                            <td
	                              key={team.id}
	                              className={`p-2 border-b border-gray-100 dark:border-gray-700 align-top ${
	                                isCurrentCell
	                                  ? 'bg-amber-200/80 dark:bg-amber-900/50 ring-2 ring-amber-500 dark:ring-amber-600 ring-inset'
	                                  : 'bg-white dark:bg-gray-800'
	                              }`}
	                            >
	                              {pick ? (
	                                <span className="text-gray-900 dark:text-gray-100">{pick.player.name}</span>
	                              ) : isCurrentCell ? (
	                                <span className="text-amber-700 dark:text-amber-300 text-sm italic">On the clock</span>
	                              ) : (
	                                <span className="text-gray-300 dark:text-gray-600">-</span>
	                              )}
	                            </td>
	                          )
	                        })}
	                      </tr>
	                    ))}
	                  </tbody>
	                </table>
	              </div>

	              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg p-6">
	                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Picks</h3>
	                <div className="space-y-2 max-h-64 overflow-y-auto">
	                  {draftState.picks.slice(-10).reverse().map((pick) => (
	                    <div key={pick.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
	                      <div>
	                        <span className="font-medium text-gray-900 dark:text-gray-100">#{pick.pickNumber}</span> -{' '}
	                        <span className="font-semibold text-gray-900 dark:text-gray-100">{pick.player.name}</span> →{' '}
	                        <span className="text-indigo-600 dark:text-indigo-400">{pick.team.name}</span>
	                      </div>
	                      <div className="text-sm text-gray-500 dark:text-gray-400">
	                        Round {pick.round}
	                      </div>
	                    </div>
	                  ))}
	                </div>
	              </div>
	            </div>
	          </div>
	        )}
	      </div>
	    </main>
	  </div>
	)
}

export default LiveDraft
