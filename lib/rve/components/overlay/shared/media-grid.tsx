import { MediaLoadingGrid } from "./media-loading-grid";
import { MediaEmptyState } from "./media-empty-state";
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from "../../advanced-timeline/hooks/use-new-item-drag";


interface MediaItem {
  id: string | number;
  _source: string;
  _sourceDisplayName: string;
  thumbnail?: string;
  src?: any; // For images
}

interface MediaGridProps<T extends MediaItem> {
  items: T[];
  isLoading: boolean;
  isDurationLoading?: boolean;
  loadingItemKey?: string | null;
  hasAdaptors: boolean;
  hasSearched: boolean;
  activeTab: string;
  sourceResults: Array<{
    adaptorName: string;
    adaptorDisplayName: string;
    itemCount: number;
    hasMore: boolean;
    error?: string;
  }>;
  mediaType: string; // e.g., "videos", "images"
  onItemClick: (item: T) => void;
  getThumbnailUrl: (item: T) => string;
  getItemKey: (item: T) => string;
  showSourceBadge?: boolean;
  enableTimelineDrag?: boolean; // Enable dragging to timeline
}

/**
 * MediaGrid - Shared media grid component
 * 
 * Provides consistent masonry grid layout and state handling across all media panels.
 * Handles loading states, empty states, and media item display with hover effects.
 * 
 * New: Supports dragging items to timeline with ghost element preview
 */
export const MediaGrid = <T extends MediaItem>({
  items,
  isLoading,
  isDurationLoading = false,
  loadingItemKey = null,
  hasAdaptors,
  hasSearched,
  activeTab,
  sourceResults,
  mediaType,
  onItemClick,
  getThumbnailUrl,
  getItemKey,
  enableTimelineDrag = false,
}: MediaGridProps<T>) => {
  // Get active tab display name for empty state
  const activeTabDisplayName = sourceResults.find(
    s => s.adaptorName === activeTab
  )?.adaptorDisplayName;

  if (isLoading) {
    return <MediaLoadingGrid />;
  }

  // Handle drag start for timeline integration
  const handleDragStart = (item: T) => (e: React.DragEvent) => {
    if (!enableTimelineDrag) return;
    
    // Extract duration from item if available (videos may have duration metadata)
    const itemDuration = (item as any).duration;
    const defaultDuration = mediaType === "videos" ? 5 : 5; // Default to 5 seconds
    const duration = typeof itemDuration === 'number' && itemDuration > 0 
      ? itemDuration 
      : defaultDuration;
    
    // Set drag data for timeline
    const dragData = {
      isNewItem: true,
      type: mediaType === "videos" ? "video" : "image",
      label: item._sourceDisplayName,
      duration, // Use actual duration from video metadata or default
      data: item, // Full item data
    };
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    
    // Set global drag state for timeline
    setCurrentNewItemDragType(dragData.type);
    setCurrentNewItemDragData(dragData);
    
    // Create a custom drag image (smaller thumbnail)
    const thumbnail = e.currentTarget.querySelector('img');
    if (thumbnail) {
      // Create a smaller version of the thumbnail for dragging
      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-9999px';
      dragPreview.style.width = '60px';
      dragPreview.style.height = '40px';
      dragPreview.style.overflow = 'hidden';
      dragPreview.style.borderRadius = '4px';
      dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      dragPreview.style.cursor = 'none';
      
      const clonedImg = thumbnail.cloneNode(true) as HTMLImageElement;
      clonedImg.style.width = '80px';
      clonedImg.style.height = '60px';
      clonedImg.style.objectFit = 'cover';
      
      dragPreview.appendChild(clonedImg);
      document.body.appendChild(dragPreview);
      
      e.dataTransfer.setDragImage(dragPreview, 40, 30);
      
      // Clean up the preview element after drag starts
      setTimeout(() => {
        dragPreview.remove();
      }, 0);
    }
  };
  
  const handleDragEnd = () => {
    if (!enableTimelineDrag) return;
    
    // Clear drag state
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
  };

  if (items.length > 0) {
    return (
      <div className="columns-2 sm:columns-2 gap-3 space-y-3">
        {items.map((item) => {
          const itemKey = getItemKey(item);
          const isItemLoading = isDurationLoading && loadingItemKey === itemKey;
          
          return (
            <button
              key={itemKey}
              className="relative block w-full cursor-pointer border border-transparent rounded-sm overflow-hidden break-inside-avoid mb-3"
              onClick={() => !isItemLoading && onItemClick(item)}
              disabled={isItemLoading}
              draggable={enableTimelineDrag && !isItemLoading}
              onDragStart={handleDragStart(item)}
              onDragEnd={handleDragEnd}
            >
              <div className="relative w-full">
                {/* Container with padding-bottom trick to maintain aspect ratio */}
                <div className="relative w-full pb-[75%]"> {/* 4:3 aspect ratio */}
                  <img
                    src={getThumbnailUrl(item)}
                    alt={`${mediaType.slice(0, -1)} from ${item._sourceDisplayName}`}
                    className={`absolute inset-0 w-full h-full rounded-sm object-cover  ${
                      isItemLoading ? 'opacity-50' : 'hover:opacity-60'
                    }`}
                    draggable={false}
                  />
                  {/* Loading overlay for individual item */}
                  {isItemLoading && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!isItemLoading && (
                    <div className="absolute inset-0 bg-background/20 opacity-0 hover:opacity-100 transition-opacity duration-200" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Determine empty state type
  if (!hasAdaptors)
    return <MediaEmptyState type="no-adaptors" mediaType={mediaType} />;

  if (hasSearched && sourceResults.length > 0) {
    return (
      <MediaEmptyState 
        type="no-results" 
        mediaType={mediaType}
        activeTabName={activeTab !== "all" ? activeTabDisplayName : undefined}
      />
    );
  }

  return <MediaEmptyState type="initial" mediaType={mediaType} />;
}; 