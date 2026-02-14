import React from 'react';
import { Image } from 'lucide-react';
import { TimelineItemLabel } from './timeline-item-label';

interface ImageItemContentProps {
  label?: string;
  data?: {
    thumbnailUrl?: string;
    originalUrl?: string;
    src?: string; // Image source URL - this comes from overlay data
    width?: number;
    height?: number;
    format?: string;
    size?: number; // File size in bytes
    hasTransparency?: boolean;
    colorSpace?: string;
  };
  itemWidth: number;
  itemHeight: number;
  start: number;
  end: number;
  isHovering?: boolean; // Add hover state prop
}

export const ImageItemContent: React.FC<ImageItemContentProps> = ({
  label,
  data,
  itemWidth,
  isHovering = false // Default to false
}) => {
  // Get the image source - prioritize src from overlay data, then fall back to thumbnailUrl or originalUrl
  const imageSource = data?.src || data?.thumbnailUrl || data?.originalUrl;
  
  // If we have an image source and enough width to display it meaningfully
  if (imageSource && itemWidth > 60) {
    return (
      <div className="flex items-center h-full w-full overflow-hidden relative rounded-[3px]">
        {/* Small image thumbnail on the left */}
        <div className="h-full aspect-square flex-shrink-0 mr-2">

            <div className="h-full w-full flex items-center py-2">
            <img
              src={imageSource}
              alt=""
              draggable="false"
              onDragStart={(e) => e.preventDefault()}
              className="h-full w-full rounded-[1px] ml-6 w-auto object-cover"
            />
          </div>
        </div>
        
        {/* Label takes up remaining space */}
        <div className="flex-1 min-w-0">
          <TimelineItemLabel 
            icon={Image}
            label={"IMAGE"}
            defaultLabel="IMAGE"
            isHovering={isHovering}
          />
        </div>
      </div>
    );
  }

  // Fallback to simple label (no image source or small width)
  return (
    <TimelineItemLabel 
      icon={Image}
      label={label}
      defaultLabel="IMAGE"
      isHovering={isHovering} // Pass hover state
    />
  );
}; 