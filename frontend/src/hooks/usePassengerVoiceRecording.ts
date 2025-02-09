'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { saveJourneyMemory } from '@/lib/firebase/utils';

interface UsePassengerVoiceRecordingProps {
  onSpeechResult: (text: string) => void;
  userId: string;
}

interface RecordingState {
  isRecording: boolean;
  error: string | null;
  recognition: SpeechRecognition | null;
}

export function usePassengerVoiceRecording({
  onSpeechResult,
  userId,
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
    recognition.interimResults = true; // Changed to true to get partial results
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Recording started - Speech recognition is now active');
      transcriptRef.current = []; // Reset transcript at start
      manualStopRef.current = false;
      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
      }));
    };

    recognition.onaudiostart = () => {
      console.log('Audio capturing started - Microphone is now active');
    };

    recognition.onspeechstart = () => {
      console.log('Speech detected - User is speaking');
    };

    recognition.onsoundstart = () => {
      console.log('Sound detected - Audio input is being received');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log('Result event received:', event);
      console.log('Number of results:', event.results.length);
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        console.log(`Result ${i}:`, {
          transcript: text,
          confidence: result[0].confidence,
          isFinal: result.isFinal
        });
        
        if (result.isFinal) {
          console.log('Final transcript received:', text);
          transcriptRef.current.push(text);

          // Save as a journey memory
          if (userId) {
            saveJourneyMemory({
              userId: userId,
              type: 'voice',
              content: {
                title: 'Voice Note',
                description: text,
              },
              tags: ['voice']
            }).catch(err => {
              console.error('Error saving voice memory:', err);
            });
          }
        }
      }
    };

    recognition.onnomatch = () => {
      console.log('No match found for speech');
    };

    recognition.onaudioend = () => {
      console.log('Audio capturing ended');
    };

    recognition.onspeechend = () => {
      console.log('Speech has stopped being detected');
    };

    recognition.onsoundend = () => {
      console.log('Sound has stopped being received');
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      console.error('Error message:', event.message);
      
      // Handle specific error types
      switch (event.error) {
        case 'not-allowed':
          setState(prev => ({
            ...prev,
            error: 'Microphone permission denied. Please allow microphone access.',
            isRecording: false,
          }));
          break;
        case 'no-speech':
          console.log('No speech detected - This is normal and will trigger a restart');
          return; // Don't update state for no-speech errors
        case 'audio-capture':
          setState(prev => ({
            ...prev,
            error: 'No microphone detected. Please connect a microphone.',
            isRecording: false,
          }));
          break;
        case 'network':
          setState(prev => ({
            ...prev,
            error: 'Network error occurred. Please check your connection.',
            isRecording: false,
          }));
          break;
        default:
          if (event.error !== 'no-speech') {
            setState(prev => ({
              ...prev,
              error: event.error,
              isRecording: false,
            }));
          }
      }
    };

    recognition.onend = () => {
      console.log('Recording ended - Speech recognition stopped');
      console.log('Manual stop flag:', manualStopRef.current);
      console.log('Current transcript:', transcriptRef.current);
      
      if (!manualStopRef.current) {
        // If it wasn't manually stopped, restart
        try {
          console.log('Attempting to restart recording...');
          recognition.start();
          return;
        } catch (err) {
          console.error('Failed to restart recording:', err);
        }
      }

      // Only send transcript if we manually stopped and have content
      if (transcriptRef.current.length > 0) {
        const fullTranscript = transcriptRef.current.join(' ');
        console.log('Sending final transcript:', fullTranscript);
        onSpeechResult(fullTranscript);
      } else {
        console.log('No transcript to send');
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
  }, [onSpeechResult, userId]);

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