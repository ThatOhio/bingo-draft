import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
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
    participants: number;
    players: number;
    teams: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [eventDetails, setEventDetails] = useState<any>(null);
  
  // Export state
  const [exporting, setExporting] = useState(false);

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

    setCreatingTeam(true);
    try {
      await axios.post(`${API_URL}/api/events/${selectedEvent.id}/teams`, {
        name: newTeamName,
      });
      alert('Team created successfully!');
      setNewTeamName('');
      fetchEventDetails(selectedEvent.id);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
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
                                <option value="PARTICIPANT">Participant</option>
                                <option value="CAPTAIN">Captain</option>
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
                          <p>Participants: {event._count.participants}</p>
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

                      {/* Team Management */}
                      <div className="bg-white border border-gray-200 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Manage Teams</h3>
                        {eventDetails && (
                          <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">Current Teams ({eventDetails.teams?.length || 0}):</p>
                            <div className="flex flex-wrap gap-2">
                              {eventDetails.teams?.map((team: any) => (
                                <span key={team.id} className="px-3 py-1 bg-gray-100 rounded-md text-sm">
                                  {team.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            placeholder="Team name"
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
                      </div>

                      {/* Bulk Player Import */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Bulk Import Players
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Paste player names, one per line. Optional format: Name | Position | Team | Notes
                        </p>
                        <textarea
                          value={bulkPlayerText}
                          onChange={(e) => setBulkPlayerText(e.target.value)}
                          placeholder="Player 1&#10;Player 2 | QB | Team A&#10;Player 3 | RB | Team B | Notes here"
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
                            <span className="font-medium">Participants:</span> {selectedEvent._count.participants}
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
                        This code will be used to join the event. Only letters and numbers.
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
