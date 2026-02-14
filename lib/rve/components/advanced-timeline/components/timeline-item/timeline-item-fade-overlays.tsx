import React, { useMemo } from 'react';

// Visual constants for fade overlays
const FADE_LINE_STROKE_WIDTH = 1.5;
const FADE_LINE_OPACITY = 0.4;
const FADE_OVERLAY_OPACITY = 0.35;

/**
 * FadeOverlays Component
 * 
 * Renders visual fade in/out effects as diagonal lines on timeline items
 */
export const TimelineItemFadeOverlays: React.FC<{
  fadeIn?: number;
  fadeOut?: number;
  duration: number;
}> = React.memo(({ fadeIn = 0, fadeOut = 0, duration }) => {
  // Memoize all calculations
  const { fadeInPercent, fadeOutPercent } = useMemo(() => {
    // Ensure non-negative values
    const safeFadeIn = Math.max(0, fadeIn);
    const safeFadeOut = Math.max(0, fadeOut);
    
    // Prevent fade overlays from crossing over each other
    // If fadeIn + fadeOut > duration, scale them proportionally
    let adjustedFadeIn = safeFadeIn;
    let adjustedFadeOut = safeFadeOut;
    
    const totalFade = safeFadeIn + safeFadeOut;
    if (totalFade > duration && duration > 0) {
      // Scale both fades proportionally so they sum to the duration
      const scaleFactor = duration / totalFade;
      adjustedFadeIn = safeFadeIn * scaleFactor;
      adjustedFadeOut = safeFadeOut * scaleFactor;
    }
    
    // Calculate percentages for the fade regions using adjusted values
    const fadeInPercent = duration > 0 ? Math.min((adjustedFadeIn / duration) * 100, 100) : 0;
    const fadeOutPercent = duration > 0 ? Math.min((adjustedFadeOut / duration) * 100, 100) : 0;
    
    return { fadeInPercent, fadeOutPercent };
  }, [fadeIn, fadeOut, duration]);
  
  // Early return if no fades
  if (fadeIn === 0 && fadeOut === 0) return null;
  
  return (
    <>
      {/* Fade In - Diagonal line from bottom-left to top-right */}
      {fadeIn > 0 && fadeInPercent > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 pointer-events-none z-10"
          style={{
            width: `${fadeInPercent}%`,
          }}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {/* Diagonal line from bottom-left to top-right */}
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="0"
              stroke={`rgba(255, 255, 255, ${FADE_LINE_OPACITY})`}
              strokeWidth={FADE_LINE_STROKE_WIDTH}
              vectorEffect="non-scaling-stroke"
            />
            {/* Gray out the top-left triangle (above the fade line) */}
            <polygon
              points="0,0 100,0 0,100"
              fill={`rgba(0, 0, 0, ${FADE_OVERLAY_OPACITY})`}
            />
          </svg>
        </div>
      )}
      
      {/* Fade Out - Diagonal line from top-left to bottom-right */}
      {fadeOut > 0 && fadeOutPercent > 0 && (
        <div
          className="absolute right-0 top-0 bottom-0 pointer-events-none z-10"
          style={{
            width: `${fadeOutPercent}%`,
          }}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {/* Diagonal line from top-left to bottom-right */}
            <line
              x1="0"
              y1="0"
              x2="100"
              y2="100"
              stroke={`rgba(255, 255, 255, ${FADE_LINE_OPACITY})`}
              strokeWidth={FADE_LINE_STROKE_WIDTH}
              vectorEffect="non-scaling-stroke"
            />
            {/* Gray out the top-right triangle (above the fade line) */}
            <polygon
              points="0,0 100,0 100,100"
              fill={`rgba(0, 0, 0, ${FADE_OVERLAY_OPACITY})`}
            />
          </svg>
        </div>
      )}
    </>
  );
});

TimelineItemFadeOverlays.displayName = 'TimelineItemFadeOverlays';
