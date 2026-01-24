import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { DarkModeToggle } from '../components/DarkModeToggle';

interface Event {
  id: string;
  name: string;
  description: string | null;
  eventCode: string;
  status: string;
  draftDeadline: string | null;
  draftStartTime: string | null;
  _count: {
    submissions: number;
    players: number;
    teams: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const Home = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bingo Fantasy Draft</h1>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <DarkModeToggle />
              {user ? (
                <>
                  <span className="text-gray-700 dark:text-gray-300">Welcome, {user.discordUsername}</span>
                  {user.role === 'ADMIN' && (
                    <Link
                      to="/admin"
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      localStorage.removeItem('token');
                      window.location.href = '/login';
                    }}
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link to="/login" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">All Events</h2>
            {loading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No events found</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/event/${event.eventCode}`}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6 hover:shadow-lg dark:hover:shadow-gray-900/70 transition-shadow"
                  >
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {event.name}
                    </h3>
                    {event.description && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{event.description}</p>
                    )}
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                      <span>Code: {event.eventCode}</span>
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                        {event.status}
                      </span>
                    </div>
                    <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                      <p>Players: {event._count.players}</p>
                      <p>Teams: {event._count.teams}</p>
                      <p>Predictions: {event._count.submissions}</p>
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
