import { useState, useCallback } from 'react';
import { POI, GeoPoint } from '@/lib/firebase/types';

interface TourStop {
  poi: POI;
  historicalPhotos: Array<{
    url: string;
    title: string;
    year?: number;
    description?: string;
  }>;
  description: string;
}

interface Tour {
  stops: TourStop[];
  totalDistance: number;
  estimatedDuration: number;
}

interface UseTourGuideResult {
  isLoading: boolean;
  error: string | null;
  currentLocation: GeoPoint | null;
  currentTour: Tour | null;
  startTour: (radius?: number) => Promise<void>;
  goToNextStop: () => void;
  getCurrentStop: () => TourStop | null;
}

export function useTourGuide(): UseTourGuideResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [currentTour, setCurrentTour] = useState<Tour | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);

  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });
    });
  });

  const startTour = useCallback(async (radiusMeters: number = 2000) => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current location
      const position = await getCurrentPosition();
      const location: GeoPoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: new Date()
      };
      setCurrentLocation(location);

      // Find nearby attractions
      const response = await fetch(`http://localhost:8000/location/nearby/attraction?lat=${location.latitude}&lon=${location.longitude}&radius=${radiusMeters}`);
      if (!response.ok) throw new Error('Failed to fetch nearby attractions');
      const attractions = await response.json();

      // For each attraction, get historical photos and create a tour stop
      const stops: TourStop[] = await Promise.all(
        attractions.slice(0, 5).map(async (attraction: any) => {
          // Get historical photos
          const photosResponse = await fetch('http://localhost:8000/media/photos/historical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: attraction.coordinates.latitude,
              longitude: attraction.coordinates.longitude,
              radius: 200 // Smaller radius for specific location
            })
          });
          
          const photos = await photosResponse.json();

          // Get AI description of the location
          const aiResponse = await fetch('http://localhost:8000/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              messages: [{
                role: 'user',
                content: `Tell me about ${attraction.name}. Include any interesting historical facts or cultural significance.`
              }]
            })
          });
          
          const aiData = await aiResponse.json();

          return {
            poi: {
              id: attraction.id,
              name: attraction.name,
              location: {
                latitude: attraction.coordinates.latitude,
                longitude: attraction.coordinates.longitude,
                timestamp: new Date()
              },
              type: 'attraction',
              description: attraction.additional_info?.description,
              photos: photos.map((p: any) => p.url)
            },
            historicalPhotos: photos,
            description: aiData.content || 'No description available.'
          };
        })
      );

      // Calculate total distance and estimated duration
      const totalDistance = stops.reduce((acc, stop, index) => {
        if (index === 0) return 0;
        const prevStop = stops[index - 1];
        const distance = calculateDistance(
          prevStop.poi.location.latitude,
          prevStop.poi.location.longitude,
          stop.poi.location.latitude,
          stop.poi.location.longitude
        );
        return acc + distance;
      }, 0);

      // Estimate 20 minutes per stop plus walking time (assuming 5km/h walking speed)
      const estimatedDuration = (totalDistance / 5000) * 60 + (stops.length * 20);

      setCurrentTour({
        stops,
        totalDistance,
        estimatedDuration
      });
      setCurrentStopIndex(0);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Tour guide error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const goToNextStop = useCallback(() => {
    if (!currentTour) return;
    setCurrentStopIndex(prev => Math.min(prev + 1, currentTour.stops.length - 1));
  }, [currentTour]);

  const getCurrentStop = useCallback((): TourStop | null => {
    if (!currentTour) return null;
    return currentTour.stops[currentStopIndex];
  }, [currentTour, currentStopIndex]);

  return {
    isLoading,
    error,
    currentLocation,
    currentTour,
    startTour,
    goToNextStop,
    getCurrentStop
  };
}

// Helper function to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
} 