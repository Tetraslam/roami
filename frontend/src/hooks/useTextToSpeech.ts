'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useTextToSpeech() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesLoadedRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoadedRef.current = true;
      }
    };

    // Try loading voices immediately
    loadVoices();
    
    // Also listen for voices changed event
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const speak = useCallback((text: string | undefined | null) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (!text) {
      console.warn('TTS: No text provided to speak');
      return;
    }

    try {
      if (isSpeakingRef.current) {
        window.speechSynthesis.cancel();
      }

      // Remove URLs from text before speaking
      const textWithoutUrls = text.toString().replace(/https?:\/\/[^\s]+/g, 'link');
      
      const utterance = new SpeechSynthesisUtterance(textWithoutUrls);
      utteranceRef.current = utterance;

      // Get available voices
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(
        (voice) => voice.lang.startsWith('en-') && !voice.localService
      ) || voices.find(voice => voice.lang.startsWith('en-'));

      if (englishVoice) {
        utterance.voice = englishVoice;
        utterance.lang = englishVoice.lang;
      }

      // Configure utterance
      utterance.rate = 1.2;
      utterance.pitch = 1.0;
      utterance.volume = 0.5;

      // Add event handlers
      utterance.onstart = () => {
        isSpeakingRef.current = true;
      };

      utterance.onend = () => {
        isSpeakingRef.current = false;
      };

      utterance.onerror = (event) => {
        console.error('TTS Error:', event.error);
        isSpeakingRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('TTS Error:', err);
      isSpeakingRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    if (window.speechSynthesis && isSpeakingRef.current) {
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
    }
  }, []);

  return { speak, stop };
} 