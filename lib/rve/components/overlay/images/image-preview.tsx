/**
 * ImagePreview Component
 *
 * A reusable component for displaying image overlay previews.
 * Shows the image with proper aspect ratio and styling.
 *
 * @component
 */

import React, { useState } from "react";
import { ImageOverlay } from "../../../types";
import { RefreshCw } from "lucide-react";
import { Button } from "../../ui/button";


interface ImagePreviewProps {
  /** The image overlay to preview */
  overlay: ImageOverlay;
  /** Optional CSS class name for additional styling */
  className?: string;
  /** Callback function to initiate image replacement */
  onChangeImage?: () => void;
}

/**
 * ImagePreview component for displaying image overlay thumbnails
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({
  overlay,
  className = "",
  onChangeImage,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if(!overlay.src) {
    console.error("No src found for image overlay", overlay);
    return null;
  }

  return (
    <div 
      className={`relative aspect-16/5 w-full overflow-hidden rounded-sm border border-border bg-muted/40 group ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={overlay.src}
        alt="Image preview"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: overlay.styles?.filter || 'none',
          opacity: overlay.styles?.opacity ?? 1,
          objectFit: overlay.styles?.objectFit || 'cover'
        }}
      />
      
      {/* Change Image Button - appears on hover */}
      {onChangeImage && (
        <div 
          className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Button
            onClick={onChangeImage}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className="w-3 h-3" />
            Change Image
          </Button>
        </div>
      )}
    </div>
  );
}; 