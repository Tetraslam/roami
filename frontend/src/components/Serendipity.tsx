import * as React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Tag, Sparkles, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth';
import { saveJourneyMemory } from '@/lib/firebase/utils';
import { useGeolocation } from '@/hooks/useGeolocation';

interface SerendipityProps {
  onClose: () => void;
}

interface Suggestion {
  title: string;
  description: string;
  type: 'hidden_gem' | 'activity' | 'food' | 'scenic_route' | 'local_secret';
  location: {
    name: string;
    latitude: number;
    longitude: number;
  };
  duration?: number;
  distance?: number;
  context: string;
  tags: string[];
}

const moodOptions = [
  'adventurous',
  'relaxed',
  'curious',
  'energetic',
  'peaceful',
  'cultural',
  'foodie',
  'historical'
];

export const Serendipity: React.FC<SerendipityProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { latitude, longitude, error: geoError, isLoading: geoLoading } = useGeolocation();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [selectedMood, setSelectedMood] = React.useState<string | null>(null);
  const [timeAvailable, setTimeAvailable] = React.useState<number>(60); // Default 60 minutes

  const getSerendipitousSuggestion = React.useCallback(async () => {
    if (!user) return;
    if (!latitude || !longitude) {
      setError('Waiting for location access...');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get suggestion from our new endpoint
      const response = await fetch('http://localhost:8000/serendipity/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude,
          longitude,
          radius: 5000,
          mood: selectedMood,
          time_available: timeAvailable
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get suggestion');
      }

      const suggestion = await response.json();
      setSuggestion(suggestion);

      // Save as a journey memory if we got a suggestion
      if (suggestion) {
        await saveJourneyMemory({
          userId: user.uid,
          type: 'serendipity',
          content: {
            title: 'Serendipitous Discovery',
            description: suggestion.title,
            details: suggestion.description
          },
          tags: ['serendipity', selectedMood || 'spontaneous']
        });
      }

    } catch (err) {
      console.error('Error getting serendipitous suggestion:', err);
      setError(err instanceof Error ? err.message : 'Failed to get suggestion');
    } finally {
      setIsLoading(false);
    }
  }, [user, latitude, longitude, selectedMood, timeAvailable]);

  // Get suggestion when mood or time changes
  React.useEffect(() => {
    if (selectedMood && !geoLoading) {
      getSerendipitousSuggestion();
    }
  }, [getSerendipitousSuggestion, selectedMood, geoLoading]);

  const getTypeIcon = (type: Suggestion['type']) => {
    switch (type) {
      case 'hidden_gem':
        return '💎';
      case 'activity':
        return '🎯';
      case 'food':
        return '🍽️';
      case 'scenic_route':
        return '🌄';
      case 'local_secret':
        return '🤫';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-900 shadow-xl overflow-y-auto">
        <div className="sticky top-0 p-4 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-300" />
              <h2 className="text-lg font-semibold text-primary-300">Serendipity Mode</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-200"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-2">I'm feeling...</label>
              <div className="flex flex-wrap gap-2">
                {moodOptions.map((mood) => (
                  <button
                    key={mood}
                    onClick={() => setSelectedMood(mood)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      selectedMood === mood
                        ? 'bg-primary-500 text-white'
                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-2">Time available</label>
              <input
                type="range"
                min="15"
                max="180"
                step="15"
                value={timeAvailable}
                onChange={(e) => setTimeAvailable(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-neutral-500 mt-1">
                <span>15 min</span>
                <span>{timeAvailable} min</span>
                <span>3 hrs</span>
              </div>
            </div>

            <button
              onClick={getSerendipitousSuggestion}
              disabled={isLoading}
              className="w-full py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Finding something special...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>Surprise Me!</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 text-red-200 m-4 rounded-lg">
            {error}
          </div>
        )}

        {suggestion && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 space-y-4"
          >
            <div className="bg-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getTypeIcon(suggestion.type)}</span>
                  <h3 className="text-lg font-medium text-primary-200">{suggestion.title}</h3>
                </div>
                <button
                  onClick={getSerendipitousSuggestion}
                  className="p-2 text-neutral-400 hover:text-neutral-200"
                  title="Get another suggestion"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              <p className="text-neutral-300">{suggestion.description}</p>
              
              <div className="space-y-2 text-sm">
                {suggestion.location && (
                  <div className="flex items-center gap-2 text-neutral-400">
                    <MapPin className="h-4 w-4" />
                    <span>{suggestion.location.name}</span>
                  </div>
                )}
                
                {suggestion.duration && (
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Clock className="h-4 w-4" />
                    <span>About {suggestion.duration} minutes</span>
                  </div>
                )}

                {suggestion.distance && (
                  <div className="flex items-center gap-2 text-neutral-400">
                    <span>📍</span>
                    <span>{suggestion.distance.toFixed(1)} km away</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-neutral-700">
                <p className="text-sm text-neutral-300">{suggestion.context}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {suggestion.tags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-neutral-700/50 rounded-full text-xs text-neutral-300"
                  >
                    <Tag className="h-3 w-3" />
                    <span>{tag}</span>
                  </div>
                ))}
              </div>

              {suggestion.location && (
                <a
                  href={`https://www.google.com/maps?q=${suggestion.location.latitude},${suggestion.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary-400 hover:text-primary-300 mt-4"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}; 