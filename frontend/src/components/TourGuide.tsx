import * as React from 'react';
import { useTourGuide } from '@/hooks/useTourGuide';
import { motion } from 'framer-motion';
import { useCallback, useEffect } from 'react';
import { Volume, VolumeX } from 'lucide-react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAuth } from '@/lib/firebase/auth';
import { saveJourneyMemory } from '@/lib/firebase/utils';

export const TourGuide: React.FC = () => {
  const { user } = useAuth();
  const {
    isLoading,
    error,
    currentLocation,
    currentTour,
    startTour,
    goToNextStop,
    getCurrentStop
  } = useTourGuide();

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [description, setDescription] = React.useState<string>("");
  const [isLoadingDescription, setIsLoadingDescription] = React.useState(false);
  const { speak, stop } = useTextToSpeech();

  const currentStop = getCurrentStop();

  const generateDescription = useCallback(async (stop: any) => {
    if (!stop) return;
    
    setIsLoadingDescription(true);
    try {
      const response = await fetch('http://localhost:8000/ai/generate-stop-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: stop.poi.name,
          type: stop.poi.type || 'location',
          city: stop.poi.city || 'this city',
          year: stop.year
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate description');
      }

      const data = await response.json();
      if (data.description) {
        setDescription(data.description);
      } else {
        throw new Error('No description received from server');
      }
    } catch (err) {
      console.error('Error generating description:', err);
      setDescription(err instanceof Error ? err.message : "Failed to generate description");
    } finally {
      setIsLoadingDescription(false);
    }
  }, []);

  useEffect(() => {
    if (currentStop) {
      generateDescription(currentStop);
    }
  }, [currentStop, generateDescription]);

  const toggleSpeech = useCallback(() => {
    if (!description) return;

    if (isPlaying) {
      stop();
      setIsPlaying(false);
    } else {
      speak(description);
      setIsPlaying(true);
    }
  }, [description, isPlaying, speak, stop]);

  // Clean up speech when component unmounts
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const handleStartTour = React.useCallback(() => {
    startTour(2000); // 2km radius
  }, [startTour]);

  // Save memory when visiting a new stop
  useEffect(() => {
    if (!user || !currentStop) return;

    saveJourneyMemory({
      userId: user.uid,
      type: 'location',
      content: {
        title: currentStop.poi.name,
        description: description || currentStop.poi.description,
        location: currentStop.poi.location,
        historicalContext: currentStop.description
      },
      tags: ['tour', 'location', currentStop.poi.type]
    }).catch(err => {
      console.error('Error saving location memory:', err);
    });
  }, [currentStop, user, description]);

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
        <p>{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
        <p className="mt-2 text-neutral-400">Planning your tour...</p>
      </div>
    );
  }

  if (!currentTour) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-semibold text-primary-300">Tour Guide</h2>
        <p className="text-neutral-400">
          Let me help you explore the area! I'll find interesting places nearby and create a custom tour with historical information.
        </p>
        <button
          onClick={handleStartTour}
          className="w-full py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          Start Tour
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-primary-300">Your Custom Tour</h2>
        <div className="flex justify-between text-sm text-neutral-400">
          <span>Distance: {(currentTour.totalDistance / 1000).toFixed(1)}km</span>
          <span>Duration: ~{Math.round(currentTour.estimatedDuration)} mins</span>
        </div>
      </div>

      {currentStop && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-primary-200">{currentStop.poi.name}</h3>
              <button
                onClick={toggleSpeech}
                className="p-2 text-primary-300 hover:text-primary-200 transition-colors"
                disabled={!description || isLoadingDescription}
              >
                {isPlaying ? <VolumeX className="h-5 w-5" /> : <Volume className="h-5 w-5" />}
              </button>
            </div>
            {isLoadingDescription ? (
              <div className="animate-pulse h-4 bg-primary-900/50 rounded w-3/4"></div>
            ) : (
              <p className="text-neutral-300">{description || "No description available"}</p>
            )}
          </div>

          {currentStop.historicalPhotos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-neutral-400">Historical Photos</h4>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {currentStop.historicalPhotos.map((photo, index) => (
                  <div key={index} className="flex-none">
                    <img
                      src={photo.url}
                      alt={photo.title}
                      className="h-32 w-auto rounded-lg object-cover"
                    />
                    {photo.year && (
                      <p className="text-xs text-neutral-500 mt-1">{photo.year}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <a
              href={`https://www.google.com/maps?q=${currentStop.poi.location.latitude},${currentStop.poi.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-400 hover:text-primary-300"
            >
              Open in Maps
            </a>
            <button
              onClick={goToNextStop}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Next Stop
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}; 