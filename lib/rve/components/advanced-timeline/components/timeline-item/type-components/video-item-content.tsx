import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Video, Loader2, Text } from 'lucide-react';
import { TimelineItemLabel } from './timeline-item-label';
import { OverlayMediaSegment } from '../../../../../types';
import { sourceFrameAtOutputFrame } from '../../../../../utils/general/render-segments';
import { ThumbnailRect } from '../../../../../utils/general/thumbnail-cache';

interface VideoItemContentProps {
  label?: string;
  data?: {
    duration?: number;
    fps?: number;
    resolution?: string;
    originalUrl?: string;
    segments?: OverlayMediaSegment[];
    src?: string;
    width?: number;
    height?: number;
    spriteUrl?: string | null;
    rectForTime?: ((timestampSec: number) => ThumbnailRect) | null;
    isLoadingThumbnails?: boolean;
    thumbnailError?: string | null;
    intervalSec?: number;
    mediaStart?: number;
  };
  itemWidth: number;
  itemHeight: number;
  start: number;
  end: number;
  isHovering?: boolean;
  onThumbnailDisplayChange?: (isShowingThumbnails: boolean) => void;
}

// We might resize thumbnails to better fit them depending on the intervalSec
// in which case we center the thumbnail in the width we use.  This number is the minimum
// size we're allowed to reduce the thumbnail width to make sure things don't look squished.
const MIN_THUMBNAIL_WIDTH = 40;

/**
 * Hook that delays visibility of something (like a spinner) until
 * the condition has been true for at least `delayMs`.
 */
function useDelayVisible(active: boolean, delayMs = 1000) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const id = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(id);
  }, [active, delayMs]);

  return visible;
}

export const VideoItemContent: React.FC<VideoItemContentProps> = ({
  label,
  data,
  itemWidth,
  itemHeight,
  start,
  end,
  isHovering = false,
  onThumbnailDisplayChange
}) => {
  const showLabelOnHover = false;
  const videoSrc = data?.src || data?.originalUrl;

  const spriteUrl = data?.spriteUrl;
  const rectForTime = data?.rectForTime;
  const isLoadingThumbnails = data?.isLoadingThumbnails || false;
  const thumbnailError = data?.thumbnailError;
  const segments = useMemo(() => data?.segments || [], [data?.segments]);
  const fps = data?.fps || 30;
  const intervalSec = data?.intervalSec || 5;
  const mediaStart = data?.mediaStart || 0;
  const isShowingThumbnails = !!spriteUrl && !!rectForTime && !isLoadingThumbnails;

  // Delayed spinner logic
  const showLoading = useDelayVisible(isLoadingThumbnails && !!videoSrc, 1000);

  useEffect(() => {
    let shouldShowThumbnails: boolean;
    
    if (isLoadingThumbnails && !showLoading) {
      // If we're loading, but we have old thumbnails then keep showing them until it's been a second so
      // there isn't flickering...
      shouldShowThumbnails = !!(spriteUrl && rectForTime);
    } else {
      shouldShowThumbnails = isShowingThumbnails;
    }
    
    onThumbnailDisplayChange?.(shouldShowThumbnails);
  }, [isShowingThumbnails, isLoadingThumbnails, showLoading, spriteUrl, rectForTime, onThumbnailDisplayChange]);

  const hoverOverlay = useMemo(() => {
    if (!showLabelOnHover || (!isHovering && itemWidth >= 80)) {
      return null;
    }
    return (
      <div className="absolute inset-0 bg-white/10 backdrop-blur-xs">
        <TimelineItemLabel
          icon={Video}
          label={"VIDEO"}
          defaultLabel="VIDEO"
          isHovering={isHovering}
        />
      </div>
    );
  }, [isHovering, itemWidth, showLabelOnHover]);

  const [spriteNaturalSize, setSpriteNaturalSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!spriteUrl) {
      setSpriteNaturalSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => setSpriteNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setSpriteNaturalSize(null);
    img.src = spriteUrl;
  }, [spriteUrl]);

  // Memoized optimal thumbnail width calculation
  const optimalThumbnailWidth = useMemo(() => {
    if (!rectForTime) return MIN_THUMBNAIL_WIDTH;
    
    const rect0 = rectForTime(0);
    const rect0Width = rect0?.width || MIN_THUMBNAIL_WIDTH;
    const rect0Height = rect0?.height || itemHeight;
    const baseScale = Math.max(1, itemHeight / rect0Height);

    const minWidth = Math.min(rect0Width, MIN_THUMBNAIL_WIDTH);
    const maxWidth = Math.max(minWidth, Math.floor(rect0Width * baseScale));
    const timePerPixel = (end - start) / itemWidth;
    const pixelsForInterval = Math.max(1, Math.floor(intervalSec / timePerPixel));

    // Find width in [minWidth, maxWidth] that divides pixelsForInterval most evenly
    // Check for perfect divisors first (prefer larger widths for better quality)
    for (let width = maxWidth; width >= minWidth; width--) {
      if (pixelsForInterval % width === 0) return width;
    }
    
    // No perfect divisor - find width with smallest normalized remainder
    let bestWidth = minWidth;
    let bestRemainder = Infinity;
    for (let width = minWidth; width <= maxWidth; width++) {
      const remainder = pixelsForInterval % width;
      const normalizedRemainder = Math.min(remainder, width - remainder);
      if (normalizedRemainder < bestRemainder) {
        bestRemainder = normalizedRemainder;
        bestWidth = width;
      }
    }
    return bestWidth;
  }, [rectForTime, itemHeight, end, start, itemWidth, intervalSec]);

  // Helper function to render thumbnails
  const renderThumbnails = useCallback(() => {
    if (!spriteUrl || !rectForTime) return null;

    const thumbnailWidth = optimalThumbnailWidth;
    const thumbnailCount = Math.ceil(itemWidth / thumbnailWidth);
    const timePerPixel = (end - start) / itemWidth;
    
    return (
      <div className="flex items-center h-full w-full overflow-hidden relative rounded-[3px]">
        {/* Thumbnail strip */}
        <div className="flex-1 flex h-full">
          {Array.from({ length: thumbnailCount }, (_, index) => {
            const timestamp = mediaStart + (index * thumbnailWidth * timePerPixel);
            const outputFrame = Math.ceil(timestamp * fps);
            const sourceFrame = sourceFrameAtOutputFrame(segments, outputFrame);
            const sourceTimestamp = Math.max(0, Math.floor(sourceFrame / fps));
            const rect = rectForTime(sourceTimestamp);
            const scale = Math.max(1, itemHeight / rect.height);
            const scaledRectWidth = rect.width * scale;
            let centeredX = rect.x * scale;
            if (thumbnailWidth < scaledRectWidth) {
              const offset = (scaledRectWidth - thumbnailWidth) / 2;
              centeredX = rect.x * scale + offset;
            }

            let backgroundSize: string | undefined = 'auto';
            if (spriteNaturalSize) {
              backgroundSize = `${spriteNaturalSize.w * scale}px ${spriteNaturalSize.h * scale}px`;
            }

            return (
              <div
                x-data={`timestamp: ${timestamp.toFixed(3)}, sourceTimestamp: ${sourceTimestamp.toFixed(3)}, gridIndex: ${rect.index}`}                
                key={index}
                className="flex-shrink-0 last:border-r-0 overflow-hidden"
                style={{ width: `${thumbnailWidth}px`, height: `${itemHeight}px` }}
              >
                <div
                  className="w-full h-full bg-cover bg-no-repeat opacity-90"
                  style={{
                    backgroundImage: `url(${spriteUrl})`,
                    backgroundPosition: `-${centeredX}px -${rect.y * scale}px`,
                    backgroundSize,
                    backgroundRepeat: 'no-repeat'
                  }}
                />
              </div>
            );
          })}
        </div>
        {hoverOverlay}
      </div>
    );
  }, [spriteUrl, rectForTime, optimalThumbnailWidth, itemWidth, end, start, mediaStart, fps, segments, itemHeight, spriteNaturalSize, hoverOverlay]);

  // Show thumbnails if we have them and they're ready and loading has been going for less than 1 second
  if (spriteUrl && rectForTime && (isShowingThumbnails || (isLoadingThumbnails && !showLoading))) {
    return renderThumbnails();
  }

  // Show loading spinner if we're loading for more than 1 second or don't have thumbnails yet.
  if (showLoading || (isLoadingThumbnails && (!spriteUrl || !rectForTime))) {
    return (
      <TimelineItemLabel
        icon={Loader2}
        label={"Loading..."}
        defaultLabel="VIDEO"
        iconClassName="w-4 h-4 animate-spin text-white/60"
        isHovering={isHovering}
      />
    );
  }

  // Show error state if thumbnail generation failed
  if (thumbnailError) {
    return (
      <TimelineItemLabel
        icon={Video}
        label={"VIDEO"}
        defaultLabel="VIDEO"
        iconClassName="w-4 h-4 text-red-400"
        isHovering={isHovering}
      />
    );
  }

  // Fallback to simple label (no video source or small width)
  return (
    <TimelineItemLabel
      icon={Video}
      label={label}
      defaultLabel="VIDEO"
      isHovering={isHovering}
    />
  );
};