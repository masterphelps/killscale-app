import { useState, useEffect, useCallback } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { useAspectRatio } from "../../../hooks/use-aspect-ratio";

import { ImageOverlay, Overlay, OverlayType, type ShapeOverlay, type TextOverlay } from "../../../types";
import { ImageDetails } from "./image-details";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { StandardImage } from "../../../types/media-adaptors";
import { MediaOverlayPanel } from "../shared/media-overlay-panel";
import { calculateIntelligentAssetSize, getAssetDimensions } from "../../../utils/asset-sizing";
import { useImageReplacement } from "../../../hooks/use-image-replacement";
import { DEFAULT_IMAGE_DURATION_FRAMES, IMAGE_DURATION_PERCENTAGE } from "../../advanced-timeline/constants";
import { Type } from "lucide-react";

/**
 * Type for images with source attribution
 */
type ImageWithSource = StandardImage & {
  _source: string;
  _sourceDisplayName: string;
};

/**
 * ImageOverlayPanel Component
 *
 * A panel that provides functionality to:
 * 1. Search and select images from all configured image adaptors
 * 2. Add selected images as overlays to the editor
 * 3. Modify existing image overlay properties
 * 4. Filter images by source using tabs
 *
 * The panel has two main states:
 * - Search/Selection mode: Shows a search bar, source tabs, and masonry grid of images
 * - Edit mode: Shows image details editor when an existing image overlay is selected
 */
export const ImageOverlayPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState<ImageWithSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceResults, setSourceResults] = useState<Array<{
    adaptorName: string;
    adaptorDisplayName: string;
    itemCount: number;
    hasMore: boolean;
    error?: string;
  }>>([]);
  const { searchImages, imageAdaptors } = useMediaAdaptors();
  const { isReplaceMode, startReplaceMode, cancelReplaceMode, replaceImage } = useImageReplacement();
  const {
    overlays,
    selectedOverlayId,
    changeOverlay,
    currentFrame,
    setOverlays,
    setSelectedOverlayId,
    durationInFrames,
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

    if (selectedOverlay?.type === OverlayType.IMAGE) {
      setLocalOverlay(selectedOverlay);
    }
  }, [selectedOverlayId, overlays]);

  /**
   * Handles the image search form submission
   * Searches across all configured image adaptors
   */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const results = await searchImages({ query: searchQuery, page: 1, perPage: 50 });
      setImages(results.items);
      setSourceResults(results.sourceResults || []);
    } catch (error) {
      console.error('Failed to search images:', error);
      setImages([]);
      setSourceResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles adding or replacing an image
   * @param image - The selected image to add or use as replacement
   */
  const handleAddImage = async (image: ImageWithSource) => {
    // Check if we're in replace mode
    if (isReplaceMode && localOverlay) {
      // Replace mode: Use the hook to handle replacement
      await replaceImage(
        localOverlay,
        image,
        (updatedOverlay) => {
          setLocalOverlay(updatedOverlay);
          // Clear search state
          setSearchQuery("");
          setImages([]);
          setSourceResults([]);
        }
      );
    } else {
      // Add mode: Create new overlay
      const canvasDimensions = getAspectRatioDimensions();
      const assetDimensions = getAssetDimensions(image);
      
      // Use intelligent sizing if asset dimensions are available, otherwise fall back to canvas dimensions
      const { width, height } = assetDimensions 
        ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
        : canvasDimensions;
      
      const { from, row, updatedOverlays } = addAtPlayhead(
        currentFrame,
        overlays,
        'top'
      );

      // Create the new overlay without an ID (addOverlay will generate it)
      // Use a percentage of composition duration for smart image length when there are existing overlays,
      // otherwise default to DEFAULT_IMAGE_DURATION_FRAMES
      const smartDuration = overlays.length > 0 
        ? Math.round(durationInFrames * IMAGE_DURATION_PERCENTAGE)
        : DEFAULT_IMAGE_DURATION_FRAMES;
      
      const newOverlay = {
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
        src: image.src['original'] || image.src['large'] || image.src['medium'] || image.src['small'] || '',
        styles: {
          objectFit: "contain",
          animation: {
            enter: "fadeIn",
            exit: "fadeOut",
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
  };

  /**
   * Updates an existing image overlay's properties
   * @param updatedOverlay - The modified overlay object
   * Updates both local state and global editor context
   */
  const handleUpdateOverlay = (updatedOverlay: Overlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  const handleCancelReplace = () => {
    cancelReplaceMode();
    setSearchQuery("");
    setImages([]);
    setSourceResults([]);
  };

  const getThumbnailUrl = (image: ImageWithSource) => {
    return image.src['medium'] || image.src['small'] || image.src['original'];
  };

  const getItemKey = (image: ImageWithSource) => {
    return `${image._source}-${image.id}`;
  };

  const handleAddEndCard = useCallback(() => {
    const maxEndFrame = overlays.reduce((max, o) => Math.max(max, o.from + o.durationInFrames), 0)
    const endCardDuration = 3 * 30 // 3 seconds at 30fps = 90 frames

    const bgId = Math.max(...overlays.map(o => o.id), 0) + 1
    const textId = bgId + 1

    const newOverlays: Overlay[] = [
      ...overlays,
      {
        id: bgId,
        type: OverlayType.SHAPE,
        content: 'End Card',
        from: maxEndFrame,
        durationInFrames: endCardDuration,
        left: 0,
        top: 0,
        width: 1080,
        height: 1920,
        row: 6,
        isDragging: false,
        rotation: 0,
        styles: {
          fill: '#000000',
          // @ts-expect-error — custom metadata property
          __ksTag: '__ks_endcard_bg',
        },
      } satisfies ShapeOverlay,
      {
        id: textId,
        type: OverlayType.TEXT,
        content: 'Your Text Here',
        from: maxEndFrame,
        durationInFrames: endCardDuration,
        left: 0,
        top: 760,
        width: 1080,
        height: 400,
        row: 0,
        isDragging: false,
        rotation: 0,
        styles: {
          fontSize: '48px',
          fontWeight: '700',
          color: '#FFFFFF',
          backgroundColor: 'transparent',
          fontFamily: 'Outfit',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          // @ts-expect-error — custom metadata property
          __ksTag: '__ks_endcard_text',
        },
      } satisfies TextOverlay,
    ]

    setOverlays(newOverlays)
    setSelectedOverlayId(textId) // Select text so user can edit it
  }, [overlays, setOverlays, setSelectedOverlayId])

  const isEditMode = !!localOverlay && !isReplaceMode
  const showQuickAdd = !isEditMode && !isReplaceMode

  return (
    <div className="flex flex-col h-full">
      {showQuickAdd && (
        <div className="px-2 pb-3 border-b border-border shrink-0">
          <p className="text-xs text-muted-foreground mb-2">Quick Add</p>
          <button
            onClick={handleAddEndCard}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 border border-border transition-colors"
          >
            <div className="w-10 h-10 rounded bg-black flex items-center justify-center shrink-0">
              <Type className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">End Card</p>
              <p className="text-xs text-muted-foreground">Solid color + text outro</p>
            </div>
          </button>
        </div>
      )}
    <MediaOverlayPanel
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onSearch={handleSearch}
      items={images}
      isLoading={isLoading}
      hasAdaptors={imageAdaptors.length > 0}
      sourceResults={sourceResults}
      onItemClick={handleAddImage}
      getThumbnailUrl={getThumbnailUrl}
      getItemKey={getItemKey}
      mediaType="images"
      searchPlaceholder={isReplaceMode ? "Search for replacement image" : "Search images"}
      showSourceBadge={true}
      isEditMode={isEditMode}
      editComponent={
        localOverlay ? (
          <ImageDetails
            localOverlay={localOverlay as ImageOverlay}
            setLocalOverlay={handleUpdateOverlay}
            onChangeImage={startReplaceMode}
          />
        ) : null
      }
      isReplaceMode={isReplaceMode}
      onCancelReplace={handleCancelReplace}
      enableTimelineDrag={!isReplaceMode && !localOverlay}
    />
    </div>
  );
};
