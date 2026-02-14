import { useState, useCallback } from 'react';
import { Caption } from '../types';

interface GenerateCaptionsParams {
  videoSrc: string;
  language?: string;
  outputFormat?: string;
}

export const useAICaptions = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isError, setIsError] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Check if AI service is configured (has API key)
  // TODO: Lots of work to do here relating to ai integrations.
  const isServiceReady = false;

  const generateCaptions = useCallback(async (params: GenerateCaptionsParams): Promise<Caption[]> => {
    setIsProcessing(true);
    setIsCompleted(false);
    setIsError(false);
    setError(null);
    setProgress(0);

    try {
      // If no API key, return demo captions
      if (!isServiceReady) {
        // Simulate processing
        for (let i = 0; i <= 100; i += 10) {
          setProgress(i);
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Return demo captions
        const demoCaptions: Caption[] = [
          {
            text: "This is a demo caption.",
            startMs: 0,
            endMs: 2000,
            timestampMs: null,
            confidence: 0.95,
            words: [
              { word: "This", startMs: 0, endMs: 300, confidence: 0.95 },
              { word: "is", startMs: 300, endMs: 500, confidence: 0.95 },
              { word: "a", startMs: 500, endMs: 600, confidence: 0.95 },
              { word: "demo", startMs: 600, endMs: 1000, confidence: 0.95 },
              { word: "caption.", startMs: 1000, endMs: 2000, confidence: 0.95 },
            ]
          },
          {
            text: "AI service not configured.",
            startMs: 2500,
            endMs: 4500,
            timestampMs: null,
            confidence: 0.95,
            words: [
              { word: "AI", startMs: 2500, endMs: 2800, confidence: 0.95 },
              { word: "service", startMs: 2800, endMs: 3300, confidence: 0.95 },
              { word: "not", startMs: 3300, endMs: 3600, confidence: 0.95 },
              { word: "configured.", startMs: 3600, endMs: 4500, confidence: 0.95 },
            ]
          }
        ];

        setIsCompleted(true);
        setProgress(100);
        return demoCaptions;
      }

      // Call the AI service
      setProgress(25);
      const response = await fetch('/api/ai/captions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      setProgress(75);

      if (!response.ok) {
        throw new Error(`AI service error: ${response.status}`);
      }

      const result = await response.json();
      setProgress(100);
      setIsCompleted(true);

      return result.captions || [];

    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      return [];
    } finally {
      setIsProcessing(false);
    }
  }, [isServiceReady]);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setIsCompleted(false);
    setIsError(false);
    setProgress(undefined);
    setError(null);
  }, []);

  return {
    generateCaptions,
    isProcessing,
    isCompleted,
    isError,
    isServiceReady,
    progress,
    error,
    reset,
  };
}; 