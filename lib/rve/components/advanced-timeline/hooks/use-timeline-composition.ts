import { useMemo } from 'react';
import { TimelineTrack } from '../types';
import { calculateViewportDuration, frameToTime } from '../utils';

export interface UseTimelineCompositionProps {
  tracks: TimelineTrack[];
  totalDuration: number;
  currentFrame: number;
  fps: number;
  zoomScale: number;
}

export interface UseTimelineCompositionReturn {
  compositionDuration: number;
  viewportDuration: number;
  currentTime: number;
}

export const useTimelineComposition = ({ 
  tracks, 
  totalDuration, 
  currentFrame, 
  fps, 
  zoomScale 
}: UseTimelineCompositionProps): UseTimelineCompositionReturn => {
  // Composition duration is the max end across all items; never less than provided totalDuration
  // Tiny 0.5s buffer gives room for the "+" add button after clips
  const compositionDuration = useMemo(() => {
    const maxItemEnd = tracks.reduce((acc, track) => {
      const trackMax = track.items.reduce((m, it) => Math.max(m, it.end), 0);
      return Math.max(acc, trackMax);
    }, 0);
    const contentDuration = Math.max(totalDuration, maxItemEnd);
    return contentDuration + 0.5;
  }, [tracks, totalDuration]);

  const viewportDuration = useMemo(() => 
    calculateViewportDuration(compositionDuration, zoomScale), 
    [compositionDuration, zoomScale]
  );
  
  // Convert current frame to time
  const currentTime = useMemo(() => 
    frameToTime(currentFrame, fps), 
    [currentFrame, fps]
  );

  return {
    compositionDuration,
    viewportDuration,
    currentTime,
  };
}; 