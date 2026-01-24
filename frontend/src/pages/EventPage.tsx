import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  players: Array<{ id: string; name: string; team: string | null }>;
  teams: Array<{ id: string; name: string }>;
  _count: {
    participants: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const EventPage = () => {
  const { eventCode } = useParams<{ eventCode: string }>();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSubmission, setHasSubmission] = useState(false);

  useEffect(() => {
    if (eventCode) {
      fetchEvent();
      if (user) {
        checkSubmission();
      }
    }
  }, [eventCode, user]);

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

  const checkSubmission = async () => {
    if (!user || !eventCode) return;
    try {
      const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`);
      const eventId = eventResponse.data.event.id;
      const response = await axios.get(`${API_URL}/api/draft/${eventId}/my-submission`);
      setHasSubmission(!!response.data.submission);
    } catch (error) {
      // No submission yet
      setHasSubmission(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Event not found</div>
      </div>
    );
  }

  const isDeadlinePassed = event.draftDeadline
    ? new Date(event.draftDeadline) < new Date()
    : false;
  const canSubmit = !isDeadlinePassed && event.status !== 'DRAFTING' && event.status !== 'COMPLETED';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-gray-600 hover:text-gray-800 mr-4">
                ← Back
              </Link>
              <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
            </div>
            {user && (
              <div className="flex items-center space-x-4">
                <span className="text-gray-700">{user.discordUsername}</span>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Event Details</h2>
            {event.description && (
              <p className="text-gray-600 mb-4">{event.description}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-semibold">Status:</span>
                <span className="ml-2 px-2 py-1 bg-gray-100 rounded">{event.status}</span>
              </div>
              <div>
                <span className="font-semibold">Players:</span>
                <span className="ml-2">{event.players.length}</span>
              </div>
              <div>
                <span className="font-semibold">Teams:</span>
                <span className="ml-2">{event.teams.length}</span>
              </div>
              <div>
                <span className="font-semibold">Participants:</span>
                <span className="ml-2">{event._count.participants}</span>
              </div>
              {event.draftDeadline && (
                <div>
                  <span className="font-semibold">Deadline:</span>
                  <span className="ml-2">
                    {new Date(event.draftDeadline).toLocaleString()}
                  </span>
                </div>
              )}
              {event.draftStartTime && (
                <div>
                  <span className="font-semibold">Start Time:</span>
                  <span className="ml-2">
                    {new Date(event.draftStartTime).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {user && canSubmit && (
              <Link
                to={`/event/${eventCode}/submit`}
                className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {hasSubmission ? 'Edit your prediction' : 'Save your prediction'}
                </h3>
                <p className="text-gray-600">
                  {hasSubmission
                    ? 'Continue editing and save your prediction. You can save partial progress and come back later.'
                    : 'Create and save your prediction for how the draft will go. You can save partial progress and come back later.'}
                </p>
              </Link>
            )}

            {event.status === 'DRAFTING' || event.status === 'COMPLETED' ? (
              <>
                <Link
                  to={`/event/${eventCode}/draft`}
                  className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Live Draft</h3>
                  <p className="text-gray-600">
                    {event.status === 'COMPLETED'
                      ? 'View the completed draft results'
                      : 'Watch the live draft in progress'}
                  </p>
                </Link>
                <Link
                  to={`/event/${eventCode}/stats`}
                  className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Stats & Rankings</h3>
                  <p className="text-gray-600">
                    See how your predictions compare to the actual draft
                  </p>
                </Link>
              </>
            ) : (
              user && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Waiting for Draft
                  </h3>
                  <p className="text-gray-600">
                    The draft hasn't started yet. Check back later!
                  </p>
                </div>
              )
            )}
          </div>

          {!user && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800">
                <Link to={`/login?eventCode=${eventCode}`} className="font-semibold underline">
                  Sign in
                </Link>{' '}
                or{' '}
                <Link to={`/register?eventCode=${eventCode}`} className="font-semibold underline">
                  create an account
                </Link>{' '}
                to participate in this event.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EventPage;
