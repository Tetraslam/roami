'use client';

import * as React from 'react';

interface ControlButtonsProps {
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  onImageCapture: () => void;
  isListening: boolean;
}

export const ControlButtons: React.FC<ControlButtonsProps> = ({
  onVoiceStart,
  onVoiceEnd,
  onImageCapture,
  isListening,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 flex gap-4">
      <button
        onClick={isListening ? onVoiceEnd : onVoiceStart}
        className={`flex-1 h-14 rounded-full flex items-center justify-center transition-colors shadow-lg ${
          isListening ? 'bg-red-500 text-white' : 'bg-primary-500 text-white'
        }`}
      >
        <span className="text-sm font-medium">
          {isListening ? 'Stop Recording' : 'Voice Message'}
        </span>
      </button>
      <button
        onClick={onImageCapture}
        className="flex-1 h-14 rounded-full bg-neutral-800 text-neutral-100 flex items-center justify-center shadow-lg border border-neutral-700 hover:bg-neutral-700 transition-colors"
      >
        <span className="text-sm font-medium">Take Picture</span>
      </button>
    </div>
  );
}; 