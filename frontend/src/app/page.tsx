'use client';

import * as React from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { ControlButtons } from '@/components/ControlButtons';
import { Header } from '@/components/Header';
import { usePassengerVoiceRecording } from '@/hooks/usePassengerVoiceRecording';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/firebase/auth';
import { saveMessage, subscribeToMessages, uploadMedia, saveJourneyMemory } from '@/lib/firebase/utils';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Collections } from '@/lib/firebase/types';
import { useCamera } from '@/hooks/useCamera';
import { TourGuide } from '@/components/TourGuide';
import { TimeMachine } from '@/components/TimeMachine';
import { Memories } from '@/components/Memories';
import { LocalMusic } from '@/components/LocalMusic';
import { Serendipity } from '@/components/Serendipity';
import { TimeCapsule } from '@/components/TimeCapsule';
import { CulturalCompass } from '@/components/CulturalCompass';

export default function HomePage() {
  const [mounted, setMounted] = React.useState(false);
  const [showTourGuide, setShowTourGuide] = React.useState(false);
  const [showTimeMachine, setShowTimeMachine] = React.useState(false);
  const [showMemories, setShowMemories] = React.useState(false);
  const [showLocalMusic, setShowLocalMusic] = React.useState(false);
  const [showSerendipity, setShowSerendipity] = React.useState(false);
  const [showTimeCapsule, setShowTimeCapsule] = React.useState(false);
  const [showCulturalCompass, setShowCulturalCompass] = React.useState(false);
  const { user } = useAuth();
  
  // Use useRef for stable IDs
  const messageIdRef = React.useRef(0);
  const getNextId = () => {
    messageIdRef.current += 1;
    return messageIdRef.current.toString();
  };

  const [messages, setMessages] = React.useState<Array<{
    id: string;
    type: 'user' | 'ai';
    content: string;
    timestamp: string;
    hasImage?: boolean;
    imageUrl?: string;
  }>>([]);

  // Subscribe to messages from Firestore
  React.useEffect(() => {
    if (!user) return;

    console.log('Setting up message subscription for user:', user.uid);
    const unsubscribe = subscribeToMessages(user.uid, (firestoreMessages) => {
      console.log('Received messages update:', firestoreMessages.length, 'messages');
      const formattedMessages = firestoreMessages.map(msg => ({
        id: msg.id,
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp.toDate().toISOString(),
        hasImage: msg.hasImage,
        imageUrl: msg.imageUrl,
      }));
      console.log('Formatted messages:', formattedMessages);
      setMessages(formattedMessages);
    });

    return () => {
      console.log('Cleaning up message subscription');
      unsubscribe();
    };
  }, [user]);

  // Set initial message after mount to avoid hydration mismatch
  React.useEffect(() => {
    async function initializeChat() {
      if (!mounted && user) {
        setMounted(true);
        
        try {
          console.log('Initializing chat for user:', user.uid);
          
          // Clear previous messages
          const messagesRef = collection(db, Collections.MESSAGES);
          const q = query(messagesRef, where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          
          console.log('Found', snapshot.docs.length, 'existing messages to clear');
          
          // Delete all existing messages
          const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          
          console.log('All previous messages cleared');
          
          // Wait a moment to ensure deletions are complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Add welcome message
          await saveMessage({
            type: 'ai' as const,
            content: "Hi! I'm Roami. How can I help you with your journey today?",
            userId: user.uid,
          });
          
          console.log('Welcome message added');
        } catch (error) {
          console.error('Error initializing chat:', error);
        }
      }
    }

    initializeChat();
  }, [mounted, user]);

  const handleSpeechResult = React.useCallback(async (text: string) => {
    if (!user) return;

    // Save user message to Firestore
    const userMessage = {
      type: 'user' as const,
      content: text,
      userId: user.uid,
    };
    
    await saveMessage(userMessage);

    try {
      console.log('Sending request to AI:', text);
      const response = await fetch('http://localhost:8000/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: text,
          }],
          context: {
            userId: user.uid
          }
        }),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to get AI response: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Parsed response:', data);

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.content) {
        console.log('Processing Cerebras response:', data.content);
        await saveMessage({
          type: 'ai',
          content: data.content,
          userId: user.uid,
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Save error message to Firestore
      await saveMessage({
        type: 'ai',
        content: 'Sorry, I encountered an error. Please try again.',
        userId: user.uid,
      });
    }
  }, [user]);

  const { isListening, error, startListening, stopListening } = usePassengerVoiceRecording({
    onSpeechResult: handleSpeechResult,
    userId: user?.uid || '',
  });

  const handleImageCapture = React.useCallback(async (imageBlob: Blob) => {
    if (!user) return;

    try {
      // Convert Blob to File
      const imageFile = new File([imageBlob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Save initial message without imageUrl field
      const messageRef = await saveMessage({
        type: 'user',
        content: 'Image captured!',
        userId: user.uid,
        hasImage: true
      });
      
      // Upload to Firebase Storage
      const imagePath = `images/${user.uid}/${imageFile.name}`;
      const imageUrl = await uploadMedia(imageFile, imagePath);

      // Update message with image URL
      const messagesRef = collection(db, Collections.MESSAGES);
      await updateDoc(doc(messagesRef, messageRef), {
        imageUrl: imageUrl
      });

      // Save as a journey memory
      await saveJourneyMemory({
        userId: user.uid,
        type: 'photo',
        content: {
          title: 'Photo Memory',
          mediaUrl: imageUrl,
          description: 'A moment from your journey'
        },
        tags: ['photo']
      });

      // Save AI analyzing message
      await saveMessage({
        type: 'ai',
        content: 'Analyzing image...',
        userId: user.uid
      });

      // Send to backend for Moondream analysis
      const response = await fetch('http://localhost:8000/ai/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: imageUrl
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to analyze image: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update the memory with AI description
      const memories = await getDocs(
        query(
          collection(db, Collections.JOURNEY_MEMORIES),
          where('userId', '==', user.uid),
          where('type', '==', 'photo'),
          where('content.mediaUrl', '==', imageUrl)
        )
      );

      if (!memories.empty) {
        const memoryDoc = memories.docs[0];
        await updateDoc(doc(db, Collections.JOURNEY_MEMORIES, memoryDoc.id), {
          'content.description': data.description
        });
      }
      
      // Save AI response
      await saveMessage({
        type: 'ai',
        content: data.description || 'I see an image, but I\'m not sure what it shows.',
        userId: user.uid,
      });

    } catch (error) {
      console.error('Error handling image:', error);
      await saveMessage({
        type: 'ai',
        content: error instanceof Error 
          ? `Sorry, I had trouble processing that image: ${error.message}`
          : 'Sorry, I had trouble processing that image. Please try again.',
        userId: user.uid,
      });
    }
  }, [user]);

  const { startCapture, isCapturing } = useCamera({
    onImageCapture: handleImageCapture,
  });

  // Show error message if speech recognition fails
  React.useEffect(() => {
    if (error && user) {
      saveMessage({
        type: 'ai',
        content: `Error: ${error}. Please try again.`,
        userId: user.uid,
      }).catch(console.error);
    }
  }, [error, user]);

  if (!mounted) {
    return null;
  }

  return (
    <ProtectedRoute>
      <main className="flex flex-col h-screen">
        <Header />
        
        <div className="flex-1 overflow-y-auto pt-16 pb-32">
          <ChatInterface messages={messages} />
        </div>

        {/* Tour Guide Modal */}
        {showTourGuide && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
            <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-900 shadow-xl overflow-y-auto">
              <div className="sticky top-0 p-4 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-primary-300">Tour Guide</h2>
                <button
                  onClick={() => setShowTourGuide(false)}
                  className="p-2 text-neutral-400 hover:text-neutral-200"
                >
                  Close
                </button>
              </div>
              <TourGuide />
            </div>
          </div>
        )}

        {/* Time Machine Modal */}
        {showTimeMachine && (
          <TimeMachine onClose={() => setShowTimeMachine(false)} />
        )}

        {/* Memories Modal */}
        {showMemories && (
          <Memories onClose={() => setShowMemories(false)} />
        )}

        {/* Local Music Modal */}
        {showLocalMusic && (
          <LocalMusic onClose={() => setShowLocalMusic(false)} />
        )}

        {/* Serendipity Modal */}
        {showSerendipity && (
          <Serendipity onClose={() => setShowSerendipity(false)} />
        )}

        {/* Time Capsule Modal */}
        {showTimeCapsule && (
          <TimeCapsule onClose={() => setShowTimeCapsule(false)} />
        )}

        {/* Cultural Compass Modal */}
        {showCulturalCompass && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50">
            <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-900 shadow-xl overflow-y-auto">
              <div className="sticky top-0 p-4 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-primary-300">Cultural Compass</h2>
                <button
                  onClick={() => setShowCulturalCompass(false)}
                  className="p-2 text-neutral-400 hover:text-neutral-200"
                >
                  Close
                </button>
              </div>
              <div className="p-4">
                <CulturalCompass />
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/80 backdrop-blur-sm">
          <div className="flex items-center overflow-x-auto px-4 py-2 border-t border-neutral-800 no-scrollbar">
            <div className="flex items-center gap-2 min-w-max">
              <button
                onClick={() => setShowTourGuide(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Tour Guide
              </button>
              <button
                onClick={() => setShowTimeMachine(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Time Machine
              </button>
              <button
                onClick={() => setShowMemories(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Memories
              </button>
              <button
                onClick={() => setShowLocalMusic(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Local Music
              </button>
              <button
                onClick={() => setShowSerendipity(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Serendipity
              </button>
              <button
                onClick={() => setShowTimeCapsule(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Time Capsule
              </button>
              <button
                onClick={() => setShowCulturalCompass(true)}
                className="px-4 py-2 text-sm text-primary-300 hover:text-primary-200 transition-colors whitespace-nowrap"
              >
                Cultural Compass
              </button>
            </div>
          </div>
          <ControlButtons
            onVoiceStart={startListening}
            onVoiceEnd={stopListening}
            onImageCapture={startCapture}
            isListening={isListening}
          />
        </div>
      </main>
    </ProtectedRoute>
  );
}