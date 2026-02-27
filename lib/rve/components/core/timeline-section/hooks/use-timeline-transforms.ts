import React from 'react';
import { Overlay, OverlayType } from '../../../../types';
import { TimelineTrack, TimelineItem, TimelineSection } from '../../../advanced-timeline/types';
import { FPS } from '../../../advanced-timeline/constants';

/** Fixed section order (top → bottom) */
const SECTION_ORDER: TimelineSection[] = ['overlays', 'captions', 'media', 'audio'];

/** Map overlay type to its timeline section */
const getOverlaySection = (type: OverlayType): TimelineSection => {
  switch (type) {
    case OverlayType.VIDEO:
      return 'media';
    case OverlayType.SOUND:
      return 'audio';
    case OverlayType.CAPTION:
      return 'captions';
    case OverlayType.TEXT:
    case OverlayType.CTA:
    case OverlayType.IMAGE:
    case OverlayType.STICKER:
    case OverlayType.SHAPE:
    default:
      return 'overlays';
  }
};

/**
 * Hook to handle data transformation between overlays and timeline tracks
 */
export const useTimelineTransforms = () => {
  /**
   * Transform overlays to timeline tracks format (grouped by section)
   */
  const transformOverlaysToTracks = React.useCallback((overlays: Overlay[]): TimelineTrack[] => {
    // 1. Classify each overlay into its section
    const sectionOverlays = new Map<TimelineSection, Map<number, Overlay[]>>();
    SECTION_ORDER.forEach(s => sectionOverlays.set(s, new Map()));

    overlays.forEach(overlay => {
      const section = getOverlaySection(overlay.type);
      const rowMap = sectionOverlays.get(section)!;
      const row = overlay.row || 0;
      if (!rowMap.has(row)) {
        rowMap.set(row, []);
      }
      rowMap.get(row)!.push(overlay);
    });

    // 2. Build tracks in fixed section order
    const tracks: TimelineTrack[] = [];
    let trackCounter = 0;

    for (const section of SECTION_ORDER) {
      const rowMap = sectionOverlays.get(section)!;

      if (rowMap.size === 0) {
        // Always emit 1 empty track per section
        tracks.push({
          id: `track-${trackCounter}`,
          items: [],
          magnetic: false,
          visible: true,
          muted: false,
          section,
        });
        trackCounter++;
      } else {
        // Sort rows to preserve relative sub-ordering within section
        const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);

        for (const row of sortedRows) {
          const overlaysInRow = rowMap.get(row)!;
          const trackId = `track-${trackCounter}`;

          const items: TimelineItem[] = overlaysInRow.map(overlay => {
            const baseItem = {
              id: overlay.id.toString(),
              trackId,
              start: overlay.from / FPS,
              end: (overlay.from + overlay.durationInFrames) / FPS,
              label: getOverlayLabel(overlay),
              type: mapOverlayTypeToTimelineType(overlay.type),
              color: getOverlayColor(overlay.type),
              data: overlay,
            };

            if (overlay.type === OverlayType.VIDEO) {
              const videoOverlay = overlay as any;
              const videoStartTimeSeconds = typeof videoOverlay.videoStartTime === 'number' ? videoOverlay.videoStartTime : 0;
              return {
                ...baseItem,
                mediaStart: videoStartTimeSeconds,
                ...(videoOverlay.mediaSrcDuration && {
                  mediaSrcDuration: videoOverlay.mediaSrcDuration,
                  mediaEnd: videoStartTimeSeconds + (overlay.durationInFrames / FPS),
                }),
              };
            }

            if (overlay.type === OverlayType.SOUND) {
              const audioOverlay = overlay as any;
              const audioStartTimeSeconds = typeof audioOverlay.startFromSound === 'number' ? audioOverlay.startFromSound / FPS : 0;
              return {
                ...baseItem,
                mediaStart: audioStartTimeSeconds,
                mediaEnd: audioStartTimeSeconds + (overlay.durationInFrames / FPS),
                ...(audioOverlay.mediaSrcDuration && { mediaSrcDuration: audioOverlay.mediaSrcDuration }),
              };
            }

            return baseItem;
          });

          tracks.push({
            id: trackId,
            items,
            magnetic: false,
            visible: true,
            muted: false,
            section,
          });
          trackCounter++;
        }
      }
    }

    return tracks;
  }, []);

  /**
   * Transform timeline tracks back to overlays
   */
  const transformTracksToOverlays = React.useCallback((tracks: TimelineTrack[]): Overlay[] => {    
    const overlays: Overlay[] = [];
    
    tracks.forEach((track, trackIndex) => {
      track.items.forEach(item => {
        if (item.data && typeof item.data === 'object') {
          // Use the original overlay data if available
          const originalOverlay = item.data as Overlay;
          
          const updatedOverlay: Overlay = {
            ...originalOverlay,
            from: Math.round(item.start * FPS), // Convert seconds to frames
            durationInFrames: Math.round((item.end - item.start) * FPS),
            row: trackIndex,
          };
        

          // Update media timing properties based on timeline item's mediaStart
          if (originalOverlay.type === OverlayType.VIDEO && item.mediaStart !== undefined) {
            // Keep mediaStart in seconds for videoStartTime (video-layer-content.tsx expects seconds)
            (updatedOverlay as any).videoStartTime = item.mediaStart;
          } else if (originalOverlay.type === OverlayType.SOUND && item.mediaStart !== undefined) {
            // Convert mediaStart from seconds back to frames for startFromSound
            (updatedOverlay as any).startFromSound = Math.round(item.mediaStart * FPS);
          }

          overlays.push(updatedOverlay);
        }
      });
    });
   
    return overlays;
  }, []);

  return {
    transformOverlaysToTracks,
    transformTracksToOverlays,
  };
};

/**
 * Get display label for overlay
 */
const getOverlayLabel = (overlay: Overlay): string => {
  // Try to get content from overlay
  let content = '';
  if ('content' in overlay && overlay.content) {
    content = overlay.content;
  }
  
  switch (overlay.type) {
    case OverlayType.TEXT:
      return content || 'Text';
    case OverlayType.IMAGE:
      return content || 'Image';
    case OverlayType.VIDEO:
      return content || 'Video';
    case OverlayType.SOUND:
      return content || 'Audio';
    case OverlayType.CAPTION:
      return 'Caption';
    case OverlayType.STICKER:
      return content || 'Sticker';
    case OverlayType.SHAPE:
      return content || 'Shape';
    case OverlayType.CTA:
      return content || 'CTA';
    default:
      return 'Item';
  }
};

/**
 * Map overlay type to timeline item type
 */
const mapOverlayTypeToTimelineType = (type: OverlayType): string => {
  switch (type) {
    case OverlayType.TEXT:
      return 'text';
    case OverlayType.IMAGE:
      return 'image';
    case OverlayType.VIDEO:
      return 'video';
    case OverlayType.SOUND:
      return 'audio';
    case OverlayType.CAPTION:
      return 'caption';
    case OverlayType.STICKER:
      return 'sticker';
    case OverlayType.SHAPE:
      return 'shape';
    case OverlayType.CTA:
      return 'cta';
    default:
      return 'unknown';
  }
};

/**
 * Get color for overlay type
 */
const getOverlayColor = (type: OverlayType): string => {
  switch (type) {
    case OverlayType.TEXT:
    case OverlayType.IMAGE:
    case OverlayType.STICKER:
    case OverlayType.SHAPE:
    case OverlayType.CTA:
      return '#3b82f6'; // blue — overlays
    case OverlayType.CAPTION:
      return '#8b5cf6'; // purple — captions
    case OverlayType.VIDEO:
      return 'rgba(161, 161, 170, 0.3)'; // zinc — media (thumbnails visible)
    case OverlayType.SOUND:
      return '#f97316'; // orange — audio
    default:
      return '#3b82f6'; // blue
  }
};