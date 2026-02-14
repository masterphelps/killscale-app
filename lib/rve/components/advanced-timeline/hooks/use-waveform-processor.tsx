import { useState, useEffect, useRef } from 'react';

interface WaveformData {
  peaks: number[];
  length: number;
}

interface WaveformResult {
  data: WaveformData | null;
  isLoading: boolean;
}

// Global waveform cache to store processed waveform data
// Key format: "src:startTime:duration" 
const waveformCache = new Map<string, WaveformData>();

/**
 * Simple, reliable waveform processor hook with caching
 * Generates waveform data for audio timeline items
 */
export function useWaveformProcessor(
  src: string | undefined,
  startTime: number = 0, // in seconds
  duration: number // in seconds
): WaveformResult {
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Clear previous data
    setWaveformData(null);
    
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!src || duration <= 0) {
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cacheKey = `${src}:${startTime.toFixed(3)}:${duration.toFixed(3)}`;
    const cachedData = waveformCache.get(cacheKey);
    if (cachedData) {
      setWaveformData(cachedData);
      setIsLoading(false);
      return;
    }

    const generateWaveform = async () => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      setIsLoading(true);

      try {
        const response = await fetch(src, { signal: abortController.signal });
        const arrayBuffer = await response.arrayBuffer();
        
        if (abortController.signal.aborted) return;

        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        if (abortController.signal.aborted) return;

        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        
        // Calculate the sample range for the requested time slice
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor((startTime + duration) * sampleRate);
        const clampedStartSample = Math.max(0, Math.min(startSample, channelData.length));
        const clampedEndSample = Math.max(clampedStartSample, Math.min(endSample, channelData.length));
        
        // Generate peaks for the time slice (aim for ~100 peaks per second of audio)
        const targetPeaks = Math.max(10, Math.floor(duration * 100));
        const samplesPerPeak = Math.max(1, Math.floor((clampedEndSample - clampedStartSample) / targetPeaks));
        
        const peaks: number[] = [];
        
        for (let i = clampedStartSample; i < clampedEndSample; i += samplesPerPeak) {
          let peak = 0;
          const end = Math.min(i + samplesPerPeak, clampedEndSample);
          
          // Calculate RMS for this segment
          let sum = 0;
          let count = 0;
          
          for (let j = i; j < end; j++) {
            if (j < channelData.length) {
              const sample = Math.abs(channelData[j]);
              sum += sample * sample;
              count++;
              peak = Math.max(peak, sample);
            }
          }
          
          // Use RMS value for more consistent visualization
          const rms = count > 0 ? Math.sqrt(sum / count) : 0;
          peaks.push(rms);
        }
        
        // Normalize peaks
        const maxPeak = Math.max(...peaks, 0.001); // Avoid division by zero
        const normalizedPeaks = peaks.map(peak => peak / maxPeak);
        
        const result = {
          peaks: normalizedPeaks,
          length: clampedEndSample - clampedStartSample
        };

        if (!abortController.signal.aborted) {
          setWaveformData(result);
          // Store in cache for future use
          waveformCache.set(cacheKey, result);
        }
      } catch (error) {
        console.error('Error processing audio waveform:', error);
        if (!abortController.signal.aborted) {
          setWaveformData(null);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    generateWaveform();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [src, startTime, duration]);

  return { data: waveformData, isLoading };
}

// Utility function to clear any cached data if needed
export function clearWaveformCache(): void {
  // No-op for now since we're not caching
} 