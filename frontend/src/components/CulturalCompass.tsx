import * as React from 'react';
import { motion } from 'framer-motion';
import { Globe2, Languages, Utensils, Landmark, Calendar, Info, Loader2, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth';
import { saveJourneyMemory } from '@/lib/firebase/utils';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useGeolocation } from '@/hooks/useGeolocation';

interface CulturalInfo {
  category: 'customs' | 'language' | 'food' | 'architecture' | 'events';
  title: string;
  description: string;
  tips?: string[];
  relevance?: string;
  source?: string;
}

export const CulturalCompass: React.FC = () => {
  const { user } = useAuth();
  const { latitude, longitude, error: geoError, isLoading: geoLoading } = useGeolocation();
  const { speak, stop } = useTextToSpeech();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [culturalInfo, setCulturalInfo] = React.useState<CulturalInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<CulturalInfo['category']>('customs');
  const [speakingId, setSpeakingId] = React.useState<number | null>(null);

  const getCategoryIcon = (category: CulturalInfo['category']) => {
    switch (category) {
      case 'customs':
        return <Globe2 className="h-5 w-5" />;
      case 'language':
        return <Languages className="h-5 w-5" />;
      case 'food':
        return <Utensils className="h-5 w-5" />;
      case 'architecture':
        return <Landmark className="h-5 w-5" />;
      case 'events':
        return <Calendar className="h-5 w-5" />;
    }
  };

  const handleSpeak = (index: number, text: string) => {
    if (speakingId === index) {
      stop();
      setSpeakingId(null);
    } else {
      stop();
      setSpeakingId(index);
      speak(`${text}. ${culturalInfo[index].tips?.join('. ') || ''}`);
    }
  };

  // Stop speaking when component unmounts
  React.useEffect(() => {
    return () => stop();
  }, [stop]);

  const getCulturalInfo = React.useCallback(async () => {
    if (!user) return;
    if (!latitude || !longitude) {
      setError('Waiting for location access...');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get cultural information from our backend
      const response = await fetch('http://localhost:8000/cultural/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude,
          longitude,
          category: selectedCategory
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get cultural information');
      }

      const data = await response.json();
      setCulturalInfo(data);

      // Save as a journey memory
      if (data.length > 0) {
        await saveJourneyMemory({
          userId: user.uid,
          type: 'cultural',
          content: {
            title: `Cultural Insights - ${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}`,
            description: `Learned about local ${selectedCategory} and traditions`,
          },
          tags: ['culture', selectedCategory]
        });
      }

    } catch (err) {
      console.error('Error getting cultural information:', err);
      setError(err instanceof Error ? err.message : 'Failed to get cultural information');
    } finally {
      setIsLoading(false);
    }
  }, [user, latitude, longitude, selectedCategory]);

  // Load cultural info when component mounts or category changes
  React.useEffect(() => {
    if (!geoLoading) {
      getCulturalInfo();
    }
  }, [getCulturalInfo, geoLoading]);

  return (
    <div className="space-y-6">
      {/* Category Selection */}
      <div className="flex flex-wrap gap-2">
        {(['customs', 'language', 'food', 'architecture', 'events'] as const).map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${
              selectedCategory === category
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {getCategoryIcon(category)}
            <span>{category.charAt(0).toUpperCase() + category.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      ) : (
        /* Cultural Information */
        <div className="space-y-4">
          {culturalInfo.map((info, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-neutral-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCategoryIcon(info.category)}
                  <h3 className="font-medium text-primary-200">{info.title}</h3>
                </div>
                <button
                  onClick={() => handleSpeak(index, info.description)}
                  className="p-2 text-neutral-400 hover:text-primary-300 transition-colors"
                  title={speakingId === index ? "Stop speaking" : "Listen"}
                >
                  {speakingId === index ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
              </div>

              <p className="text-neutral-300">{info.description}</p>

              {info.tips && info.tips.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-neutral-400">Tips</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {info.tips.map((tip, tipIndex) => (
                      <li key={tipIndex} className="text-sm text-neutral-300">{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {info.relevance && (
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Info className="h-4 w-4" />
                  <span>{info.relevance}</span>
                </div>
              )}

              {info.source && (
                <div className="text-xs text-neutral-500">
                  Source: {info.source}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}; 