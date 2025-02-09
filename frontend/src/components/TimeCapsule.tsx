import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Clock, Medal, RefreshCw, X, Upload, MapPin } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/config';
import { uploadMedia, saveJourneyMemory } from '@/lib/firebase/utils';

interface TimeCapsuleProps {
  onClose: () => void;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: string;
  difficulty: string;
  points: number;
  time_limit?: number;
  location_required: boolean;
  target_location?: {
    name: string;
    latitude: number;
    longitude: number;
  };
  completion_criteria: string;
  tags: string[];
}

export const TimeCapsule: React.FC<TimeCapsuleProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { latitude, longitude, error: geoError } = useGeolocation();
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (geoError) {
      setError(`Location access error: ${geoError}`);
    } else {
      setError(null);
    }
  }, [geoError]);

  useEffect(() => {
    if (user) {
      loadCompletedChallenges();
    }
  }, [user]);

  const loadCompletedChallenges = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setCompletedChallenges(data.completedChallenges || []);
      }
    } catch (err) {
      console.error('Error loading completed challenges:', err);
    }
  };

  const fetchNewChallenge = async () => {
    if (!latitude || !longitude) {
      setError('Waiting for location access...');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/challenges/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude,
          longitude,
          completed_challenges: completedChallenges,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch challenge');
      }

      const challenge = await response.json();
      setCurrentChallenge(challenge);
    } catch (err) {
      setError('Failed to load challenge. Please try again.');
      console.error('Error fetching challenge:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleSubmitChallenge = async () => {
    if (!user || !currentChallenge) return;

    try {
      setIsSubmitting(true);
      setError(null);

      let imageUrl: string | undefined;

      // Only upload image if one is selected
      if (selectedFile) {
        // Create a unique filename
        const timestamp = Date.now();
        const filename = `${currentChallenge.id}_${timestamp}.jpg`;
        const storagePath = `challenges/${user.uid}/${filename}`;

        // Upload to Firebase Storage
        imageUrl = await uploadMedia(selectedFile, storagePath);
      }

      // Save as a journey memory
      await saveJourneyMemory({
        userId: user.uid,
        type: 'challenge',
        content: {
          title: currentChallenge.title,
          description: currentChallenge.description,
          ...(imageUrl && { mediaUrl: imageUrl }),
          challengeCompleted: true
        },
        tags: ['challenge', ...currentChallenge.tags]
      });

      // Update completed challenges in user document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        completedChallenges: arrayUnion(currentChallenge.id)
      });

      // Update local state
      setCompletedChallenges(prev => [...prev, currentChallenge.id]);

      // Clear form and show success
      setSelectedFile(null);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        fetchNewChallenge();
      }, 2000);

    } catch (err) {
      console.error('Error submitting challenge:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit challenge');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md bg-neutral-900 rounded-lg shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
        >
          <X size={20} />
        </button>

        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Time Capsule Challenges</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 text-red-200 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-900/50 text-green-200 rounded-md">
              Challenge completed successfully!
            </div>
          )}

          {!currentChallenge ? (
            <button
              onClick={fetchNewChallenge}
              disabled={loading}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="animate-spin" size={20} />
              ) : (
                <>
                  <Medal size={20} />
                  Get New Challenge
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-800 rounded-md">
                <h3 className="text-lg font-semibold text-white mb-2">{currentChallenge.title}</h3>
                <p className="text-neutral-300 mb-3">{currentChallenge.description}</p>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {currentChallenge.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs bg-neutral-700 text-neutral-300 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-sm text-neutral-400">
                  <div className="flex items-center gap-1">
                    <Medal size={16} />
                    <span>{currentChallenge.points} points</span>
                  </div>
                  {currentChallenge.time_limit && (
                    <div className="flex items-center gap-1">
                      <Clock size={16} />
                      <span>{currentChallenge.time_limit} min</span>
                    </div>
                  )}
                  {currentChallenge.location_required && (
                    <div className="flex items-center gap-1">
                      <MapPin size={16} />
                      <span>{currentChallenge.target_location?.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {currentChallenge.type === 'photo' && (
                <div className="space-y-2">
                  <label className="block w-full py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div className="flex items-center justify-center gap-2">
                      <Camera size={20} />
                      {selectedFile ? 'Change Photo' : 'Take Photo'}
                    </div>
                  </label>
                  {selectedFile && (
                    <p className="text-sm text-neutral-400">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={handleSubmitChallenge}
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <Upload size={20} />
                    Submit Challenge
                  </>
                )}
              </button>
            </div>
          )}

          {completedChallenges.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-800">
              <p className="text-sm text-neutral-400">
                Completed: {completedChallenges.length} challenges
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
} 