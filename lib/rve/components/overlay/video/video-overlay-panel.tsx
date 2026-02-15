import { useState, useEffect } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { useAspectRatio } from "../../../hooks/use-aspect-ratio";
import { ClipOverlay, Overlay, OverlayType } from "../../../types";
import { VideoDetails } from "./video-details";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { StandardVideo } from "../../../types/media-adaptors";
import { MediaOverlayPanel } from "../shared/media-overlay-panel";
import { getSrcDuration } from "../../../hooks/use-src-duration";
import { calculateIntelligentAssetSize, getAssetDimensions } from "../../../utils/asset-sizing";
import { useVideoReplacement } from "../../../hooks/use-video-replacement";

/**
 * VideoOverlayPanel is a component that provides video search and management functionality.
 * It allows users to:
 * - Search and browse videos from all configured video adaptors
 * - Add videos to the timeline as overlays
 * - Manage video properties when a video overlay is selected
 *
 * The component has two main states:
 * 1. Search/Browse mode: Shows a search input and grid of video thumbnails from all sources
 * 2. Edit mode: Shows video details panel when a video overlay is selected
 *
 * @component
 * @example
 * ```tsx
 * <VideoOverlayPanel />
 * ```
 */
interface VideoOverlayPanelProps {
  onAIGenerate?: (prompt: string) => Promise<void>;
}

export const VideoOverlayPanel: React.FC<VideoOverlayPanelProps> = ({ onAIGenerate }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [videos, setVideos] = useState<
    Array<StandardVideo & { _source: string; _sourceDisplayName: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDurationLoading, setIsDurationLoading] = useState(false);
  const [loadingItemKey, setLoadingItemKey] = useState<string | null>(null);
  const [sourceResults, setSourceResults] = useState<
    Array<{
      adaptorName: string;
      adaptorDisplayName: string;
      itemCount: number;
      hasMore: boolean;
      error?: string;
    }>
  >([]);

  const { searchVideos, videoAdaptors } = useMediaAdaptors();
  const { isReplaceMode, startReplaceMode, cancelReplaceMode, replaceVideo } = useVideoReplacement();

  const {
    overlays,
    selectedOverlayId,
    changeOverlay,
    currentFrame,
    setOverlays,
    setSelectedOverlayId,
  } = useEditorContext();

  const { addAtPlayhead } = useTimelinePositioning();
  const { getAspectRatioDimensions } = useAspectRatio();
  const [localOverlay, setLocalOverlay] = useState<Overlay | null>(null);

  useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.VIDEO) {
      setLocalOverlay(selectedOverlay);
    }
  }, [selectedOverlayId, overlays]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const result = await searchVideos({
        query: searchQuery,
        perPage: 50,
        page: 1,
      });

      setVideos(result.items);
      setSourceResults(result.sourceResults);
    } catch (error) {
      console.error("Error searching videos:", error);
      // Reset state on error
      setVideos([]);
      setSourceResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddClip = async (
    video: StandardVideo & { _source: string; _sourceDisplayName: string }
  ) => {
    const itemKey = getItemKey(video);
    setIsDurationLoading(true);
    setLoadingItemKey(itemKey);

    try {
      // Check if we're in replace mode
      if (isReplaceMode && localOverlay) {
        // Replace mode: Use the hook to handle replacement
        await replaceVideo(
          localOverlay,
          video,
          (v) => {
            const adaptor = videoAdaptors.find((a) => a.name === v._source);
            return adaptor?.getVideoUrl(v, "hd") || "";
          },
          (updatedOverlay) => {
            setLocalOverlay(updatedOverlay);
            // Clear search state
            setSearchQuery("");
            setVideos([]);
            setSourceResults([]);
          }
        );
      } else {
        // Add mode: Create new overlay
        const adaptor = videoAdaptors.find((a) => a.name === video._source);
        const videoUrl = adaptor?.getVideoUrl(video, "hd") || "";

        // Get actual video duration using media-parser
        let durationInFrames = 200; // fallback
        let mediaSrcDuration: number | undefined;
        
        try {
          const result = await getSrcDuration(videoUrl);
          durationInFrames = result.durationInFrames;
          mediaSrcDuration = result.durationInSeconds;
        } catch (error) {
          console.warn("Failed to get video duration, using fallback:", error);
        }

        const canvasDimensions = getAspectRatioDimensions();
        const assetDimensions = getAssetDimensions(video);
        
        // Use intelligent sizing if asset dimensions are available, otherwise fall back to canvas dimensions
        const { width, height } = assetDimensions 
          ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
          : canvasDimensions;
        
        const { from, row, updatedOverlays } = addAtPlayhead(
          currentFrame,
          overlays,
          'top'
        );

        // Create the new overlay without an ID (will be generated)
        const newOverlay = {
          left: 0,
          top: 0,
          width,
          height,
          durationInFrames,
          from,
          rotation: 0,
          row,
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

        // Update overlays with both the shifted overlays and the new overlay in a single operation
        const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;
        const overlayWithId = { ...newOverlay, id: newId } as Overlay;
        const finalOverlays = [...updatedOverlays, overlayWithId];
        
        setOverlays(finalOverlays);
        setSelectedOverlayId(newId);
      }
    } finally {
      setIsDurationLoading(false);
      setLoadingItemKey(null);
    }
  };

  const handleUpdateOverlay = (updatedOverlay: Overlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  const handleCancelReplace = () => {
    cancelReplaceMode();
    setSearchQuery("");
    setVideos([]);
    setSourceResults([]);
  };

  const getThumbnailUrl = (video: StandardVideo & { _source: string; _sourceDisplayName: string }) => {
    return video.thumbnail;
  };

  const getItemKey = (video: StandardVideo & { _source: string; _sourceDisplayName: string }) => {
    return `${video._source}-${video.id}`;
  };

  return (
    <MediaOverlayPanel
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onSearch={handleSearch}
      items={videos}
      isLoading={isLoading}
      isDurationLoading={isDurationLoading}
      loadingItemKey={loadingItemKey}
      hasAdaptors={videoAdaptors.length > 0}
      sourceResults={sourceResults}
      onItemClick={handleAddClip}
      getThumbnailUrl={getThumbnailUrl}
      getItemKey={getItemKey}
      mediaType="videos"
      searchPlaceholder={isReplaceMode ? "Search for replacement video" : "Search videos"}
      showSourceBadge={false}
      isEditMode={!!localOverlay && !isReplaceMode}
      editComponent={
        localOverlay ? (
          <VideoDetails
            localOverlay={localOverlay as ClipOverlay}
            setLocalOverlay={handleUpdateOverlay}
            onChangeVideo={startReplaceMode}
            onAIGenerate={onAIGenerate}
          />
        ) : null
      }
      isReplaceMode={isReplaceMode}
      onCancelReplace={handleCancelReplace}
      enableTimelineDrag={!isReplaceMode && !localOverlay}
    />
  );
};
