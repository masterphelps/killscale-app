import React from 'react';
import { Smile } from 'lucide-react';
import { TimelineItemLabel } from './timeline-item-label';

interface StickerItemContentProps {
  label?: string;
  data?: {
    stickerUrl?: string;
    previewUrl?: string;
    isAnimated?: boolean;
    category?: string;
    tags?: string[];
    frameCount?: number;
    duration?: number; // For animated stickers
    format?: 'gif' | 'lottie' | 'png' | 'svg';
  };
  itemWidth: number;
  itemHeight: number;
  isHovering?: boolean; // Add hover state prop
}

export const StickerItemContent: React.FC<StickerItemContentProps> = ({
  label,
  isHovering = false // Default to false
}) => {
  return (
    <TimelineItemLabel 
      icon={Smile}
      label={label}
      defaultLabel="STICKER"
      isHovering={isHovering} // Pass hover state
    />
  );
}; 