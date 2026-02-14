/**
 * VideoPreview Component
 *
 * A reusable component for displaying video overlay previews.
 * Shows the video thumbnail with proper aspect ratio and styling.
 *
 * @component
 */

import React, { useState } from "react";
import { ClipOverlay } from "../../../types";
import { RefreshCw } from "lucide-react";
import { Button } from "../../ui/button";

interface VideoPreviewProps {
  /** The video overlay to preview */
  overlay: ClipOverlay;
  /** Optional CSS class name for additional styling */
  className?: string;
  /** Callback function to initiate video replacement */
  onChangeVideo?: () => void;
}

/**
 * VideoPreview component for displaying video overlay thumbnails
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({
  overlay,
  className = "",
  onChangeVideo,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if(!overlay.content) {
    return null;
  }

  return (
    <div 
      className={`relative aspect-16/5 overflow-hidden rounded-sm border bg-background group ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={overlay.content}
        alt="Video preview"
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          filter: overlay.styles?.filter || 'none',
          opacity: overlay.styles?.opacity ?? 1,
        }}
      />
      
      {/* Change Video Button - appears on hover */}
      {onChangeVideo && (
        <div 
          className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Button
            onClick={onChangeVideo}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className="w-3 h-3" />
            Change Video
          </Button>
        </div>
      )}
    </div>
  );
};