import * as React from 'react';
import { motion } from 'framer-motion';
import { Music, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth';
import { saveJourneyMemory } from '@/lib/firebase/utils';
import { useGeolocation } from '@/hooks/useGeolocation';

interface LocalMusicProps {
  onClose: () => void;
}

interface MusicRecommendation {
  title: string;
  artist: string;
  year?: number;
  youtube_url: string;
  description: string;
  genre?: string;
  local_context: string;
}

export const LocalMusic: React.FC<LocalMusicProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { latitude, longitude, error: geoError, isLoading: geoLoading } = useGeolocation();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recommendations, setRecommendations] = React.useState<MusicRecommendation[]>([]);

  const getLocalMusic = React.useCallback(async () => {
    if (!user) return;
    if (!latitude || !longitude) {
      setError('Waiting for location access...');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get music recommendations from our new endpoint
      const response = await fetch('http://localhost:8000/music-ai/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude,
          longitude,
          limit: 5
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get music recommendations');
      }

      const recommendations = await response.json();
      setRecommendations(recommendations);

      // Save as a journey memory
      if (recommendations.length > 0) {
        await saveJourneyMemory({
          userId: user.uid,
          type: 'location',
          content: {
            title: 'Local Music Discovery',
            description: `Discovered music from ${recommendations[0].local_context.split(' in ')[1] || 'this area'}`,
          },
          tags: ['music', 'local-culture']
        });
      }

    } catch (err) {
      console.error('Error getting local music:', err);
      setError(err instanceof Error ? err.message : 'Failed to get music recommendations');
    } finally {
      setIsLoading(false);
    }
  }, [user, latitude, longitude]);

  // Load music recommendations when component mounts
  React.useEffect(() => {
    if (!geoLoading) {
      getLocalMusic();
    }
  }, [getLocalMusic, geoLoading]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-900 shadow-xl overflow-y-auto">
        <div className="sticky top-0 p-4 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-primary-300">Local Music</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            </div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-neutral-800 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Music className="h-5 w-5 text-primary-300" />
                      <div>
                        <h3 className="font-medium text-primary-200">{rec.title}</h3>
                        <p className="text-sm text-neutral-400">{rec.artist}</p>
                      </div>
                    </div>
                    {rec.year && (
                      <span className="text-sm text-neutral-500">{rec.year}</span>
                    )}
                  </div>

                  {rec.genre && (
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-primary-900/50 text-primary-300 rounded text-sm">
                        {rec.genre}
                      </span>
                    </div>
                  )}

                  <p className="text-sm text-neutral-300">{rec.description}</p>
                  <p className="text-sm text-neutral-400">{rec.local_context}</p>

                  <div className="pt-2">
                    <a
                      href={rec.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300"
                    >
                      <span>Listen on YouTube</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : !isLoading && (
            <div className="text-center text-neutral-400 py-8">
              No music recommendations found for this location.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 