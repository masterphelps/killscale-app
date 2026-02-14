import React from 'react';
import { TrackItemType } from '../../types';
import {
  VideoItemContent,
  AudioItemContent,
  TextItemContent,
  CaptionItemContent,
  ImageItemContent,
  StickerItemContent,
  BlurItemContent,
} from './type-components';

// Base props that all type-specific components should accept
export interface BaseItemContentProps {
  label?: string;
  data?: any; // Type-specific data structure
  itemWidth: number;
  itemHeight: number;
  start: number;
  end: number;
  isHovering?: boolean; // Add hover state to base interface
  onThumbnailDisplayChange?: (isShowingThumbnails: boolean) => void; // Callback to notify when thumbnails are displayed
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
}

// Props for the factory component
interface TimelineItemContentFactoryProps extends BaseItemContentProps {
  type?: TrackItemType | string;
}

/**
 * Factory component that renders the appropriate type-specific content component
 * based on the timeline item's type. This provides a clean abstraction for
 * type-specific rendering while maintaining a consistent interface.
 */
export const TimelineItemContentFactory: React.FC<TimelineItemContentFactoryProps> = ({
  type,
  label,
  data,
  itemWidth,
  itemHeight,
  start,
  end,
  isHovering = false, // Default to false
  onThumbnailDisplayChange,
  currentFrame,
  fps = 30,
}) => {
  // Common props that all type components receive
  const commonProps = {
    label,
    data,
    itemWidth,
    itemHeight,
    start,
    end,
    isHovering, // Pass hover state to all components
    onThumbnailDisplayChange, // Pass thumbnail display callback to all components
    currentFrame, // Pass current frame to all components
    fps, // Pass fps to all components
  };

  // Select the appropriate component based on type
  switch (type) {
    case TrackItemType.VIDEO:
      return <VideoItemContent {...commonProps} />;
      
    case TrackItemType.AUDIO:
      return <AudioItemContent {...commonProps} />;
      
    case TrackItemType.TEXT:
      return <TextItemContent {...commonProps} />;
      
    case TrackItemType.CAPTION:
      return <CaptionItemContent {...commonProps} />;
      
    case TrackItemType.IMAGE:
      return <ImageItemContent {...commonProps} />;
      
    case TrackItemType.STICKER:
      return <StickerItemContent {...commonProps} />;
      
    case TrackItemType.BLUR:
      return <BlurItemContent {...commonProps} />;
      
    // Handle custom/unknown types with a generic fallback
    default:
      return <DefaultItemContent {...commonProps} type={type} />;
  }
};

/**
 * Default/fallback component for unknown or custom item types
 */
const DefaultItemContent: React.FC<BaseItemContentProps & { type?: string }> = ({
  label,
  type,
  itemWidth,
}) => {
  return (
    <div className="flex items-center h-full w-full overflow-hidden px-2">
      <div className="flex-shrink-0 mr-2">
        <div className="w-4 h-4 bg-white/40 rounded border border-white/60" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="truncate text-xs font-light">
          {label || type || 'Unknown'}
        </div>
        
        {itemWidth > 80 && type && (
          <div className="text-xs text-white/60 truncate">
            Type: {type}
          </div>
        )}
      </div>
    </div>
  );
}; 