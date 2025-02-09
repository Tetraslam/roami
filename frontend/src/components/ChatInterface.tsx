'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
  hasImage?: boolean;
  imageUrl?: string;
}

interface ChatInterfaceProps {
  messages: Message[];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages }) => {
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const { speak, stop } = useTextToSpeech();
  const lastMessageRef = React.useRef<string | null>(null);
  const speakTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-play new AI messages with debounce
  React.useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.type === 'ai' && lastMessage.content !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage.content;
      
      // Clear any pending speech
      if (speakTimeoutRef.current) {
        clearTimeout(speakTimeoutRef.current);
      }
      stop();

      // Delay speech slightly to avoid interruption
      speakTimeoutRef.current = setTimeout(() => {
        speak(lastMessage.content);
      }, 100);
    }
  }, [messages, speak, stop]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (speakTimeoutRef.current) {
        clearTimeout(speakTimeoutRef.current);
      }
      stop();
    };
  }, [stop]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((message) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl p-4 ${
              message.type === 'user'
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-800 text-neutral-100 border border-neutral-700'
            }`}
          >
            <p className="text-sm">{message.content}</p>
            {message.hasImage && message.imageUrl && (
              <img
                src={message.imageUrl}
                alt="User captured"
                className="mt-2 rounded-lg max-w-full h-auto"
              />
            )}
            <p className="text-xs opacity-50 mt-1">{formatTime(message.timestamp)}</p>
          </div>
        </motion.div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );
}; 