import React from 'react';
import { useVerticalResize } from '../../../../hooks/use-vertical-resize';
import { TIMELINE_CONSTANTS } from '../../../advanced-timeline/constants';
import { Overlay, OverlayType } from '../../../../types';

interface UseTimelineResizeOptions {
  overlays: Overlay[];
}

/**
 * Constants for timeline height calculations
 */
const HEIGHT_CONSTANTS = {
  /** Reserved space for editor header and minimum video player */
  RESERVED_VIEWPORT_SPACE: 260,
  /** Minimum timeline height to ensure usability */
  MIN_TIMELINE_HEIGHT: 300,
  /** Additional padding for timeline (scrollbar + comfortable viewing) */
  TIMELINE_PADDING: 67,
  /** Number of fixed section slots (Overlays, Captions, Media, Audio) */
  SECTION_COUNT: 4,
} as const;

/**
 * Custom hook for managing timeline resize functionality
 * Calculates dynamic max height based on track count and manages resize state
 * Auto-expands timeline height when new tracks are added
 */
export const useTimelineResize = ({ overlays }: UseTimelineResizeOptions) => {
  /**
   * Calculate the number of tracks based on section-aware layout.
   *
   * The timeline always has 4 sections (overlays, captions, media, audio),
   * each with at least 1 track. Within a section, each unique `row` value
   * used by overlays of that section type adds a track.
   */
  const trackCount = React.useMemo(() => {
    // Map overlay type → section
    const sectionRows: Record<string, Set<number>> = {
      overlays: new Set<number>(),
      captions: new Set<number>(),
      media: new Set<number>(),
      audio: new Set<number>(),
    };

    for (const overlay of overlays) {
      const row = overlay.row || 0;
      const t = overlay.type;
      // Match getOverlaySection in use-timeline-transforms.ts
      if (t === OverlayType.VIDEO) sectionRows.media.add(row);
      else if (t === OverlayType.SOUND) sectionRows.audio.add(row);
      else if (t === OverlayType.CAPTION) sectionRows.captions.add(row);
      else sectionRows.overlays.add(row);
    }

    // Each section contributes at least 1 track (the empty placeholder)
    return Object.values(sectionRows).reduce(
      (sum, rows) => sum + Math.max(1, rows.size),
      0,
    );
  }, [overlays]);

  // Track previous track count to detect when new tracks are added
  const prevTrackCountRef = React.useRef(trackCount);
  
  // Track previous bottomHeight to avoid dependency issues in auto-expand effect
  const prevBottomHeightRef = React.useRef(0);

  /**
   * Height that shows ALL section tracks without scrolling.
   * Also used as the max height for the resize handle.
   * Includes 3 section-divider pixels (between the 4 sections).
   */
  const allSectionsHeight = React.useMemo(() => {
    const dividerPixels = (HEIGHT_CONSTANTS.SECTION_COUNT - 1); // 1px per divider
    return TIMELINE_CONSTANTS.MARKERS_HEIGHT +
           (trackCount * TIMELINE_CONSTANTS.TRACK_HEIGHT) +
           dividerPixels +
           HEIGHT_CONSTANTS.TIMELINE_PADDING;
  }, [trackCount]);

  /**
   * Vertical resize functionality for timeline with dynamic max height.
   *
   * We DON'T persist height to localStorage — the timeline always opens
   * fully expanded to show every section track. Users can resize during
   * the session but each new editor session starts expanded.
   */
  const { bottomHeight, isResizing, handleMouseDown, handleTouchStart, setHeight } = useVerticalResize({
    initialHeight: allSectionsHeight,
    minHeight: 155,
    maxHeight: allSectionsHeight,
    // No storageKey — don't persist height across sessions
  });

  /**
   * Ensure the timeline is always tall enough to show all sections.
   * When tracks are added (or on first mount), expand to fit.
   */
  const hasMountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!hasMountedRef.current) {
      // On first mount, always expand to show all sections
      hasMountedRef.current = true;
      setHeight(allSectionsHeight);
      prevTrackCountRef.current = trackCount;
      return;
    }

    const prevCount = prevTrackCountRef.current;
    if (trackCount > prevCount) {
      // New tracks added — expand to fit
      const newRows = trackCount - prevCount;
      const additionalHeight = newRows * TIMELINE_CONSTANTS.TRACK_HEIGHT;
      setHeight(prevBottomHeightRef.current + additionalHeight);
    }
    prevTrackCountRef.current = trackCount;
  }, [trackCount, allSectionsHeight, setHeight]);

  /**
   * Keep the bottomHeight ref in sync
   */
  React.useEffect(() => {
    prevBottomHeightRef.current = bottomHeight;
  }, [bottomHeight]);

  return {
    bottomHeight,
    isResizing,
    handleMouseDown,
    handleTouchStart,
    trackCount,
    allSectionsHeight,
  };
};

