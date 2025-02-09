'use client';

import { useState, useCallback } from 'react';

interface UseCameraProps {
  onImageCapture: (blob: Blob) => void;
  onError?: (error: Error) => void;
}

export function useCamera({ onImageCapture, onError }: UseCameraProps) {
  const [isCapturing, setIsCapturing] = useState(false);

  const startCapture = useCallback(async () => {
    try {
      setIsCapturing(true);
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      // Create video element to show stream
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      // Create canvas to capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');
      context.drawImage(video, 0, 0);
      
      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create image blob'));
          },
          'image/jpeg',
          0.8
        );
      });

      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      
      // Call callback with blob
      onImageCapture(blob);
    } catch (err) {
      console.error('Camera error:', err);
      onError?.(err instanceof Error ? err : new Error('Failed to capture image'));
    } finally {
      setIsCapturing(false);
    }
  }, [onImageCapture, onError]);

  return {
    startCapture,
    isCapturing
  };
} 