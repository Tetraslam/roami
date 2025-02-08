'use client';

import * as React from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { ControlButtons } from '@/components/ControlButtons';
import { Header } from '@/components/Header';
import { usePassengerVoiceRecording } from '@/hooks/usePassengerVoiceRecording';

export default function PassengerPage() {
  const [messages, setMessages] = React.useState<Array<{
    id: string;
    type: 'user' | 'ai';
    content: string;
    timestamp: Date;
    hasImage?: boolean;
    imageUrl?: string;
  }>>([
    {
      id: '1',
      type: 'ai',
      content: 'Hello! How can I help you with your journey today?',
      timestamp: new Date(),
    },
  ]);

  const handleSpeechResult = React.useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: text,
        timestamp: new Date(),
      },
    ]);
    // TODO: Send to backend for processing
  }, []);

  const { isListening, error, startListening, stopListening } = usePassengerVoiceRecording({
    onSpeechResult: handleSpeechResult,
  });

  const handleImageCapture = () => {
    // TODO: Implement camera functionality
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: 'Image captured!',
        timestamp: new Date(),
        hasImage: true,
        imageUrl: 'https://placekitten.com/300/200', // Placeholder image
      },
    ]);
  };

  // Show error message if speech recognition fails
  React.useEffect(() => {
    if (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'ai',
          content: `Error: ${error}. Please try again.`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [error]);

  return (
    <main className="flex flex-col h-screen">
      <Header />
      
      <div className="flex-1 overflow-y-auto pt-16">
        <ChatInterface messages={messages} />
      </div>

      <ControlButtons
        onVoiceStart={startListening}
        onVoiceEnd={stopListening}
        onImageCapture={handleImageCapture}
        isListening={isListening}
      />
    </main>
  );
} 