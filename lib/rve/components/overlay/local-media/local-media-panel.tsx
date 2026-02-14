import { useCallback } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { useAspectRatio } from "../../../hooks/use-aspect-ratio";
import { calculateIntelligentAssetSize, getAssetDimensions } from "../../../utils/asset-sizing";
import { Overlay, OverlayType } from "../../../types";
import { LocalMediaGallery } from "./local-media-gallery";
import { DEFAULT_IMAGE_DURATION_FRAMES, IMAGE_DURATION_PERCENTAGE } from "../../advanced-timeline/constants";

/**
 * LocalMediaPanel Component
 *
 * A panel that allows users to:
 * 1. Upload their own media files (videos, images, audio)
 * 2. View and manage uploaded media files
 * 3. Add uploaded media to the timeline
 */
export const LocalMediaPanel: React.FC = () => {
  const { overlays, currentFrame, setOverlays, setSelectedOverlayId, durationInFrames } = useEditorContext();
  const { addAtPlayhead } = useTimelinePositioning();
  const { getAspectRatioDimensions } = useAspectRatio();

  /**
   * Add a media file to the timeline
   * Memoized to prevent recreation on every frame update
   */
  const handleAddToTimeline = useCallback((file: any) => {
    const canvasDimensions = getAspectRatioDimensions();
    
    // Note: Local media files don't currently store dimension information
    // For intelligent sizing, we would need to extract dimensions during upload
    // For now, we fall back to canvas dimensions
    const assetDimensions = getAssetDimensions(file);
    const { width, height } = assetDimensions 
      ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
      : canvasDimensions;
    
    const { from, row, updatedOverlays } = addAtPlayhead(
      currentFrame,
      overlays,
      'top'
    );

    // Handle both server paths and blob URLs
    let mediaSrc: string;
    if (file.path.startsWith('blob:')) {
      // Direct blob URL - use as-is
      mediaSrc = file.path;
    } else {
      // Server path - convert to use the API route for better content-type handling
      const apiPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
      mediaSrc = `/api/latest/local-media/serve/${apiPath}`;
    }

    // Generate ID first
    const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;

    let newOverlay: Overlay;

    if (file.type === "video") {
      newOverlay = {
        id: newId,
        left: 0,
        top: 0,
        width,
        height,
        durationInFrames: file.duration ? Math.round(file.duration * 30) : 200, // Convert seconds to frames (assuming 30fps)
        from,
        rotation: 0,
        row,
        isDragging: false,
        type: OverlayType.VIDEO,
        content: file.thumbnail || "",
        src: mediaSrc, // Use the API route instead of direct path
        videoStartTime: 0,
        mediaSrcDuration: file.duration, // Set the source media duration in seconds
        styles: {
          opacity: 1,
          zIndex: 100,
          transform: "none",
          objectFit: "contain",
        },
      };
    } else if (file.type === "image") {
      // Use a percentage of composition duration for smart image length when there are existing overlays,
      // otherwise default to DEFAULT_IMAGE_DURATION_FRAMES
      const smartDuration = overlays.length > 0 
        ? Math.round(durationInFrames * IMAGE_DURATION_PERCENTAGE)
        : DEFAULT_IMAGE_DURATION_FRAMES;
      
      newOverlay = {
        id: newId,
        left: 0,
        top: 0,
        width,
        height,
        durationInFrames: smartDuration,
        from,
        rotation: 0,
        row,
        isDragging: false,
        type: OverlayType.IMAGE,
        src: mediaSrc, // Use the API route instead of direct path
        content: mediaSrc,
        styles: {
          objectFit: "fill",
          animation: {
            enter: "fadeIn",
            exit: "fadeOut",
          },
        },
      };
    } else if (file.type === "audio") {
      newOverlay = {
        id: newId,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        durationInFrames: file.duration ? Math.round(file.duration * 30) : 200,
        from,
        rotation: 0,
        row,
        isDragging: false,
        type: OverlayType.SOUND,
        content: file.name,
        src: mediaSrc, // Use the API route instead of direct path
        mediaSrcDuration: file.duration, // Set the source media duration in seconds
        styles: {
          volume: 1,
        },
      };
    } else {
      return; // Unsupported file type
    }

    // Update overlays with both the shifted overlays and the new overlay in a single operation
    const finalOverlays = [...updatedOverlays, newOverlay];
    
    setOverlays(finalOverlays);
    setSelectedOverlayId(newId);
  }, [currentFrame, overlays, addAtPlayhead, getAspectRatioDimensions, setOverlays, setSelectedOverlayId]);

  return (
    <div className="flex flex-col gap-4 p-2 bg-background h-full">
      <LocalMediaGallery onSelectMedia={handleAddToTimeline} />
    </div>
  );
};

export default LocalMediaPanel;
