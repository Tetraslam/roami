'use client';

import * as React from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { ControlButtons } from '@/components/ControlButtons';
import { Header } from '@/components/Header';
import { usePassengerVoiceRecording } from '@/hooks/usePassengerVoiceRecording';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/firebase/auth';
import { saveMessage, subscribeToMessages } from '@/lib/firebase/utils';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Collections } from '@/lib/firebase/types';

export default function HomePage() {
  const [mounted, setMounted] = React.useState(false);
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
          // Clear previous messages
          const messagesRef = collection(db, Collections.MESSAGES);
          const q = query(messagesRef, where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          
          // Delete all existing messages
          const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          
          // Add welcome message only after clearing previous messages
          await saveMessage({
            type: 'ai' as const,
            content: "Hi! I'm Roami. How can I help you with your journey today?",
            userId: user.uid,
          });
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
          messages: [
            {
              role: 'user',
              content: text,
            },
          ],
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
  });

  const handleImageCapture = React.useCallback(() => {
    if (!user) return;

    saveMessage({
      type: 'user',
      content: 'Image captured!',
      userId: user.uid,
      hasImage: true,
      imageUrl: 'https://placekitten.com/300/200',
    }).catch(console.error);
  }, [user]);

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

        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/80 backdrop-blur-sm">
          <ControlButtons
            onVoiceStart={startListening}
            onVoiceEnd={stopListening}
            onImageCapture={handleImageCapture}
            isListening={isListening}
          />
        </div>
      </main>
    </ProtectedRoute>
  );
} 