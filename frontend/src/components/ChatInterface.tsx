'use client';

import * as React from 'react';
import { motion } from 'framer-motion';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  hasImage?: boolean;
  imageUrl?: string;
}

interface ChatInterfaceProps {
  messages: Message[];
}

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages }) => {
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
            {message.hasImage && message.imageUrl && (
              <img
                src={message.imageUrl}
                alt="Shared image"
                className="w-full h-auto rounded-lg mb-2"
              />
            )}
            <p className="text-sm">{message.content}</p>
            <span className="text-xs opacity-70 mt-1 block">
              {formatTime(message.timestamp)}
            </span>
          </div>
        </motion.div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );
}; 