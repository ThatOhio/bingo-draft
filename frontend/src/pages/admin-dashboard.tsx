import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import {
	DndContext,
	closestCenter,
	DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AppHeader } from '../components/app-header'
import { getErrorMessage } from '../utils/get-error-message'
import {
	createEventSchema,
	createTeamSchema,
	bulkImportSchema,
	type CreateEventForm,
	type CreateTeamForm,
	type BulkImportForm,
} from '../schemas/forms'

interface User {
	id: string
	discordId: string
	discordUsername: string
	role: string
	createdAt: string
}

interface Event {
	id: string
	name: string
	eventCode: string
	status: string
	_count: {
	  submissions: number
	  players: number
	  teams: number
	}
}

interface EventDetailsPlayer {
	id: string
	name: string
}

interface EventDetailsCaptain {
	id: string
	discordUsername: string
	player?: { id: string; name: string }
}

interface EventDetailsTeam {
	id: string
	name: string
	captains?: EventDetailsCaptain[]
}

interface EventDetails {
	status: string
	teams?: EventDetailsTeam[]
	players?: EventDetailsPlayer[]
	teamDraftOrder?: string[]
	draftOrder?: { currentRound: number; currentPick: number }
}

interface CreateEventDto {
	name: string
	eventCode: string
	description?: string
	draftDeadline?: string
	draftStartTime?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * Sortable team row for team draft order. Drag handle, index, and team name.
 */
function SortableTeamRow({
	id,
	team,
	index,
}: {
	id: string
	team: { id: string; name: string } | undefined
	index: number
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
	if (!team) return null
	return (
	  <div
	    ref={setNodeRef}
	    style={{ transform: CSS.Transform.toString(transform), transition }}
	    className={`flex items-center gap-2 py-1.5 px-2 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 ${isDragging ? 'opacity-70 shadow-lg z-10' : ''} cursor-grab active:cursor-grabbing`}
	    {...attributes}
	    {...listeners}
	  >
	    <span className="text-gray-400 dark:text-gray-500 select-none" aria-hidden="true">⋮⋮</span>
	    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-6">#{index}</span>
	    <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">{team.name}</span>
	  </div>
	)
}

function AdminDashboard() {
	const [users, setUsers] = useState<User[]>([])
	const [events, setEvents] = useState<Event[]>([])
	const [loading, setLoading] = useState(true)
	const [activeTab, setActiveTab] = useState<'users' | 'events' | 'event-management' | 'create-event'>('users')
	const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
	const [importing, setImporting] = useState(false)
	const [creatingEvent, setCreatingEvent] = useState(false)
	const [creatingTeam, setCreatingTeam] = useState(false)

	const createEventForm = useForm<CreateEventForm>({
		resolver: zodResolver(createEventSchema),
		defaultValues: { name: '', eventCode: '', description: '', draftDeadline: '', draftStartTime: '' },
	})

	const bulkImportForm = useForm<BulkImportForm>({
		resolver: zodResolver(bulkImportSchema),
		defaultValues: { text: '' },
	})

	const createTeamForm = useForm<CreateTeamForm>({
		resolver: zodResolver(createTeamSchema),
		defaultValues: { name: '', captains: [] },
	})
	const createTeamCaptains = useFieldArray({
		control: createTeamForm.control,
		name: 'captains',
	})
	const [eventDetails, setEventDetails] = useState<EventDetails | null>(null)
	const [addCaptainByTeam, setAddCaptainByTeam] = useState<Record<string, { playerId: string; discordUsername: string }>>({})
	const [addingCaptainToTeamId, setAddingCaptainToTeamId] = useState<string | null>(null)
	const [teamOrderIds, setTeamOrderIds] = useState<string[]>([])
	const [savingTeamDraftOrder, setSavingTeamDraftOrder] = useState(false)

	// Export state
	const [exporting, setExporting] = useState(false)

	const teamOrderSensors = useSensors(
	  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
	)

	const handleTabUsers = () => setActiveTab('users')
	const handleTabEvents = () => setActiveTab('events')
	const handleTabCreateEvent = () => setActiveTab('create-event')
	const handleTabEventManagement = () => setActiveTab('event-management')
	const handleInitDraftClick = () => { if (selectedEvent) handleInitializeDraft(selectedEvent.id) }
	const handleRemoveCaptainFor = (teamId: string, captainId: string) => () =>
		handleRemoveCaptain(teamId, captainId)
	const handleAddCaptainFor = (teamId: string) => () => handleAddCaptain(teamId)
	const handleRemoveCaptainRow = (i: number) => () => createTeamCaptains.remove(i)
	const handleAppendCaptainRow = () =>
		createTeamCaptains.append({ playerId: '', discordUsername: '' })
	const handleExportClick = () => { if (selectedEvent) handleExportData(selectedEvent.id) }

	function getOrderedTeamIds(ed: EventDetails | null): string[] {
	  if (!ed?.teams?.length) return []
	  const ids = ed.teams.map((t: EventDetailsTeam) => t.id)
	  if (ed.teamDraftOrder?.length === ids.length && ids.every((id: string) => ed.teamDraftOrder!.includes(id)))
	    return ed.teamDraftOrder
	  return ed.teams
	    .slice()
	    .sort((a: EventDetailsTeam, b: EventDetailsTeam) => a.name.localeCompare(b.name))
	    .map((t: EventDetailsTeam) => t.id)
	}

	const fetchData = useCallback(async () => {
	  try {
	    const [usersResponse, eventsResponse] = await Promise.all([
	      axios.get(`${API_URL}/api/users`),
	      axios.get(`${API_URL}/api/events`),
	    ])
	    setUsers(usersResponse.data.users)
	    setEvents(eventsResponse.data.events)
	  } catch (error) {
	    console.error('Failed to fetch data:', error)
	  } finally {
	    setLoading(false)
	  }
	}, [])

	useEffect(() => {
	  fetchData()
	}, [fetchData])

	const handleBulkImportSubmit = async (data: BulkImportForm, eventId: string) => {
	  setImporting(true)
	  try {
	    await axios.post(`${API_URL}/api/events/${eventId}/players/bulk-import`, { text: data.text })
	    alert('Players imported successfully!')
	    bulkImportForm.reset()
	    fetchEventDetails(eventId)
	    fetchData()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to import players'))
	  } finally {
	    setImporting(false)
	  }
	}

	const updateUserRole = async (userId: string, newRole: string) => {
	  try {
	    await axios.put(`${API_URL}/api/users/${userId}/role`, { role: newRole })
	    fetchData()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to update user role'))
	  }
	}

	const onCreateEventSubmit = async (data: CreateEventForm) => {
	  setCreatingEvent(true)
	  try {
	    const eventData: CreateEventDto = {
	      name: data.name,
	      eventCode: data.eventCode,
	    }
	    if (data.description?.trim()) eventData.description = data.description
	    if (data.draftDeadline) eventData.draftDeadline = new Date(data.draftDeadline).toISOString()
	    if (data.draftStartTime) eventData.draftStartTime = new Date(data.draftStartTime).toISOString()

	    await axios.post(`${API_URL}/api/events`, eventData)
	    alert('Event created successfully!')
	    createEventForm.reset()
	    fetchData()
	    setActiveTab('events')
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to create event'))
	  } finally {
	    setCreatingEvent(false)
	  }
	}

	const fetchEventDetails = async (eventId: string) => {
	  try {
	    const response = await axios.get(`${API_URL}/api/events/${eventId}`)
	    setEventDetails(response.data.event)
	  } catch (error) {
	    console.error('Failed to fetch event details:', error)
	  }
	}

	const handleCreateTeamSubmit = async (data: CreateTeamForm) => {
	  if (!selectedEvent) return
	  const captains = data.captains.filter((c) => c.playerId && c.discordUsername.trim())
	  setCreatingTeam(true)
	  try {
	    await axios.post(`${API_URL}/api/events/${selectedEvent.id}/teams`, {
	      name: data.name,
	      captains: captains.map((c) => ({ playerId: c.playerId, discordUsername: c.discordUsername.trim() })),
	    })
	    alert('Team created successfully!')
	    createTeamForm.reset({ name: '', captains: [] })
	    fetchEventDetails(selectedEvent.id)
	    fetchData()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to create team'))
	  } finally {
	    setCreatingTeam(false)
	  }
	}

	const handleAddCaptain = async (teamId: string) => {
	  const form = addCaptainByTeam[teamId]
	  if (!form?.playerId || !form.discordUsername.trim()) {
	    alert('Select a player and enter Discord username')
	    return
	  }
	  if (!selectedEvent) return
	  setAddingCaptainToTeamId(teamId)
	  try {
	    await axios.post(`${API_URL}/api/events/${selectedEvent.id}/teams/${teamId}/captains`, {
	      playerId: form.playerId,
	      discordUsername: form.discordUsername.trim(),
	    })
	    setAddCaptainByTeam((prev) => ({ ...prev, [teamId]: { playerId: '', discordUsername: '' } }))
	    fetchEventDetails(selectedEvent.id)
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to add captain'))
	  } finally {
	    setAddingCaptainToTeamId(null)
	  }
	}

	const handleRemoveCaptain = async (teamId: string, captainId: string) => {
	  if (!selectedEvent) return
	  if (!confirm('Remove this captain?')) return
	  try {
	    await axios.delete(`${API_URL}/api/events/${selectedEvent.id}/teams/${teamId}/captains/${captainId}`)
	    fetchEventDetails(selectedEvent.id)
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to remove captain'))
	  }
	}

	const handleSaveTeamDraftOrder = async () => {
	  if (!selectedEvent || !eventDetails || !eventDetails.teams?.length) return
	  const teams = eventDetails.teams
	  const tlen = teams.length
	  const ordered = teamOrderIds.length === tlen && teamOrderIds.every((id) => teams.some((t) => t.id === id))
	    ? teamOrderIds
	    : getOrderedTeamIds(eventDetails)
	  setSavingTeamDraftOrder(true)
	  try {
	    await axios.put(`${API_URL}/api/events/${selectedEvent.id}/team-draft-order`, { teamOrder: ordered })
	    setTeamOrderIds([])
	    fetchEventDetails(selectedEvent.id)
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to save team draft order'))
	  } finally {
	    setSavingTeamDraftOrder(false)
	  }
	}

	const handleUpdateEventStatus = async (eventId: string, newStatus: string) => {
	  try {
	    await axios.put(`${API_URL}/api/events/${eventId}`, { status: newStatus })
	    alert('Event status updated!')
	    fetchEventDetails(eventId)
	    fetchData()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to update event status'))
	  }
	}

	const handleInitializeDraft = async (eventId: string) => {
	  if (!confirm('Initialize the draft? This will set up the snake draft order.')) {
	    return
	  }

	  try {
	    await axios.post(`${API_URL}/api/draft/${eventId}/initialize`)
	    alert('Draft initialized successfully!')
	    fetchEventDetails(eventId)
	    fetchData()
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to initialize draft'))
	  }
	}

	const handleExportData = async (eventId: string) => {
	  setExporting(true)
	  try {
	    const response = await axios.get(`${API_URL}/api/stats/${eventId}/export`)
	    const dataStr = JSON.stringify(response.data, null, 2)
	    const dataBlob = new Blob([dataStr], { type: 'application/json' })
	    const url = URL.createObjectURL(dataBlob)
	    const link = document.createElement('a')
	    link.href = url
	    link.download = `event-${eventId}-export.json`
	    document.body.appendChild(link)
	    link.click()
	    document.body.removeChild(link)
	    URL.revokeObjectURL(url)
	    alert('Data exported successfully!')
	  } catch (err: unknown) {
	    alert(getErrorMessage(err, 'Failed to export data'))
	  } finally {
	    setExporting(false)
	  }
	}

	if (loading) {
	  return (
	    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	      <div className="text-lg text-gray-600 dark:text-gray-400">Loading...</div>
	    </div>
	  )
	}

	return (
	  <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
	    <AppHeader backLink="/" title="Admin Dashboard" />

	    <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
	      <div className="px-4 py-6 sm:px-0">
	        <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50 rounded-lg">
	          <div className="border-b border-gray-200 dark:border-gray-700">
	            <nav className="flex -mb-px">
	              <button
	                onClick={handleTabUsers}
	                className={`py-4 px-6 text-sm font-medium ${
	                  activeTab === 'users'
	                    ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
	                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
	                }`}
	              >
	                Users
	              </button>
	              <button
	                onClick={handleTabEvents}
	                className={`py-4 px-6 text-sm font-medium ${
	                  activeTab === 'events'
	                    ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
	                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
	                }`}
	              >
	                Events
	              </button>
	              <button
	                onClick={handleTabCreateEvent}
	                className={`py-4 px-6 text-sm font-medium ${
	                  activeTab === 'create-event'
	                    ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
	                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
	                }`}
	              >
	                Create Event
	              </button>
	              <button
	                onClick={handleTabEventManagement}
	                className={`py-4 px-6 text-sm font-medium ${
	                  activeTab === 'event-management'
	                    ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
	                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
	                }`}
	              >
	                Manage Event
	              </button>
	            </nav>
	          </div>

	          <div className="p-6">
	            {activeTab === 'users' && (
	              <div>
	                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">User Management</h2>
	                <div className="overflow-x-auto">
	                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
	                    <thead className="bg-gray-50 dark:bg-gray-700/50">
	                      <tr>
	                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                          Discord Username
	                        </th>
	                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                          Discord ID
	                        </th>
	                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                          Role
	                        </th>
	                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                          Created
	                        </th>
	                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
	                          Actions
	                        </th>
	                      </tr>
	                    </thead>
	                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
	                      {users.map((u) => (
	                        <tr key={u.id}>
	                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
	                            {u.discordUsername}
	                          </td>
	                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
	                            {u.discordId}
	                          </td>
	                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
	                            {u.role}
	                          </td>
	                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
	                            {new Date(u.createdAt).toLocaleDateString()}
	                          </td>
	                          <td className="px-6 py-4 whitespace-nowrap text-sm">
	                            <select
	                              value={u.role}
	                              onChange={(e) => updateUserRole(u.id, e.target.value)}
	                              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                            >
	                              <option value="USER">User</option>
	                              <option value="ADMIN">Admin</option>
	                            </select>
	                          </td>
	                        </tr>
	                      ))}
	                    </tbody>
	                  </table>
	                </div>
	              </div>
	            )}

	            {activeTab === 'events' && (
	              <div>
	                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Events</h2>
	                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
	                  {events.map((event) => (
	                    <Link
	                      key={event.id}
	                      to={`/event/${event.eventCode}`}
	                      className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
	                    >
	                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{event.name}</h3>
	                      <div className="text-sm text-gray-600 dark:text-gray-400">
	                        <p>Code: {event.eventCode}</p>
	                        <p>Status: {event.status}</p>
	                        <p>Players: {event._count.players}</p>
	                        <p>Teams: {event._count.teams}</p>
	                        <p>Predictions: {event._count.submissions}</p>
	                      </div>
	                    </Link>
	                  ))}
	                </div>
	              </div>
	            )}

	            {activeTab === 'event-management' && (
	              <div>
	                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Event Management</h2>
	                
	                {/* Event Selection */}
	                <div className="mb-6">
	                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
	                    Select Event
	                  </label>
	                  <select
	                    value={selectedEvent?.id || ''}
	                    onChange={(e) => {
	                      const event = events.find(ev => ev.id === e.target.value)
	                      setSelectedEvent(event || null)
	                      if (event) {
	                        fetchEventDetails(event.id)
	                      }
	                    }}
	                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                  >
	                    <option value="">-- Select an event --</option>
	                    {events.map((event) => (
	                      <option key={event.id} value={event.id}>
	                        {event.name} ({event.eventCode})
	                      </option>
	                    ))}
	                  </select>
	                </div>

	                {selectedEvent && (
	                  <div className="space-y-6">
	                    {/* Event Status Control */}
	                    {eventDetails && (
	                      <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 rounded-lg">
	                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Event Status</h3>
	                        <div className="flex items-center gap-4">
	                          <span className="text-sm text-gray-600 dark:text-gray-400">Current Status: <strong className="text-gray-900 dark:text-gray-100">{eventDetails.status}</strong></span>
	                          <select
	                            value={eventDetails.status}
	                            onChange={(e) => handleUpdateEventStatus(selectedEvent.id, e.target.value)}
	                            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                          >
	                            <option value="PLANNED">Planned</option>
	                            <option value="OPEN">Open</option>
	                            <option value="DRAFTING">Drafting</option>
	                            <option value="PAUSED">Paused</option>
	                            <option value="COMPLETED">Completed</option>
	                            <option value="CLOSED">Closed</option>
	                          </select>
	                        </div>
	                        {!eventDetails.draftOrder && eventDetails.status === 'OPEN' && (
	                          <button
	                            onClick={handleInitDraftClick}
	                            className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
	                          >
	                            Initialize Draft
	                          </button>
	                        )}
	                        {eventDetails.draftOrder && (
	                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
	                            Draft initialized - Round {eventDetails.draftOrder.currentRound}, Pick {eventDetails.draftOrder.currentPick + 1}
	                          </p>
	                        )}
	                      </div>
	                    )}

	                    {/* Team draft order (1st, 2nd, ... to draft). Editable until Initialize; drag to reorder. */}
	                    {eventDetails && eventDetails.teams && eventDetails.teams.length > 0 && !eventDetails.draftOrder && (
	                      <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 rounded-lg">
	                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Team draft order</h3>
	                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
	                          Drag teams to set which picks 1st, 2nd, 3rd, etc. in round 1. Locked once you Initialize Draft.
	                        </p>
	                        {(() => {
	                          const teams = eventDetails.teams
	                          const tlen = teams.length
	                          const displayOrder =
	                            teamOrderIds.length === tlen && teamOrderIds.every((id) => teams.some((t) => t.id === id))
	                              ? teamOrderIds
	                              : getOrderedTeamIds(eventDetails)
	                          const teamById = (id: string) => teams.find((t) => t.id === id)
	                          const handleTeamOrderDragEnd = (e: DragEndEvent) => {
	                            const { active, over } = e
	                            if (!over || active.id === over.id) return
	                            const o = displayOrder.indexOf(String(active.id))
	                            const n = displayOrder.indexOf(String(over.id))
	                            if (o === -1 || n === -1) return
	                            setTeamOrderIds(arrayMove(displayOrder, o, n))
	                          }
	                          return (
	                            <div className="space-y-2">
	                              <DndContext
	                                sensors={teamOrderSensors}
	                                collisionDetection={closestCenter}
	                                onDragEnd={handleTeamOrderDragEnd}
	                              >
	                                <SortableContext items={displayOrder} strategy={verticalListSortingStrategy}>
	                                  {displayOrder.map((id, i) => (
	                                    <SortableTeamRow key={id} id={id} team={teamById(id)} index={i + 1} />
	                                  ))}
	                                </SortableContext>
	                              </DndContext>
	                              <button
	                                type="button"
	                                onClick={handleSaveTeamDraftOrder}
	                                disabled={savingTeamDraftOrder}
	                                className="mt-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
	                              >
	                                {savingTeamDraftOrder ? 'Saving...' : 'Save team draft order'}
	                              </button>
	                            </div>
	                          )
	                        })()}
	                      </div>
	                    )}

	                    {/* Team Management */}
	                    <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 rounded-lg">
	                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Manage Teams</h3>
	                      {eventDetails && (
	                        <div className="mb-4 space-y-4">
	                          <p className="text-sm text-gray-600 dark:text-gray-400">Current Teams ({eventDetails.teams?.length || 0}):</p>
	                          {eventDetails.teams?.map((team: EventDetailsTeam) => (
	                            <div key={team.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
	                              <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">{team.name}</p>
	                              <div className="space-y-2">
	                                {team.captains?.map((cap: EventDetailsCaptain) => (
	                                  <div key={cap.id} className="flex items-center justify-between gap-2 py-1 text-sm text-gray-900 dark:text-gray-100">
	                                    <span>{cap.player?.name} @{cap.discordUsername}</span>
	                                    <button
	                                      type="button"
	                                      onClick={handleRemoveCaptainFor(team.id, cap.id)}
	                                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
	                                    >
	                                      Remove
	                                    </button>
	                                  </div>
	                                ))}
	                              </div>
	                              <div className="mt-2 flex flex-wrap gap-2 items-end">
	                                <div>
	                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Player</label>
	                                  <select
	                                    value={addCaptainByTeam[team.id]?.playerId || ''}
	                                    onChange={(e) =>
	                                      setAddCaptainByTeam((prev) => ({
	                                        ...prev,
	                                        [team.id]: { ...(prev[team.id] || { playerId: '', discordUsername: '' }), playerId: e.target.value },
	                                      }))
	                                    }
	                                    className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                                  >
	                                    <option value="">Select</option>
	                                    {(eventDetails.players || []).map((p: EventDetailsPlayer) => (
	                                      <option key={p.id} value={p.id}>{p.name}</option>
	                                    ))}
	                                  </select>
	                                </div>
	                                <div>
	                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Discord username</label>
	                                  <input
	                                    type="text"
	                                    value={addCaptainByTeam[team.id]?.discordUsername || ''}
	                                    onChange={(e) =>
	                                      setAddCaptainByTeam((prev) => ({
	                                        ...prev,
	                                        [team.id]: { ...(prev[team.id] || { playerId: '', discordUsername: '' }), discordUsername: e.target.value },
	                                      }))
	                                    }
	                                    placeholder="username"
	                                    className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm w-36 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                                  />
	                                </div>
								<button
								  type="button"
								  onClick={handleAddCaptainFor(team.id)}
								  disabled={
								    addingCaptainToTeamId === team.id ||
								    !addCaptainByTeam[team.id]?.playerId ||
								    !addCaptainByTeam[team.id]?.discordUsername?.trim()
								  }
								  className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
								>
	                                  {addingCaptainToTeamId === team.id ? 'Adding...' : 'Add Captain'}
	                                </button>
	                              </div>
	                            </div>
	                          ))}
	                        </div>
	                      )}
	                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Create new team (add captains now or later):</p>
	                      <form
	                        onSubmit={createTeamForm.handleSubmit(handleCreateTeamSubmit)}
	                        className="space-y-3"
	                      >
	                        <div className="flex gap-2">
	                          <input
	                            type="text"
	                            placeholder="Team name *"
	                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                            {...createTeamForm.register('name')}
	                          />
	                          <button
	                            type="submit"
	                            disabled={creatingTeam}
	                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
	                          >
	                            {creatingTeam ? 'Adding...' : 'Add Team'}
	                          </button>
	                        </div>
	                        {createTeamForm.formState.errors.name && (
	                          <p className="text-sm text-red-600 dark:text-red-400">{createTeamForm.formState.errors.name.message}</p>
	                        )}
	                        <div>
	                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Captains (player + Discord username; must already be in this event):</p>
	                          {createTeamCaptains.fields.map((field, i) => (
	                            <div key={field.id} className="flex gap-2 items-center mb-2">
	                              <select
	                                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm flex-1 max-w-[12rem] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                                {...createTeamForm.register(`captains.${i}.playerId`)}
	                              >
	                                <option value="">Player</option>
	                                {(eventDetails?.players || []).map((p: EventDetailsPlayer) => (
	                                  <option key={p.id} value={p.id}>{p.name}</option>
	                                ))}
	                              </select>
	                              <input
	                                type="text"
	                                placeholder="Discord username"
	                                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm flex-1 max-w-[10rem] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                                {...createTeamForm.register(`captains.${i}.discordUsername`)}
	                              />
	                              <button
	                                type="button"
	                                onClick={handleRemoveCaptainRow(i)}
	                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
	                              >
	                                Remove
	                              </button>
	                            </div>
	                          ))}
	                          <button
	                            type="button"
	                            onClick={handleAppendCaptainRow}
	                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
	                          >
	                            + Add captain
	                          </button>
	                        </div>
	                      </form>
	                    </div>

	                    {/* Bulk Player Import */}
	                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
	                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
	                        Bulk Import Players
	                      </h3>
	                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
	                        Paste player names, one per line. Optional format: Name | Team | Notes
	                      </p>
	                      <form
	                        onSubmit={bulkImportForm.handleSubmit((data) =>
	                          handleBulkImportSubmit(data, selectedEvent.id)
	                        )}
	                      >
	                        <textarea
	                          placeholder="Player 1&#10;Player 2 | Team A&#10;Player 3 | Team B | Notes here"
	                          className="w-full h-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                          {...bulkImportForm.register('text')}
	                        />
	                        {bulkImportForm.formState.errors.text && (
	                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{bulkImportForm.formState.errors.text.message}</p>
	                        )}
	                        <button
	                          type="submit"
	                          disabled={importing}
	                          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
	                        >
	                          {importing ? 'Importing...' : 'Import Players'}
	                        </button>
	                      </form>
	                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
	                        This will replace all existing players for this event.
	                      </p>
	                    </div>

	                    {/* Export Data */}
	                    <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 rounded-lg">
	                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Export Event Data</h3>
	                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
	                        Download all event data including players, teams, picks, and predictions as JSON.
	                      </p>
	                      <button
	                        onClick={handleExportClick}
	                        disabled={exporting}
	                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
	                      >
	                        {exporting ? 'Exporting...' : 'Export Data'}
	                      </button>
	                    </div>

	                    {/* Event Info */}
	                    <div className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 rounded-lg">
	                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Event Info</h3>
	                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-700 dark:text-gray-300">
	                        <div>
	                          <span className="font-medium">Name:</span> {selectedEvent.name}
	                        </div>
	                        <div>
	                          <span className="font-medium">Code:</span> {selectedEvent.eventCode}
	                        </div>
	                        <div>
	                          <span className="font-medium">Status:</span> {selectedEvent.status}
	                        </div>
	                        <div>
	                          <span className="font-medium">Players:</span> {selectedEvent._count.players}
	                        </div>
	                        <div>
	                          <span className="font-medium">Teams:</span> {selectedEvent._count.teams}
	                        </div>
	                        <div>
	                          <span className="font-medium">Predictions:</span> {selectedEvent._count.submissions}
	                        </div>
	                      </div>
	                      <div className="mt-4">
	                        <Link
	                          to={`/event/${selectedEvent.eventCode}`}
	                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
	                        >
	                          View Event Page →
	                        </Link>
	                      </div>
	                    </div>
	                  </div>
	                )}
	              </div>
	            )}

	            {activeTab === 'create-event' && (
	              <div>
	                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Create New Event</h2>
	                <form
	                  onSubmit={createEventForm.handleSubmit(handleCreateEventSubmit)}
	                  className="max-w-2xl space-y-4"
	                >
	                  <div>
	                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                      Event Name *
	                    </label>
	                    <input
	                      type="text"
	                      placeholder="My Awesome Draft Event"
	                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                      {...createEventForm.register('name')}
	                    />
	                    {createEventForm.formState.errors.name && (
	                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">{createEventForm.formState.errors.name.message}</p>
	                    )}
	                  </div>

	                  <div>
	                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                      Event Code * (3-20 characters, unique)
	                    </label>
	                    <input
	                      type="text"
	                      placeholder="DRAFT2024"
	                      maxLength={20}
	                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                      {...createEventForm.register('eventCode')}
	                    />
	                    {createEventForm.formState.errors.eventCode && (
	                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">{createEventForm.formState.errors.eventCode.message}</p>
	                    )}
	                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
	                      Short identifier for the event URL (e.g. /event/MYCODE). Letters and numbers only.
	                    </p>
	                  </div>

	                  <div>
	                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                      Description (optional)
	                    </label>
	                    <textarea
	                      placeholder="Event description and rules..."
	                      rows={3}
	                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
	                      {...createEventForm.register('description')}
	                    />
	                  </div>

	                  <div className="grid grid-cols-2 gap-4">
	                    <div>
	                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                        Draft Deadline (optional)
	                      </label>
	                      <input
	                        type="datetime-local"
	                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                        {...createEventForm.register('draftDeadline')}
	                      />
	                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
	                        When predictions lock
	                      </p>
	                    </div>

	                    <div>
	                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
	                        Draft Start Time (optional)
	                      </label>
	                      <input
	                        type="datetime-local"
	                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
	                        {...createEventForm.register('draftStartTime')}
	                      />
	                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
	                        When live draft begins
	                      </p>
	                    </div>
	                  </div>

	                  <div className="pt-4">
	                    <button
	                      type="submit"
	                      disabled={creatingEvent}
	                      className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
	                    >
	                      {creatingEvent ? 'Creating...' : 'Create Event'}
	                    </button>
	                  </div>
	                </form>
	              </div>
	            )}
	          </div>
	        </div>
	      </div>
	    </main>
	  </div>
	)
}

export default AdminDashboard
