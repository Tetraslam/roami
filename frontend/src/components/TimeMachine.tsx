import * as React from 'react';
import { motion } from 'framer-motion';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAuth } from '@/lib/firebase/auth';
import { saveJourneyMemory } from '@/lib/firebase/utils';

interface HistoricalPhoto {
  url: string;
  title: string;
  year?: number;
  description?: string;
  author?: string;
  license?: string;
  thumbnail?: string;
  source_url?: string;
}

interface TimeMachineProps {
  onClose: () => void;
}

export const TimeMachine: React.FC<TimeMachineProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [yearRange, setYearRange] = React.useState({ from: 1900, to: new Date().getFullYear() });
  const [photos, setPhotos] = React.useState<HistoricalPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = React.useState<HistoricalPhoto | null>(null);
  const { speak } = useTextToSpeech();

  const handleSearch = React.useCallback(async () => {
    try {
      if (!user) {
        setError('Please sign in to use this feature');
        return;
      }

      setIsLoading(true);
      setError(null);

      // Get the ID token
      const idToken = await user.getIdToken();

      // First, get coordinates for the location
      const locationResponse = await fetch('http://localhost:8000/location/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });

      if (!locationResponse.ok) {
        throw new Error('Failed to find location');
      }

      const locations = await locationResponse.json();
      if (!locations.length) {
        throw new Error('No locations found');
      }

      const location = locations[0];

      // Then, get historical photos
      const photosResponse = await fetch('http://localhost:8000/media/photos/historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: location.coordinates.latitude,
          longitude: location.coordinates.longitude,
          radius: 1000,
          year_from: yearRange.from,
          year_to: yearRange.to
        })
      });

      if (!photosResponse.ok) {
        throw new Error('Failed to fetch historical photos');
      }

      const photosData = await photosResponse.json();
      setPhotos(photosData);

      // Get AI description of the location's history
      const aiResponse = await fetch('http://localhost:8000/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Tell me about the history of ${searchQuery} between ${yearRange.from} and ${yearRange.to}.`
          }],
          context: {
            userId: user.uid
          }
        })
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get AI response');
      }

      try {
        const aiData = await aiResponse.json();
        if (aiData && typeof aiData.content === 'string' && aiData.content.trim()) {
          console.log('Speaking AI response:', aiData.content);
          speak(aiData.content);
        } else {
          console.warn('Invalid or empty AI response content:', aiData);
          setError('Could not get historical context. Please try again.');
        }
      } catch (err) {
        console.error('Error processing AI response:', err);
        setError('Error processing historical context');
      }

    } catch (err) {
      console.error('Time Machine error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, yearRange, speak, user]);

  const handlePhotoSelect = async (photo: HistoricalPhoto) => {
    setSelectedPhoto(photo);

    // Save as a historical memory
    if (user && searchQuery) {
      try {
        await saveJourneyMemory({
          userId: user.uid,
          type: 'historical',
          content: {
            title: `Historical Photo of ${searchQuery}`,
            description: photo.description || 'A glimpse into the past',
            mediaUrl: photo.url,
            historicalContext: `From ${photo.year || 'an unknown year'}`
          },
          tags: ['historical', 'photo', searchQuery.toLowerCase()]
        });
      } catch (err) {
        console.error('Error saving historical memory:', err);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-neutral-900 shadow-xl overflow-y-auto">
        <div className="sticky top-0 p-4 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-primary-300">Time Machine</h2>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-200"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter a location..."
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500"
              />
            </div>

            <div className="flex gap-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">From Year</label>
                <input
                  type="number"
                  value={yearRange.from}
                  onChange={(e) => setYearRange(prev => ({ ...prev, from: parseInt(e.target.value) }))}
                  min="1800"
                  max={new Date().getFullYear()}
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">To Year</label>
                <input
                  type="number"
                  value={yearRange.to}
                  onChange={(e) => setYearRange(prev => ({ ...prev, to: parseInt(e.target.value) }))}
                  min="1800"
                  max={new Date().getFullYear()}
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100"
                />
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={isLoading || !searchQuery}
              className="w-full py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 text-red-200 m-4 rounded-lg">
            {error}
          </div>
        )}

        <div className="p-4">
          {photos.length > 0 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {photos.map((photo, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="relative group cursor-pointer"
                    onClick={() => handlePhotoSelect(photo)}
                  >
                    <img
                      src={photo.thumbnail || photo.url}
                      alt={photo.title}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    {photo.year && (
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/50 text-white text-sm rounded-b-lg">
                        {photo.year}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          ) : !isLoading && (
            <div className="text-center text-neutral-400 py-8">
              No historical photos found for this location and time period.
            </div>
          )}
        </div>

        {selectedPhoto && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full bg-neutral-900 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                <h3 className="text-lg font-medium text-primary-200">{selectedPhoto.title}</h3>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="text-neutral-400 hover:text-neutral-200"
                >
                  Close
                </button>
              </div>
              <div className="p-4">
                <img
                  src={selectedPhoto.url}
                  alt={selectedPhoto.title}
                  className="w-full h-auto rounded-lg"
                />
                <div className="mt-4 space-y-2 text-sm text-neutral-300">
                  {selectedPhoto.year && <p>Year: {selectedPhoto.year}</p>}
                  {selectedPhoto.description && <p>{selectedPhoto.description}</p>}
                  {selectedPhoto.author && <p>Author: {selectedPhoto.author}</p>}
                  {selectedPhoto.source_url && (
                    <p>
                      <a
                        href={selectedPhoto.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:text-primary-300"
                      >
                        View on Wikimedia Commons
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 