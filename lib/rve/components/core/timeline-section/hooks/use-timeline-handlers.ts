import React from 'react';
import { Overlay, OverlayType } from '../../../../types';
import { TimelineTrack } from '../../../advanced-timeline/types';
import { FPS } from '../../../advanced-timeline/constants';
import { useTimelineTransforms } from './use-timeline-transforms';
import { useMediaAdaptors } from '../../../../contexts/media-adaptor-context';
import { useAspectRatio } from '../../../../hooks/use-aspect-ratio';
import { calculateIntelligentAssetSize, getAssetDimensions } from '../../../../utils/asset-sizing';

interface UseTimelineHandlersProps {
  overlays: Overlay[];
  playerRef: React.RefObject<any>;
  setSelectedOverlayId: (id: number | null) => void;
  setSelectedOverlayIds: (ids: number[]) => void;
  deleteOverlay: (id: number) => void;
  duplicateOverlay: (id: number) => void;
  splitOverlay: (id: number, splitFrame: number) => void;
  handleOverlayChange: (overlay: Overlay) => void;
  setOverlays: (overlays: Overlay[]) => void;
  setActivePanel: (panel: OverlayType) => void;
  setIsOpen: (open: boolean) => void;
}

/**
 * Hook to handle timeline event handlers and state management
 */
export const useTimelineHandlers = ({
  overlays,
  playerRef,
  setSelectedOverlayId,
  setSelectedOverlayIds,
  deleteOverlay,
  duplicateOverlay,
  splitOverlay,
  handleOverlayChange,
  setOverlays,
  setActivePanel
}: UseTimelineHandlersProps) => {
  const { transformTracksToOverlays } = useTimelineTransforms();
  const { videoAdaptors, imageAdaptors } = useMediaAdaptors();
  const { getAspectRatioDimensions } = useAspectRatio();
  
  /** Ref to prevent circular updates between overlays and tracks */
  const isUpdatingFromTimelineRef = React.useRef(false);

  // Ref to always hold the latest overlays for merging in handleTracksChange.
  // Timeline tracks store a snapshot of overlay data (item.data) at track-creation time.
  // If overlays are edited through the sidebar (font, position, styles), the timeline's
  // item.data becomes stale because tracksAreEqual only compares timing, not data.
  // Using this ref ensures we always merge with the latest overlay properties.
  const overlaysRef = React.useRef(overlays);
  overlaysRef.current = overlays;

  // Handler for when timeline tracks change
  const handleTracksChange = React.useCallback((newTracks: TimelineTrack[]) => {
    // Set flag to prevent circular updates
    isUpdatingFromTimelineRef.current = true;

    const timelineOverlays = transformTracksToOverlays(newTracks);

    // Merge: take timing/row from timeline, but keep all other properties
    // (styles, position, content, etc.) from the current overlay state.
    // This prevents sidebar edits from being reverted by stale item.data.
    const currentOverlays = overlaysRef.current;
    const mergedOverlays = timelineOverlays.map(tOverlay => {
      const current = currentOverlays.find(o => o.id === tOverlay.id);
      if (current) {
        return {
          ...current,
          from: tOverlay.from,
          durationInFrames: tOverlay.durationInFrames,
          row: tOverlay.row,
          ...((tOverlay as any).videoStartTime !== undefined
            ? { videoStartTime: (tOverlay as any).videoStartTime }
            : {}),
          ...((tOverlay as any).startFromSound !== undefined
            ? { startFromSound: (tOverlay as any).startFromSound }
            : {}),
        };
      }
      return tOverlay;
    });

    setOverlays(mergedOverlays);

    // Reset flag after a longer delay to prevent race conditions with debounced text panel updates
    setTimeout(() => {
      isUpdatingFromTimelineRef.current = false;
    }, 500); // Increased from 0 to 500ms to account for debounced updates
  }, [setOverlays, transformTracksToOverlays]);

  // Handler for frame changes from timeline
  const handleTimelineFrameChange = React.useCallback((frame: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(frame);
    }
  }, [playerRef]);

  // Helper function to set sidebar panel based on overlay type
  const setSidebarForOverlay = React.useCallback((overlayId: number) => {
    const overlay = overlays.find(o => o.id === overlayId);
    if (overlay) {
      // Set the appropriate sidebar panel based on overlay type
      switch (overlay.type) {
        case OverlayType.TEXT:
          setActivePanel(OverlayType.TEXT);
          break;
        case OverlayType.VIDEO:
          setActivePanel(OverlayType.VIDEO);
          break;
        case OverlayType.SOUND:
          setActivePanel(OverlayType.SOUND);
          break;
        case OverlayType.STICKER:
          setActivePanel(OverlayType.STICKER);
          break;
        case OverlayType.IMAGE:
          setActivePanel(OverlayType.IMAGE);
          break;
        case OverlayType.CAPTION:
          setActivePanel(OverlayType.CAPTION);
          break;
        case OverlayType.SHAPE:
          // For shapes, we might want to show the image panel or create a dedicated shapes panel
          // For now, let's use the image panel as it's the closest match
          setActivePanel(OverlayType.IMAGE);
          break;
      }
    }
  }, [overlays, setActivePanel]);

  // Handler for item selection (single item - for backward compatibility)
  const handleItemSelect = React.useCallback((itemId: string) => {
    const overlayId = parseInt(itemId, 10);
    setSelectedOverlayId(overlayId);
    setSidebarForOverlay(overlayId);
  }, [setSelectedOverlayId, setSidebarForOverlay]);

  // Handler for multiselect changes
  const handleSelectedItemsChange = React.useCallback((itemIds: string[]) => {
    const overlayIds = itemIds.map(id => parseInt(id, 10));
    setSelectedOverlayIds(overlayIds);
    
    // Set sidebar panel for the first selected item
    if (overlayIds.length > 0) {
      setSidebarForOverlay(overlayIds[0]);
    }
  }, [setSelectedOverlayIds, setSidebarForOverlay]);

  // Handler for item deletion
  const handleDeleteItems = React.useCallback((itemIds: string[]) => {
    itemIds.forEach(itemId => {
      const overlayId = parseInt(itemId, 10);
      deleteOverlay(overlayId);
    });
  }, [deleteOverlay]);

  // Handler for item duplication
  const handleDuplicateItems = React.useCallback((itemIds: string[]) => {
    itemIds.forEach(itemId => {
      const overlayId = parseInt(itemId, 10);
      duplicateOverlay(overlayId);
    });
  }, [duplicateOverlay]);

  // Handler for item splitting
  const handleSplitItems = React.useCallback((itemId: string, splitTime: number) => {
    const overlayId = parseInt(itemId, 10);
    const splitFrame = Math.round(splitTime * FPS);
    splitOverlay(overlayId, splitFrame);
  }, [splitOverlay]);

  // Handler for item move
  const handleItemMove = React.useCallback((itemId: string, newStart: number, newEnd: number, newTrackId: string) => {
    const timestamp = Date.now();
    const overlayId = parseInt(itemId, 10);
    const overlay = overlays.find(o => o.id === overlayId);
    
    console.log(`[TIMELINE-HANDLERS][${timestamp}] handleItemMove CALLED:`, {
      itemId,
      overlayId,
      newTrackId,
      newStart,
      newEnd,
      isUpdatingFlag: isUpdatingFromTimelineRef.current,
      currentOverlayState: overlays.map(o => ({ id: o.id, row: o.row, type: o.type })),
      overlayFound: !!overlay
    });
    
    // CRITICAL FIX: Don't process individual item moves when we're in the middle of a batch track update
    // This prevents double-updates where handleTracksChange already processed all changes
    if (isUpdatingFromTimelineRef.current) {
      return;
    }
    
    if (overlay) {
      const newRow = parseInt(newTrackId.replace('track-', ''), 10);
      
      const updatedOverlay: Overlay = {
        ...overlay,
        from: Math.round(newStart * FPS),
        durationInFrames: Math.round((newEnd - newStart) * FPS),
        row: newRow,
      };

      handleOverlayChange(updatedOverlay);
    } else {
      console.error(`[TIMELINE-HANDLERS][${timestamp}] ❌ Overlay not found for move:`, { itemId, overlayId, availableOverlays: overlays.map(o => o.id) });
    }
  }, [overlays, handleOverlayChange, isUpdatingFromTimelineRef]);

  // Handler for item resize
  const handleItemResize = React.useCallback((itemId: string, newStart: number, newEnd: number) => {
    const timestamp = Date.now();
    
    // CRITICAL FIX: Don't process individual item resizes when we're in the middle of a batch track update
    if (isUpdatingFromTimelineRef.current) {
      console.log(`[TIMELINE-HANDLERS][${timestamp}] 🛑 SKIPPING handleItemResize - batch update in progress`);
      return;
    }
    
    const overlayId = parseInt(itemId, 10);
    const overlay = overlays.find(o => o.id === overlayId);
    if (overlay) {
      const updatedOverlay: Overlay = {
        ...overlay,
        from: Math.round(newStart * FPS),
        durationInFrames: Math.round((newEnd - newStart) * FPS),
      };
      handleOverlayChange(updatedOverlay);
    }
  }, [overlays, handleOverlayChange, isUpdatingFromTimelineRef]);

  // Handler for new item drop from external sources (e.g., media grid)
  const handleNewItemDrop = React.useCallback((
    itemType: string,
    trackIndex: number,
    startTime: number,
    itemData?: {
      duration?: number;
      label?: string;
      data?: any;
    }
  ) => {
    console.log('[TIMELINE-HANDLERS] New item drop', { itemType, trackIndex, startTime, itemData });
    
    // Only handle video, image, audio, and text types from media grid
    if (itemType !== 'video' && itemType !== 'image' && itemType !== 'audio' && itemType !== 'text') {
      console.warn('[TIMELINE-HANDLERS] Unsupported item type:', itemType);
      return;
    }

    try {
      const canvasDimensions = getAspectRatioDimensions();
      let newOverlay: Partial<Overlay>;
      
      if (itemType === 'video' && itemData?.data) {
        const video = itemData.data;
        
        // Check if this is local media (has src already) or external media (needs adaptor)
        let videoUrl: string;
        if (video._isLocalMedia && video.src) {
          // Local media - use src directly
          videoUrl = video.src;
        } else {
          // External media - use adaptor
          const adaptor = videoAdaptors.find((a) => a.name === video._source);
          videoUrl = adaptor?.getVideoUrl(video, "hd") || "";
        }

        // Use duration from drag data (already available from video metadata)
        // This avoids the async fetch delay and provides instant feedback
        const durationFromMetadata = itemData.duration || 5; // Default to 5 seconds if not provided
        const durationInFrames = Math.round(durationFromMetadata * FPS);
        const mediaSrcDuration = durationFromMetadata;

        const assetDimensions = getAssetDimensions(video);
        const { width, height } = assetDimensions 
          ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
          : canvasDimensions;

        newOverlay = {
          left: 0,
          top: 0,
          width,
          height,
          durationInFrames,
          from: Math.round(startTime * FPS),
          rotation: 0,
          row: trackIndex,
          isDragging: false,
          type: OverlayType.VIDEO,
          content: video.thumbnail,
          src: videoUrl,
          videoStartTime: 0,
          mediaSrcDuration,
          styles: {
            opacity: 1,
            zIndex: 100,
            transform: "none",
            objectFit: "contain",
            animation: {
              enter: "none",
              exit: "none",
            },
          },
        };
      } else if (itemType === 'image' && itemData?.data) {
        const image = itemData.data;
        
        // Check if this is local media (has src already) or external media (needs adaptor)
        let imageUrl: string;
        if (image._isLocalMedia && image.src) {
          // Local media - use src directly
          imageUrl = image.src;
        } else {
          // External media - use adaptor
          const adaptor = imageAdaptors.find((a) => a.name === image._source);
          imageUrl = adaptor?.getImageUrl(image, "large") || image.src || "";
        }

        const assetDimensions = getAssetDimensions(image);
        const { width, height } = assetDimensions 
          ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
          : canvasDimensions;

        newOverlay = {
          left: 0,
          top: 0,
          width,
          height,
          durationInFrames: 150, // 5 seconds default
          from: Math.round(startTime * FPS),
          rotation: 0,
          row: trackIndex,
          isDragging: false,
          type: OverlayType.IMAGE,
          content: imageUrl,
          src: imageUrl,
          styles: {
            opacity: 1,
            zIndex: 100,
            transform: "none",
            objectFit: "contain",
            animation: {
              enter: "none",
              exit: "none",
            },
          },
        };
      } else if (itemType === 'audio' && itemData?.data) {
        const sound = itemData.data;
        
        // Use duration from drag data (audio duration in seconds)
        const durationFromMetadata = itemData.duration || 5; // Default to 5 seconds if not provided
        const durationInFrames = Math.round(durationFromMetadata * FPS);
        const mediaSrcDuration = durationFromMetadata;

        // Get audio source URL (works for both local and external media)
        const audioSrc = sound.src || sound.file || "";

        newOverlay = {
          left: 0,
          top: 0,
          width: 1920,
          height: 100,
          durationInFrames,
          from: Math.round(startTime * FPS),
          rotation: 0,
          row: trackIndex,
          isDragging: false,
          type: OverlayType.SOUND,
          content: sound.title || sound.name || 'Audio',
          src: audioSrc,
          mediaSrcDuration,
          styles: {
            opacity: 1,
          },
        };
      } else if (itemType === 'text' && itemData?.data) {
        const template = itemData.data;
        
        // Use duration from drag data
        const durationFromMetadata = itemData.duration || 3; // Default to 3 seconds if not provided
        const durationInFrames = Math.round(durationFromMetadata * FPS);

        newOverlay = {
          left: 100,
          top: 100,
          width: 500,
          height: 180,
          durationInFrames,
          from: Math.round(startTime * FPS),
          rotation: 0,
          row: trackIndex,
          isDragging: false,
          type: OverlayType.TEXT,
          content: template.content ?? "Testing",
          styles: {
            ...template.styles,
            opacity: 1,
            zIndex: 1,
            transform: "none",
            textAlign: template.styles.textAlign as "left" | "center" | "right",
            fontSizeScale: 1, // Default scale factor
          },
        };
      } else {
        console.warn('[TIMELINE-HANDLERS] No data provided for item drop');
        return;
      }

      // Generate new ID
      const newId = overlays.length > 0 ? Math.max(...overlays.map((o) => o.id)) + 1 : 0;
      const overlayWithId = { ...newOverlay, id: newId } as Overlay;
      
      // Add to overlays
      const updatedOverlays = [...overlays, overlayWithId];
      setOverlays(updatedOverlays);
      
      // Select the new overlay
      setSelectedOverlayId(newId);
      
      // Open the appropriate sidebar panel
      if (itemType === 'video') {
        setActivePanel(OverlayType.VIDEO);
      } else if (itemType === 'image') {
        setActivePanel(OverlayType.IMAGE);
      } else if (itemType === 'audio') {
        setActivePanel(OverlayType.SOUND);
      } else if (itemType === 'text') {
        setActivePanel(OverlayType.TEXT);
      }
      
      console.log('[TIMELINE-HANDLERS] Successfully created overlay', overlayWithId);
    } catch (error) {
      console.error('[TIMELINE-HANDLERS] Error creating overlay from drop:', error);
    }
  }, [overlays, setOverlays, setSelectedOverlayId, setActivePanel, videoAdaptors, imageAdaptors, getAspectRatioDimensions]);

  return {
    isUpdatingFromTimelineRef,
    handleTracksChange,
    handleTimelineFrameChange,
    handleItemSelect,
    handleSelectedItemsChange,
    handleDeleteItems,
    handleDuplicateItems,
    handleSplitItems,
    handleItemMove,
    handleItemResize,
    handleNewItemDrop,
  };
}; 