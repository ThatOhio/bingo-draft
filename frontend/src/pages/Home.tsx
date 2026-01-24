import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface Event {
  id: string;
  name: string;
  description: string | null;
  eventCode: string;
  status: string;
  draftDeadline: string | null;
  draftStartTime: string | null;
  captain: {
    id: string;
    discordUsername: string;
  };
  _count: {
    participants: number;
    players: number;
    teams: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const Home = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventCode, setEventCode] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/events`);
      setEvents(response.data.events);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinEvent = () => {
    if (eventCode.trim()) {
      window.location.href = `/event/${eventCode.trim()}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Bingo Fantasy Draft</h1>
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-gray-700">Welcome, {user.discordUsername}</span>
                  {user.role === 'ADMIN' && (
                    <Link
                      to="/admin"
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      localStorage.removeItem('token');
                      window.location.href = '/login';
                    }}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-gray-600 hover:text-gray-800">
                    Login
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Join an Event</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter event code"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinEvent()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleJoinEvent}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Join
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">All Events</h2>
            {loading ? (
              <div className="text-center py-8">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No events found</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/event/${event.eventCode}`}
                    className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
                  >
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {event.name}
                    </h3>
                    {event.description && (
                      <p className="text-gray-600 mb-4">{event.description}</p>
                    )}
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Code: {event.eventCode}</span>
                      <span className="px-2 py-1 bg-gray-100 rounded">
                        {event.status}
                      </span>
                    </div>
                    <div className="mt-4 text-sm text-gray-600">
                      <p>Players: {event._count.players}</p>
                      <p>Teams: {event._count.teams}</p>
                      <p>Participants: {event._count.participants}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
