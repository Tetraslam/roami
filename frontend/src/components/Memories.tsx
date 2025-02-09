import * as React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/firebase/auth';
import { subscribeToJourneyMemories, deleteJourneyMemory } from '@/lib/firebase/utils';
import type { JourneyMemory } from '@/lib/firebase/types';
import { Camera, Mic, MapPin, Clock, Award } from 'lucide-react';

interface MemoriesProps {
  onClose: () => void;
}

export const Memories: React.FC<MemoriesProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [memories, setMemories] = React.useState<JourneyMemory[]>([]);
  const [selectedMemory, setSelectedMemory] = React.useState<JourneyMemory | null>(null);

  // Subscribe to memories
  React.useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToJourneyMemories(user.uid, (newMemories) => {
      setMemories(newMemories);
    });

    return () => unsubscribe();
  }, [user]);

  const getMemoryIcon = (type: JourneyMemory['type']) => {
    switch (type) {
      case 'photo':
        return <Camera className="h-5 w-5" />;
      case 'voice':
        return <Mic className="h-5 w-5" />;
      case 'location':
        return <MapPin className="h-5 w-5" />;
      case 'historical':
        return <Clock className="h-5 w-5" />;
      case 'challenge':
        return <Award className="h-5 w-5" />;
    }
  };

  const formatDate = (timestamp: any) => {
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  const handleDelete = async (memoryId: string) => {
    if (confirm('Are you sure you want to delete this memory?')) {
      try {
        await deleteJourneyMemory(memoryId);
      } catch (error) {
        console.error('Error deleting memory:', error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-900 shadow-xl overflow-y-auto">
        <div className="sticky top-0 p-4 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-primary-300">Journey Memories</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {memories.length === 0 ? (
            <div className="text-center text-neutral-400 py-8">
              No memories yet. Start your journey to create some!
            </div>
          ) : (
            memories.map((memory) => (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-neutral-800 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary-300">
                    {getMemoryIcon(memory.type)}
                    <span className="font-medium">{memory.content.title}</span>
                  </div>
                  <span className="text-sm text-neutral-400">
                    {formatDate(memory.timestamp)}
                  </span>
                </div>

                {memory.content.description && (
                  <p className="text-neutral-300">{memory.content.description}</p>
                )}

                {memory.content.mediaUrl && (
                  <div className="mt-2">
                    {memory.type === 'photo' ? (
                      <img
                        src={memory.content.mediaUrl}
                        alt={memory.content.title}
                        className="rounded-lg w-full h-48 object-cover"
                      />
                    ) : memory.type === 'voice' ? (
                      <audio
                        src={memory.content.mediaUrl}
                        controls
                        className="w-full"
                      />
                    ) : null}
                  </div>
                )}

                {memory.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-primary-900/50 text-primary-300 rounded text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handleDelete(memory.id)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}; 