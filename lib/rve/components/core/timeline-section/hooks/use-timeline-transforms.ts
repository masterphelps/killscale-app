import React from 'react';
import { Overlay, OverlayType } from '../../../../types';
import { TimelineTrack, TimelineItem } from '../../../advanced-timeline/types';
import { FPS } from '../../../advanced-timeline/constants';

/**
 * Hook to handle data transformation between overlays and timeline tracks
 */
export const useTimelineTransforms = () => {
  /**
   * Transform overlays to timeline tracks format
   */
  const transformOverlaysToTracks = React.useCallback((overlays: Overlay[]): TimelineTrack[] => {
    // Group overlays by row
    const rowMap = new Map<number, Overlay[]>();
    
    overlays.forEach(overlay => {
      const row = overlay.row || 0;
      if (!rowMap.has(row)) {
        rowMap.set(row, []);
      }
      rowMap.get(row)!.push(overlay);
    });

    // Convert to timeline tracks
    const tracks: TimelineTrack[] = [];
    
    // Ensure we have at least one track
    const maxRow = Math.max(0, ...Array.from(rowMap.keys()));
    
    for (let i = 0; i <= maxRow; i++) {
      const overlaysInRow = rowMap.get(i) || [];
      
      const items: TimelineItem[] = overlaysInRow.map(overlay => {
        const baseItem = {
          id: overlay.id.toString(),
          trackId: `track-${i}`,
          start: overlay.from / FPS, // Convert frames to seconds
          end: (overlay.from + overlay.durationInFrames) / FPS,
          label: getOverlayLabel(overlay),
          type: mapOverlayTypeToTimelineType(overlay.type),
          color: getOverlayColor(overlay.type),
          data: overlay, // Store the original overlay data
        };

        // Add media timing properties for video overlays
        if (overlay.type === OverlayType.VIDEO) {
          const videoOverlay = overlay as any;
          const videoStartTimeSeconds = typeof videoOverlay.videoStartTime === 'number' ? videoOverlay.videoStartTime : 0;
          
          return {
            ...baseItem,
            mediaStart: videoStartTimeSeconds,
            ...(videoOverlay.mediaSrcDuration && { 
              mediaSrcDuration: videoOverlay.mediaSrcDuration,
              mediaEnd: videoStartTimeSeconds + (overlay.durationInFrames / FPS)
            }),
          };
        }

        // Add media timing properties for audio overlays  
        if (overlay.type === OverlayType.SOUND) {
          const audioOverlay = overlay as any;
          // startFromSound is stored in frames, so convert to seconds for mediaStart
          const audioStartTimeSeconds = typeof audioOverlay.startFromSound === 'number' ? audioOverlay.startFromSound / FPS : 0;
          
          return {
            ...baseItem,
            mediaStart: audioStartTimeSeconds,
            mediaEnd: audioStartTimeSeconds + (overlay.durationInFrames / FPS),
            ...(audioOverlay.mediaSrcDuration && { mediaSrcDuration: audioOverlay.mediaSrcDuration }),
          };
        }

        // Return base item for other overlay types
        return baseItem;
      });

      tracks.push({
        id: `track-${i}`,
        name: `Track ${i + 1}`,
        items,
        magnetic: false,
        visible: true,
        muted: false,
      });
    }

    // If no tracks exist, create one empty track
    if (tracks.length === 0) {
      tracks.push({
        id: 'track-0',
        name: 'Track 1',
        items: [],
        magnetic: false,
        visible: true,
        muted: false,
      });
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
      return '#3b82f6'; // blue
    case OverlayType.IMAGE:
      return '#10b981'; // green
    case OverlayType.VIDEO:
      return '#8b5cf6'; // purple
    case OverlayType.SOUND:
      return '#f59e0b'; // amber
    case OverlayType.CAPTION:
      return '#ef4444'; // red
    case OverlayType.STICKER:
      return '#ec4899'; // pink
    case OverlayType.SHAPE:
      return '#6b7280'; // gray
    default:
      return '#9ca3af'; // gray
  }
};