import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: string;
  discordId: string;
  discordUsername: string;
  role: string;
  createdAt: string;
}

interface Event {
  id: string;
  name: string;
  eventCode: string;
  status: string;
  _count: {
    submissions: number;
    players: number;
    teams: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function SortableTeamRow({
  id,
  team,
  index,
}: {
  id: string;
  team: { id: string; name: string } | undefined;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  if (!team) return null;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 py-1.5 px-2 rounded border border-gray-200 bg-gray-50 ${isDragging ? 'opacity-70 shadow-lg z-10' : ''} cursor-grab active:cursor-grabbing`}
      {...attributes}
      {...listeners}
    >
      <span className="text-gray-400 select-none" aria-hidden>⋮⋮</span>
      <span className="text-sm font-medium text-gray-500 w-6">#{index}</span>
      <span className="flex-1 font-medium text-gray-900">{team.name}</span>
    </div>
  );
}

const AdminDashboard = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'events' | 'event-management' | 'create-event'>('users');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [bulkPlayerText, setBulkPlayerText] = useState('');
  const [importing, setImporting] = useState(false);
  
  // Create event form state
  const [newEventName, setNewEventName] = useState('');
  const [newEventCode, setNewEventCode] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventDraftDeadline, setNewEventDraftDeadline] = useState('');
  const [newEventDraftStartTime, setNewEventDraftStartTime] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  
  // Team management state
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCaptains, setNewTeamCaptains] = useState<Array<{ playerId: string; discordUsername: string }>>([]);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [addCaptainByTeam, setAddCaptainByTeam] = useState<Record<string, { playerId: string; discordUsername: string }>>({});
  const [addingCaptainToTeamId, setAddingCaptainToTeamId] = useState<string | null>(null);
  const [teamOrderIds, setTeamOrderIds] = useState<string[]>([]);
  const [savingTeamDraftOrder, setSavingTeamDraftOrder] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  const teamOrderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function getOrderedTeamIds(ed: any): string[] {
    if (!ed?.teams?.length) return [];
    const ids = ed.teams.map((t: any) => t.id);
    if (ed.teamDraftOrder?.length === ids.length && ids.every((id: string) => ed.teamDraftOrder.includes(id)))
      return ed.teamDraftOrder;
    return ed.teams.slice().sort((a: any, b: any) => a.name.localeCompare(b.name)).map((t: any) => t.id);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersResponse, eventsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/users`),
        axios.get(`${API_URL}/api/events`),
      ]);
      setUsers(usersResponse.data.users);
      setEvents(eventsResponse.data.events);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = async (eventId: string) => {
    if (!bulkPlayerText.trim()) {
      alert('Please enter player names');
      return;
    }

    setImporting(true);
    try {
      await axios.post(`${API_URL}/api/events/${eventId}/players/bulk-import`, {
        text: bulkPlayerText,
      });
      alert('Players imported successfully!');
      setBulkPlayerText('');
      fetchEventDetails(eventId);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to import players');
    } finally {
      setImporting(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      await axios.put(`${API_URL}/api/users/${userId}/role`, { role: newRole });
      fetchData();
    } catch (error) {
      alert('Failed to update user role');
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim() || !newEventCode.trim()) {
      alert('Event name and code are required');
      return;
    }

    setCreatingEvent(true);
    try {
      const eventData: any = {
        name: newEventName,
        eventCode: newEventCode,
      };
      
      if (newEventDescription.trim()) {
        eventData.description = newEventDescription;
      }
      
      if (newEventDraftDeadline) {
        eventData.draftDeadline = new Date(newEventDraftDeadline).toISOString();
      }
      
      if (newEventDraftStartTime) {
        eventData.draftStartTime = new Date(newEventDraftStartTime).toISOString();
      }

      await axios.post(`${API_URL}/api/events`, eventData);
      alert('Event created successfully!');
      setNewEventName('');
      setNewEventCode('');
      setNewEventDescription('');
      setNewEventDraftDeadline('');
      setNewEventDraftStartTime('');
      fetchData();
      setActiveTab('events');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create event');
    } finally {
      setCreatingEvent(false);
    }
  };

  const fetchEventDetails = async (eventId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/events/${eventId}`);
      setEventDetails(response.data.event);
    } catch (error) {
      console.error('Failed to fetch event details:', error);
    }
  };

  const handleCreateTeam = async () => {
    if (!selectedEvent || !newTeamName.trim()) {
      alert('Please select an event and enter a team name');
      return;
    }

    const captains = newTeamCaptains.filter((c) => c.playerId && c.discordUsername.trim());
    setCreatingTeam(true);
    try {
      await axios.post(`${API_URL}/api/events/${selectedEvent.id}/teams`, {
        name: newTeamName,
        captains: captains.map((c) => ({ playerId: c.playerId, discordUsername: c.discordUsername.trim() })),
      });
      alert('Team created successfully!');
      setNewTeamName('');
      setNewTeamCaptains([]);
      fetchEventDetails(selectedEvent.id);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleAddCaptain = async (teamId: string) => {
    const form = addCaptainByTeam[teamId];
    if (!form?.playerId || !form.discordUsername.trim()) {
      alert('Select a player and enter Discord username');
      return;
    }
    if (!selectedEvent) return;
    setAddingCaptainToTeamId(teamId);
    try {
      await axios.post(`${API_URL}/api/events/${selectedEvent.id}/teams/${teamId}/captains`, {
        playerId: form.playerId,
        discordUsername: form.discordUsername.trim(),
      });
      setAddCaptainByTeam((prev) => ({ ...prev, [teamId]: { playerId: '', discordUsername: '' } }));
      fetchEventDetails(selectedEvent.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to add captain');
    } finally {
      setAddingCaptainToTeamId(null);
    }
  };

  const handleRemoveCaptain = async (teamId: string, captainId: string) => {
    if (!selectedEvent) return;
    if (!confirm('Remove this captain?')) return;
    try {
      await axios.delete(`${API_URL}/api/events/${selectedEvent.id}/teams/${teamId}/captains/${captainId}`);
      fetchEventDetails(selectedEvent.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to remove captain');
    }
  };

  const handleSaveTeamDraftOrder = async () => {
    if (!selectedEvent || !eventDetails?.teams?.length) return;
    const tlen = eventDetails.teams.length;
    const ordered = teamOrderIds.length === tlen && teamOrderIds.every((id) => eventDetails.teams.some((t: any) => t.id === id))
      ? teamOrderIds
      : getOrderedTeamIds(eventDetails);
    setSavingTeamDraftOrder(true);
    try {
      await axios.put(`${API_URL}/api/events/${selectedEvent.id}/team-draft-order`, { teamOrder: ordered });
      setTeamOrderIds([]);
      fetchEventDetails(selectedEvent.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save team draft order');
    } finally {
      setSavingTeamDraftOrder(false);
    }
  };

  const handleUpdateEventStatus = async (eventId: string, newStatus: string) => {
    try {
      await axios.put(`${API_URL}/api/events/${eventId}`, { status: newStatus });
      alert('Event status updated!');
      fetchEventDetails(eventId);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update event status');
    }
  };

  const handleInitializeDraft = async (eventId: string) => {
    if (!confirm('Initialize the draft? This will set up the snake draft order.')) {
      return;
    }

    try {
      await axios.post(`${API_URL}/api/draft/${eventId}/initialize`);
      alert('Draft initialized successfully!');
      fetchEventDetails(eventId);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to initialize draft');
    }
  };

  const handleExportData = async (eventId: string) => {
    setExporting(true);
    try {
      const response = await axios.get(`${API_URL}/api/stats/${eventId}/export`);
      const dataStr = JSON.stringify(response.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `event-${eventId}-export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert('Data exported successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-gray-600 hover:text-gray-800 mr-4">
                ← Back
              </Link>
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center">
              <span className="text-gray-700">{user?.discordUsername}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`py-4 px-6 text-sm font-medium ${
                    activeTab === 'users'
                      ? 'border-b-2 border-indigo-500 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Users
                </button>
                <button
                  onClick={() => setActiveTab('events')}
                  className={`py-4 px-6 text-sm font-medium ${
                    activeTab === 'events'
                      ? 'border-b-2 border-indigo-500 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Events
                </button>
                <button
                  onClick={() => setActiveTab('create-event')}
                  className={`py-4 px-6 text-sm font-medium ${
                    activeTab === 'create-event'
                      ? 'border-b-2 border-indigo-500 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Create Event
                </button>
                <button
                  onClick={() => setActiveTab('event-management')}
                  className={`py-4 px-6 text-sm font-medium ${
                    activeTab === 'event-management'
                      ? 'border-b-2 border-indigo-500 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Manage Event
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'users' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">User Management</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Discord Username
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Discord ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {u.discordUsername}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {u.discordId}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {u.role}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <select
                                value={u.role}
                                onChange={(e) => updateUserRole(u.id, e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1"
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
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Events</h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {events.map((event) => (
                      <Link
                        key={event.id}
                        to={`/event/${event.eventCode}`}
                        className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                      >
                        <h3 className="font-semibold text-gray-900 mb-2">{event.name}</h3>
                        <div className="text-sm text-gray-600">
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
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Event Management</h2>
                  
                  {/* Event Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Event
                    </label>
                    <select
                      value={selectedEvent?.id || ''}
                      onChange={(e) => {
                        const event = events.find(ev => ev.id === e.target.value);
                        setSelectedEvent(event || null);
                        if (event) {
                          fetchEventDetails(event.id);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        <div className="bg-white border border-gray-200 p-4 rounded-lg">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Event Status</h3>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">Current Status: <strong>{eventDetails.status}</strong></span>
                            <select
                              value={eventDetails.status}
                              onChange={(e) => handleUpdateEventStatus(selectedEvent.id, e.target.value)}
                              className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                              onClick={() => handleInitializeDraft(selectedEvent.id)}
                              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                            >
                              Initialize Draft
                            </button>
                          )}
                          {eventDetails.draftOrder && (
                            <p className="mt-2 text-sm text-gray-600">
                              Draft initialized - Round {eventDetails.draftOrder.currentRound}, Pick {eventDetails.draftOrder.currentPick + 1}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Team draft order (1st, 2nd, … to draft) — editable until Initialize; drag to reorder */}
                      {eventDetails && eventDetails.teams?.length > 0 && !eventDetails.draftOrder && (
                        <div className="bg-white border border-gray-200 p-4 rounded-lg">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">Team draft order</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Drag teams to set which picks 1st, 2nd, 3rd, etc. in round 1. Locked once you Initialize Draft.
                          </p>
                          {(() => {
                            const tlen = eventDetails.teams.length;
                            const displayOrder =
                              teamOrderIds.length === tlen &&
                              teamOrderIds.every((id) => eventDetails.teams.some((t: any) => t.id === id))
                                ? teamOrderIds
                                : getOrderedTeamIds(eventDetails);
                            const teamById = (id: string) => eventDetails.teams.find((t: any) => t.id === id);
                            const handleTeamOrderDragEnd = (e: { active: { id: string }; over: { id: string } | null }) => {
                              const { active, over } = e;
                              if (!over || active.id === over.id) return;
                              const o = displayOrder.indexOf(active.id as string);
                              const n = displayOrder.indexOf(over.id as string);
                              if (o === -1 || n === -1) return;
                              setTeamOrderIds(arrayMove(displayOrder, o, n));
                            };
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
                            );
                          })()}
                        </div>
                      )}

                      {/* Team Management */}
                      <div className="bg-white border border-gray-200 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Manage Teams</h3>
                        {eventDetails && (
                          <div className="mb-4 space-y-4">
                            <p className="text-sm text-gray-600">Current Teams ({eventDetails.teams?.length || 0}):</p>
                            {eventDetails.teams?.map((team: any) => (
                              <div key={team.id} className="border border-gray-200 rounded-lg p-3">
                                <p className="font-medium text-gray-900 mb-2">{team.name}</p>
                                <div className="space-y-2">
                                  {team.captains?.map((cap: any) => (
                                    <div key={cap.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                                      <span>{cap.player?.name} — @{cap.discordUsername}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveCaptain(team.id, cap.id)}
                                        className="text-red-600 hover:text-red-800"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 items-end">
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-0.5">Player</label>
                                    <select
                                      value={addCaptainByTeam[team.id]?.playerId || ''}
                                      onChange={(e) =>
                                        setAddCaptainByTeam((prev) => ({
                                          ...prev,
                                          [team.id]: { ...(prev[team.id] || { playerId: '', discordUsername: '' }), playerId: e.target.value },
                                        }))
                                      }
                                      className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                                    >
                                      <option value="">— Select —</option>
                                      {(eventDetails.players || []).map((p: any) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-0.5">Discord username</label>
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
                                      className="px-2 py-1.5 border border-gray-300 rounded text-sm w-36"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddCaptain(team.id)}
                                    disabled={addingCaptainToTeamId === team.id || !addCaptainByTeam[team.id]?.playerId || !addCaptainByTeam[team.id]?.discordUsername?.trim()}
                                    className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    {addingCaptainToTeamId === team.id ? 'Adding...' : 'Add Captain'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-gray-600 mb-2">Create new team (add captains now or later):</p>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newTeamName}
                              onChange={(e) => setNewTeamName(e.target.value)}
                              placeholder="Team name *"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              onKeyPress={(e) => e.key === 'Enter' && handleCreateTeam()}
                            />
                            <button
                              onClick={handleCreateTeam}
                              disabled={creatingTeam || !newTeamName.trim()}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {creatingTeam ? 'Adding...' : 'Add Team'}
                            </button>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Captains (player + Discord username; must already be in this event):</p>
                            {newTeamCaptains.map((c, i) => (
                              <div key={i} className="flex gap-2 items-center mb-2">
                                <select
                                  value={c.playerId}
                                  onChange={(e) =>
                                    setNewTeamCaptains((prev) => {
                                      const n = [...prev];
                                      n[i] = { ...n[i], playerId: e.target.value };
                                      return n;
                                    })
                                  }
                                  className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 max-w-[12rem]"
                                >
                                  <option value="">— Player —</option>
                                  {(eventDetails?.players || []).map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={c.discordUsername}
                                  onChange={(e) =>
                                    setNewTeamCaptains((prev) => {
                                      const n = [...prev];
                                      n[i] = { ...n[i], discordUsername: e.target.value };
                                      return n;
                                    })
                                  }
                                  placeholder="Discord username"
                                  className="px-2 py-1.5 border border-gray-300 rounded text-sm flex-1 max-w-[10rem]"
                                />
                                <button
                                  type="button"
                                  onClick={() => setNewTeamCaptains((prev) => prev.filter((_, j) => j !== i))}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setNewTeamCaptains((prev) => [...prev, { playerId: '', discordUsername: '' }])}
                              className="text-sm text-indigo-600 hover:text-indigo-800"
                            >
                              + Add captain
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Bulk Player Import */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Bulk Import Players
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Paste player names, one per line. Optional format: Name | Team | Notes
                        </p>
                        <textarea
                          value={bulkPlayerText}
                          onChange={(e) => setBulkPlayerText(e.target.value)}
                          placeholder="Player 1&#10;Player 2 | Team A&#10;Player 3 | Team B | Notes here"
                          className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                        />
                        <button
                          onClick={() => handleBulkImport(selectedEvent.id)}
                          disabled={importing || !bulkPlayerText.trim()}
                          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {importing ? 'Importing...' : 'Import Players'}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">
                          This will replace all existing players for this event.
                        </p>
                      </div>

                      {/* Export Data */}
                      <div className="bg-white border border-gray-200 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Export Event Data</h3>
                        <p className="text-sm text-gray-600 mb-3">
                          Download all event data including players, teams, picks, and predictions as JSON.
                        </p>
                        <button
                          onClick={() => handleExportData(selectedEvent.id)}
                          disabled={exporting}
                          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                        >
                          {exporting ? 'Exporting...' : 'Export Data'}
                        </button>
                      </div>

                      {/* Event Info */}
                      <div className="bg-white border border-gray-200 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Info</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
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
                            className="text-indigo-600 hover:text-indigo-800"
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
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Event</h2>
                  <div className="max-w-2xl space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Event Name *
                      </label>
                      <input
                        type="text"
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        placeholder="My Awesome Draft Event"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Event Code * (3-20 characters, unique)
                      </label>
                      <input
                        type="text"
                        value={newEventCode}
                        onChange={(e) => setNewEventCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="DRAFT2024"
                        maxLength={20}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Short identifier for the event URL (e.g. /event/MYCODE). Letters and numbers only.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        value={newEventDescription}
                        onChange={(e) => setNewEventDescription(e.target.value)}
                        placeholder="Event description and rules..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Draft Deadline (optional)
                        </label>
                        <input
                          type="datetime-local"
                          value={newEventDraftDeadline}
                          onChange={(e) => setNewEventDraftDeadline(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          When predictions lock
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Draft Start Time (optional)
                        </label>
                        <input
                          type="datetime-local"
                          value={newEventDraftStartTime}
                          onChange={(e) => setNewEventDraftStartTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          When live draft begins
                        </p>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        onClick={handleCreateEvent}
                        disabled={creatingEvent || !newEventName.trim() || !newEventCode.trim()}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {creatingEvent ? 'Creating...' : 'Create Event'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
