import { useState } from "react";
import { MediaSearchForm } from "./media-search-form";
import { MediaGrid } from "./media-grid";
import { UnifiedTabs } from "./unified-tabs";

interface MediaItem {
  id: string | number;
  _source: string;
  _sourceDisplayName: string;
  thumbnail?: string;
  src?: any;
}

interface MediaOverlayPanelProps<T extends MediaItem> {
  // Search state
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  
  // Media data
  items: T[];
  isLoading: boolean;
  isDurationLoading?: boolean;
  loadingItemKey?: string | null;
  hasAdaptors: boolean;
  sourceResults: Array<{
    adaptorName: string;
    adaptorDisplayName: string;
    itemCount: number;
    hasMore: boolean;
    error?: string;
  }>;
  
  // Media interaction
  onItemClick: (item: T) => void;
  getThumbnailUrl: (item: T) => string;
  getItemKey: (item: T) => string;
  
  // Config
  mediaType: string; // e.g., "videos", "images"
  searchPlaceholder: string;
  showSourceBadge?: boolean;
  
  // Edit mode
  isEditMode: boolean;
  editComponent: React.ReactNode;
  
  // Replace mode
  isReplaceMode?: boolean;
  onCancelReplace?: () => void;
  
  // Timeline drag support
  enableTimelineDrag?: boolean;
}

/**
 * MediaOverlayPanel - Generic media overlay panel component
 * 
 * Provides consistent layout and behavior for all media overlay panels.
 * Handles search/edit mode switching, source tabs, and scrollable content area.
 */
export const MediaOverlayPanel = <T extends MediaItem>({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  items,
  isLoading,
  isDurationLoading = false,
  loadingItemKey = null,
  hasAdaptors,
  sourceResults,
  onItemClick,
  getThumbnailUrl,
  getItemKey,
  mediaType,
  searchPlaceholder,
  showSourceBadge = false,
  isEditMode,
  editComponent,
  isReplaceMode = false,
  onCancelReplace,
  enableTimelineDrag = false,
}: MediaOverlayPanelProps<T>) => {
  const [activeTab, setActiveTab] = useState<string>("all");

  // Filter items based on active tab
  const filteredItems = activeTab === "all" 
    ? items 
    : items.filter(item => item._source === activeTab);

  // Check if we've performed a search (have results or sourceResults)
  const hasSearched = sourceResults.length > 0;

  return (
    <div className="flex flex-col p-2 h-full overflow-hidden">
      {!isEditMode ? (
        <>
          {/* Replace Mode Banner */}
          {isReplaceMode && onCancelReplace && (
            <div className="shrink-0 flex items-center justify-between px-3 py-2 mb-4 bg-blue-500/10 border border-blue-500/20 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-extralight">Select an asset to replace</span>
              </div>
              <button
                onClick={onCancelReplace}
                className="text-sm px-3 py-1 hover:bg-background/50 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="shrink-0 mb-4">
            <MediaSearchForm
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              onSubmit={onSearch}
              isLoading={isLoading}
              isDisabled={!hasAdaptors}
              placeholder={searchPlaceholder}
            />
          </div>

          {/* Source Tabs */}
          {sourceResults.length > 0 && (
            <div className="shrink-0 mb-4">
              <UnifiedTabs
                sourceResults={sourceResults}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <MediaGrid
              items={filteredItems}
              isLoading={isLoading}
              isDurationLoading={isDurationLoading}
              loadingItemKey={loadingItemKey}
              hasAdaptors={hasAdaptors}
              hasSearched={hasSearched}
              activeTab={activeTab}
              sourceResults={sourceResults}
              mediaType={mediaType}
              onItemClick={onItemClick}
              getThumbnailUrl={getThumbnailUrl}
              getItemKey={getItemKey}
              showSourceBadge={showSourceBadge}
              enableTimelineDrag={enableTimelineDrag}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {editComponent}
        </div>
      )}
    </div>
  );
}; 