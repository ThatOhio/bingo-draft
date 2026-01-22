import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../contexts/AuthContext';

interface Player {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
}

interface SubmissionItem {
  playerId: string;
  position: number;
  player: Player;
}

interface Submission {
  id: string;
  submittedAt: string;
  locked: boolean;
  items: SubmissionItem[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function SortableItem({ player, index }: { player: Player; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: player.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-gray-300 rounded-md p-4 mb-2 cursor-move hover:shadow-md flex items-center justify-between"
    >
      <div className="flex items-center space-x-4">
        <span className="text-gray-500 font-semibold w-8">{index + 1}.</span>
        <div>
          <div className="font-medium text-gray-900">{player.name}</div>
          {(player.position || player.team) && (
            <div className="text-sm text-gray-500">
              {player.position && <span>{player.position}</span>}
              {player.position && player.team && <span> • </span>}
              {player.team && <span>{player.team}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="text-gray-400">⋮⋮</div>
    </div>
  );
}

const DraftSubmission = () => {
  const { eventCode } = useParams<{ eventCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [orderedPlayers, setOrderedPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (eventCode) {
      fetchEventData();
    }
  }, [eventCode]);

  const fetchEventData = async () => {
    try {
      const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`);
      const event = eventResponse.data.event;
      setPlayers(event.players);

      // Check for existing submission
      try {
        const submissionResponse = await axios.get(
          `${API_URL}/api/draft/${event.id}/my-submission`
        );
        const sub = submissionResponse.data.submission;
        if (sub) {
          setSubmission(sub);
          // Order players based on submission
          const ordered = sub.items
            .sort((a: SubmissionItem, b: SubmissionItem) => a.position - b.position)
            .map((item: SubmissionItem) => item.player);
          setOrderedPlayers(ordered);
        } else {
          // Start with players in original order
          setOrderedPlayers([...event.players]);
        }
      } catch (error) {
        // No submission yet, use original order
        setOrderedPlayers([...event.players]);
      }
    } catch (error) {
      console.error('Failed to fetch event:', error);
      setError('Failed to load event data');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedPlayers((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSubmit = async () => {
    if (!eventCode) return;

    setSubmitting(true);
    setError('');

    try {
      const eventResponse = await axios.get(`${API_URL}/api/events/code/${eventCode}`);
      const eventId = eventResponse.data.event.id;

      const playerOrder = orderedPlayers.map((p) => p.id);

      await axios.post(`${API_URL}/api/draft/${eventId}/submit-order`, {
        playerOrder,
      });

      navigate(`/event/${eventCode}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit draft order');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPlayers = orderedPlayers.filter((player) =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const isLocked = submission?.locked || false;

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
              <h1 className="text-xl font-bold text-gray-900">Submit Draft Order</h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Arrange Your Draft Order
              </h2>
              <p className="text-gray-600">
                Drag and drop players to order them according to your prediction. The player at the
                top will be your #1 pick prediction.
              </p>
            </div>

            {isLocked && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
                This submission is locked. You can view it but cannot make changes.
              </div>
            )}

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredPlayers.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredPlayers.map((player, index) => (
                    <SortableItem key={player.id} player={player} index={index} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {orderedPlayers.length} players in your draft order
              </div>
              {!isLocked && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Draft Order'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DraftSubmission;
