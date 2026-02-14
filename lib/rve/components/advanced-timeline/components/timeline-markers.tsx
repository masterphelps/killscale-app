import React, { useCallback } from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineMarkersProps {
  totalDuration: number;
  onTimeClick?: (timeInSeconds: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  zoomScale?: number;
}

// Helper function to format time properly for different durations
const formatTime = (timeInSeconds: number, totalDuration: number): string => {
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.round(timeInSeconds % 60);
  
  // For videos under 1 minute, show seconds only
  if (totalDuration < 60) {
    return `${Math.round(timeInSeconds * 10) / 10}s`;
  }
  
  // For videos under 1 hour
  if (totalDuration < 3600) {
    // If it's exactly on a minute boundary, show just minutes
    if (seconds === 0) {
      return minutes === 0 ? '0s' : `${minutes}m`;
    }
    // If it's under 1 minute, show seconds only
    if (minutes === 0) {
      return `${seconds}s`;
    }
    // Otherwise show MM:SS format (professional standard)
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  
  // For videos 1 hour or longer
  if (hours > 0) {
    // If it's exactly on an hour boundary
    if (minutes === 0 && seconds === 0) {
      return `${hours}h`;
    }
    // If it's on a minute boundary, use H:MM format
    if (seconds === 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
    // Full H:MM:SS format for professional look
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  
  // Fallback
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// Industry-standard timeline intervals (in seconds)
// These are the standard intervals used by professional video editors
const TIMELINE_INTERVALS = [
  0.1,    // 100ms - for frame-accurate editing
  0.2,    // 200ms
  0.5,    // 500ms
  1,      // 1 second
  2,      // 2 seconds  
  5,      // 5 seconds
  10,     // 10 seconds
  15,     // 15 seconds
  30,     // 30 seconds
  60,     // 1 minute
  120,    // 2 minutes
  300,    // 5 minutes
  600,    // 10 minutes
  900,    // 15 minutes
  1800,   // 30 minutes
  3600,   // 1 hour
];

// Calculate the optimal interval based on zoom and duration
const calculateOptimalInterval = (totalDuration: number, zoomScale: number): number => {
  // Calculate how much time should be represented by each pixel
  // Assuming a typical timeline width of ~1000px
  const timelineWidthPx = 1000;
  const timePerPixel = totalDuration / (timelineWidthPx * zoomScale);
  
  // We want major markers roughly every 80-120 pixels for good readability
  const targetPixelSpacing = 100;
  const targetTimeSpacing = timePerPixel * targetPixelSpacing;
  
  // Find the closest standard interval
  let bestInterval = TIMELINE_INTERVALS[0];
  for (const interval of TIMELINE_INTERVALS) {
    if (interval >= targetTimeSpacing) {
      bestInterval = interval;
      break;
    }
    bestInterval = interval;
  }
  
  return bestInterval;
};

export const TimelineMarkers: React.FC<TimelineMarkersProps> = ({
  totalDuration,
  onTimeClick,
  onDragStateChange,
  zoomScale = 1
}) => {
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;
    
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    let hasMoved = false;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      
      // If mouse has moved more than 3 pixels, consider it a drag
      if (deltaX > 3 || deltaY > 3) {
        if (!hasMoved) {
          hasMoved = true;
          onDragStateChange?.(true);
        }
        
        // Continue dragging - use the timeline markers container
        const container = document.querySelector('.timeline-markers-container') as HTMLElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const clickPosition = Math.max(0, Math.min(1, x / rect.width));
          const timeInSeconds = clickPosition * totalDuration;
          
          // Set the exact position for the timeline marker to match during drag
          const positionPercentage = clickPosition * 100;
          const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }
          
          onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      
      if (!hasMoved) {
        // This was a click, not a drag
        const container = document.querySelector('.timeline-markers-container') as HTMLElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickPosition = clickX / rect.width;
          const timeInSeconds = clickPosition * totalDuration;
          
          if (timeInSeconds >= 0 && timeInSeconds <= totalDuration) {
            // Set the exact click position for the timeline marker to match
            const positionPercentage = clickPosition * 100;
            const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
            if (rootContainer) {
              rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
            }
            
            onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
          }
        }
      }
      
      onDragStateChange?.(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [onTimeClick, totalDuration, onDragStateChange]);

  // Touch event handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;
    
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    if (!touch) return;

    const startX = touch.clientX;
    const startY = touch.clientY;

    // Add haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    let hasMoved = false;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);
      
      // If touch has moved more than 3 pixels, consider it a drag
      if (deltaX > 3 || deltaY > 3) {
        if (!hasMoved) {
          hasMoved = true;
          onDragStateChange?.(true);
        }
        
        // Continue dragging
        const container = document.querySelector('.timeline-markers-container') as HTMLElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          const x = touch.clientX - rect.left;
          const clickPosition = Math.max(0, Math.min(1, x / rect.width));
          const timeInSeconds = clickPosition * totalDuration;
          
          // Set the exact position for the timeline marker to match during drag
          const positionPercentage = clickPosition * 100;
          const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }
          
          onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      
      if (!hasMoved && e.changedTouches[0]) {
        // This was a tap, not a drag
        const touch = e.changedTouches[0];
        const container = document.querySelector('.timeline-markers-container') as HTMLElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          const clickX = touch.clientX - rect.left;
          const clickPosition = clickX / rect.width;
          const timeInSeconds = clickPosition * totalDuration;
          
          if (timeInSeconds >= 0 && timeInSeconds <= totalDuration) {
            // Set the exact click position for the timeline marker to match
            const positionPercentage = clickPosition * 100;
            const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
            if (rootContainer) {
              rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
            }
            
            onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
          }
        }
      }
      
      onDragStateChange?.(false);
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [onTimeClick, totalDuration, onDragStateChange]);

  const generateMarkers = () => {
    const markers = [];
    
    // Get the optimal interval using industry standards
    const interval = calculateOptimalInterval(totalDuration, zoomScale);
    
    // Calculate minor tick interval (usually 1/5 or 1/2 of major interval)
    let minorInterval: number;
    if (interval >= 60) {
      minorInterval = interval / 5; // For minutes/hours, show 5 minor ticks
    } else if (interval >= 10) {
      minorInterval = interval / 5; // For 10s+, show 5 minor ticks  
    } else if (interval >= 1) {
      minorInterval = interval / 5; // For seconds, show 5 minor ticks
    } else {
      minorInterval = interval / 2; // For sub-second, show 2 minor ticks
    }

    // Generate minor ticks first
    for (let time = 0; time <= totalDuration; time += minorInterval) {
      const isMajor = Math.abs(time % interval) < 0.001; // Account for floating point precision
      const positionPercentage = (time / totalDuration) * 100;

      if (!isMajor) {
        markers.push(
          <div
            key={`minor-${time}`}
            className="absolute"
            style={{
              left: `${positionPercentage}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="w-px bg-gray-400 dark:bg-gray-400 h-1.5 opacity-60" />
          </div>
        );
      }
    }

    // Generate major ticks with labels
    for (let time = 0; time <= totalDuration; time += interval) {
      const positionPercentage = (time / totalDuration) * 100;

      markers.push(
        <div
          key={`major-${time}`}
          className="absolute flex flex-col items-center"
          style={{
            left: `${positionPercentage}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="w-px bg-gray-400 dark:bg-gray-400 h-3" />
          <span className="text-xs mt-1 select-none whitespace-nowrap text-text-secondary">
            {formatTime(time, totalDuration)}
          </span>
        </div>
      );
    }

    return markers;
  };

  return (
    <div
      className="relative bg-background border-b border-border cursor-pointer w-full timeline-markers-container"
      style={{ 
        height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px`,
        minWidth: zoomScale >= 1.0 ? "100%" : "auto"
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {generateMarkers()}
    </div>
  );
};