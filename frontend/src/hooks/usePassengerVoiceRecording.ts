'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePassengerVoiceRecordingProps {
  onSpeechResult: (text: string) => void;
}

interface RecordingState {
  isRecording: boolean;
  error: string | null;
  recognition: SpeechRecognition | null;
}

export function usePassengerVoiceRecording({
  onSpeechResult,
}: UsePassengerVoiceRecordingProps) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    error: null,
    recognition: null,
  });

  const transcriptRef = useRef<string[]>([]);
  const manualStopRef = useRef<boolean>(false);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setState(prev => ({ ...prev, error: 'Speech recognition not supported in this browser' }));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Keep listening
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Recording started');
      transcriptRef.current = []; // Reset transcript at start
      manualStopRef.current = false;
      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
      }));
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[event.results.length - 1][0].transcript;
      console.log('Speech recognized:', text);
      transcriptRef.current.push(text);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      console.error('Speech recognition error:', event.error);
      setState(prev => ({
        ...prev,
        error: event.error,
        isRecording: false,
      }));
    };

    recognition.onend = () => {
      console.log('Recording ended');
      
      if (!manualStopRef.current) {
        // If it wasn't manually stopped, restart
        try {
          recognition.start();
          return;
        } catch (err) {
          console.error('Failed to restart recording:', err);
        }
      }

      // Only send transcript if we manually stopped
      if (transcriptRef.current.length > 0) {
        const fullTranscript = transcriptRef.current.join(' ');
        console.log('Sending transcript:', fullTranscript);
        onSpeechResult(fullTranscript);
      }

      setState(prev => ({
        ...prev,
        isRecording: false,
      }));
    };

    setState(prev => ({ ...prev, recognition }));

    // Cleanup
    return () => {
      if (recognition) {
        manualStopRef.current = true; // Prevent auto-restart on cleanup
        recognition.abort();
      }
    };
  }, [onSpeechResult]);

  const startListening = useCallback(() => {
    if (!state.recognition) {
      setState(prev => ({ ...prev, error: 'Speech recognition not initialized' }));
      return;
    }

    try {
      console.log('Starting recording...');
      manualStopRef.current = false;
      state.recognition.start();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setState(prev => ({
        ...prev,
        error: 'Failed to start recording',
        isRecording: false,
      }));
    }
  }, [state.recognition]);

  const stopListening = useCallback(() => {
    if (!state.recognition || !state.isRecording) return;

    try {
      console.log('Stopping recording...');
      manualStopRef.current = true; // Mark as manual stop
      state.recognition.stop();
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setState(prev => ({
        ...prev,
        error: 'Failed to stop recording',
        isRecording: false,
      }));
    }
  }, [state.recognition, state.isRecording]);

  return {
    isListening: state.isRecording,
    error: state.error,
    startListening,
    stopListening,
  };
} 