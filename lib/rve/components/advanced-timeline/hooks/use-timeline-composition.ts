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
  const compositionDuration = useMemo(() => {
    const maxItemEnd = tracks.reduce((acc, track) => {
      const trackMax = track.items.reduce((m, it) => Math.max(m, it.end), 0);
      return Math.max(acc, trackMax);
    }, 0);
    return Math.max(totalDuration, maxItemEnd);
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