import React, { useRef, useEffect, useState } from 'react';
import { TimelineItemContentFactory } from './timeline-item-content-factory';
import { TrackItemType } from '../../types';
import { useWaveformProcessor } from '../../hooks/use-waveform-processor';
import { useThumbnailGenerator } from '../../hooks/use-thumbnail-generator';


interface TimelineItemContentProps {
  label?: string;
  type?: TrackItemType | string;
  data?: any; // Type-specific data
  start?: number;
  end?: number;
  mediaStart?: number; // Media start position in source file
  mediaEnd?: number;   // Media end position in source file
  isHovering?: boolean; // Add hover state prop
  itemId?: string; // Add itemId to identify which item is being resized
  onThumbnailDisplayChange?: (isShowingThumbnails: boolean) => void; // Callback to notify when thumbnails are displayed
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
}

export const TimelineItemContent: React.FC<TimelineItemContentProps> = ({
  label,
  type,
  data,
  start = 0,
  end = 0,
  mediaStart,
  isHovering = false, // Default to false
  itemId,
  onThumbnailDisplayChange,
  currentFrame,
  fps = 30,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Calculate audio content timing - prioritize mediaStart from timeline item, then fall back to data properties
  const audioContentStart = type === TrackItemType.AUDIO 
    ? (mediaStart !== undefined 
        ? mediaStart 
        : (data?.startFromSound !== undefined ? data.startFromSound : 0))
    : 0;

  // Generate waveform data for audio items - ALWAYS generate fresh waveforms
  // This ensures split audio items get correct waveforms for their time segment
  const waveformResult = useWaveformProcessor(
    type === TrackItemType.AUDIO && data?.src ? data.src : undefined,
    audioContentStart, // Start time in seconds
    end - start // Duration in seconds
  );

  // Generate thumbnail data - always call the hook but conditionally pass parameters
  const thumbnailResult = useThumbnailGenerator(
    type === TrackItemType.VIDEO 
      ? {
          videoId: data?.content,
          videoSrc: data?.src || data?.originalUrl,
          duration: end - start,
          itemWidth: dimensions.width,
          itemHeight: dimensions.height
        }
      : {
          videoId: null,
          videoSrc: null,
          duration: 0,
          itemWidth: 0,
          itemHeight: 0
        }
  );

  // Augment data with waveform information for audio items and thumbnail information for video items
  const enhancedData = type === TrackItemType.AUDIO 
    ? { 
        ...data, 
        // Always use the generated waveform for correct timing
        waveformData: waveformResult.data, 
        // Show loading state when generating
        isLoadingWaveform: waveformResult.isLoading 
      }
    : type === TrackItemType.VIDEO
    ? {
        ...data,
        // Pass raw thumbnail data for rendering
        spriteUrl: thumbnailResult.spriteUrl,
        rectForTime: thumbnailResult.rectForTime,
        isLoadingThumbnails: thumbnailResult.isLoading,
        thumbnailError: thumbnailResult.error,
        intervalSec: thumbnailResult.intervalSec,
        mediaStart: mediaStart
      }
    : data;

  // Measure the container dimensions to pass to type-specific components
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateDimensions();
    
    // Update dimensions on resize
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex-1 min-w-0 h-full"
    >
      {/* Keep content visible during resize to allow visual alignment with thumbnails/waveforms */}
      {dimensions.width > 0 && (
        <TimelineItemContentFactory
          type={type}
          label={label}
          data={enhancedData}
          itemWidth={dimensions.width}
          itemHeight={dimensions.height}
          start={start}
          end={end}
          isHovering={isHovering} // Pass hover state to factory
          onThumbnailDisplayChange={onThumbnailDisplayChange} // Pass thumbnail display callback to factory
          currentFrame={currentFrame}
          fps={fps}
        />
      )}
    </div>
  );
}; 