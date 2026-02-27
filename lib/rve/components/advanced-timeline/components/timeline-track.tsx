import React from 'react';
import { TimelineTrack as TimelineTrackType, TimelineItem as TimelineItemType } from '../types';
import { TimelineItem } from './timeline-item';
import { TimelineGhostElement } from './timeline-ghost-element';
import { TimelineGapIndicator } from './timeline-gap-indicator';
import { findGapsInTrack } from '../utils/gap-utils';
import { TIMELINE_CONSTANTS } from '../constants';
import useTimelineStore from '../stores/use-timeline-store';

interface TimelineTrackProps {
  track: TimelineTrackType;
  totalDuration: number;
  trackIndex: number;
  trackCount: number;
  onItemSelect?: (itemId: string) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onDuplicateItems?: (itemIds: string[]) => void;
  onSplitItems?: (itemId: string, splitTime: number) => void;
  selectedItemIds?: string[];
  onSelectedItemsChange?: (itemIds: string[]) => void;
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onDragStart?: (
    item: TimelineItemType,
    clientX: number,
    clientY: number,
    action: "move" | "resize-start" | "resize-end",
    selectedItemIds?: string[]
  ) => void;
  zoomScale?: number;
  isDragging?: boolean;
  draggedItemId?: string;
  ghostElements?: Array<{
    left: number;
    width: number;
    top: number;
  }>;
  isValidDrop?: boolean;
  onContextMenuOpenChange?: (isOpen: boolean) => void;
  splittingEnabled?: boolean;
  hideItemsOnDrag?: boolean;
  currentFrame?: number;
  fps?: number;
  onAddClipAfter?: (trackIndex: number, startTime: number) => void;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  track,
  totalDuration,
  trackIndex,
  trackCount,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onItemMove,
  onDragStart,
  zoomScale = 1,
  isDragging = false,
  draggedItemId,
  ghostElements = [],
  isValidDrop = false,
  onContextMenuOpenChange,
  splittingEnabled = false,
  hideItemsOnDrag = false,
  currentFrame,
  fps = 30,
  onAddClipAfter,
}) => {
  const { magneticPreview } = useTimelineStore();

  // Find gaps in the track for gap indicators
  const gaps = findGapsInTrack(track.items);

  // Sort items by start time for adjacency detection
  const sortedItems = React.useMemo(
    () => [...track.items].sort((a, b) => a.start - b.start),
    [track.items]
  );

  // Find the end time of the last item on this track
  const lastItemEnd = React.useMemo(
    () => sortedItems.length > 0 ? sortedItems[sortedItems.length - 1].end : 0,
    [sortedItems]
  );


  // Handle item selection change with support for multi-selection
  const handleSelectionChange = (itemId: string, isMultiple: boolean) => {
    if (onSelectedItemsChange) {
      if (isMultiple) {
        // Multi-selection: toggle the item
        const currentlySelected = selectedItemIds.includes(itemId);
        if (currentlySelected) {
          // Remove from selection
          const newSelection = selectedItemIds.filter(id => id !== itemId);
          onSelectedItemsChange(newSelection);
        } else {
          // Add to selection
          const newSelection = [...selectedItemIds, itemId];
          onSelectedItemsChange(newSelection);
        }
      } else {
        // Single selection: replace current selection
        onSelectedItemsChange([itemId]);
      }
    } else {
      // Fallback to old behavior
      onItemSelect?.(itemId);
    }
  };

  // Determine which items to render and their positions
  const shouldShowPreview = magneticPreview && magneticPreview.trackId === track.id && isDragging;

  // Empty section placeholder — dashed border, muted styling
  const isEmptyPlaceholder = track.section && track.items.length === 0;

  return (
    <div
      className={`track relative w-full transition-all duration-200 ease-in-out ${
        isEmptyPlaceholder
          ? 'bg-[var(--timeline-row)]/50 border-b border-dashed border-zinc-700/50'
          : 'bg-[var(--timeline-row)] border-b border-[var(--border)]'
      }`}
      style={{
        height: `${TIMELINE_CONSTANTS.TRACK_HEIGHT}px`,
      }}
    >
      {shouldShowPreview ? (
        // Render preview items with shifted positions
        magneticPreview.previewItems.map((previewItem) => {
          const originalItem = track.items.find(item => item.id === previewItem.id);
          if (!originalItem) return null;
          
          return (
            <TimelineItem
              key={previewItem.id}
              item={{
                ...originalItem,
                start: previewItem.start,
                end: previewItem.end
              }}
              totalDuration={totalDuration}
              onSelect={onItemSelect}
              onSelectionChange={handleSelectionChange}
              onDragStart={onDragStart}
              onDeleteItems={onDeleteItems}
              onDuplicateItems={onDuplicateItems}
              onSplitItems={onSplitItems}
              selectedItemIds={selectedItemIds}
              zoomScale={zoomScale}
              isDragging={isDragging && draggedItemId === previewItem.id}
              isSelected={selectedItemIds?.includes(previewItem.id)}
              onContextMenuOpenChange={onContextMenuOpenChange}
              splittingEnabled={splittingEnabled}
              currentFrame={currentFrame}
              fps={fps}
            />
          );
        })
      ) : (
        // Render normal items
        track.items.map((item) => {
          // Check if this specific item should be hidden during drag
          const shouldHideThisItem = hideItemsOnDrag && isDragging && selectedItemIds?.includes(item.id);
          
          // Skip rendering this item if it should be hidden
          if (shouldHideThisItem) {
            return null;
          }
          
          return (
            <TimelineItem
              key={item.id}
              item={item}
              totalDuration={totalDuration}
              onSelect={onItemSelect}
              onSelectionChange={handleSelectionChange}
              onDragStart={onDragStart}
              onDeleteItems={onDeleteItems}
              onDuplicateItems={onDuplicateItems}
              onSplitItems={onSplitItems}
              selectedItemIds={selectedItemIds}
              zoomScale={zoomScale}
              isDragging={isDragging && draggedItemId === item.id}
              isSelected={selectedItemIds?.includes(item.id)}
              onContextMenuOpenChange={onContextMenuOpenChange}
              splittingEnabled={splittingEnabled}
              currentFrame={currentFrame}
              fps={fps}
            />
          );
        })
      )}
      
      {/* Gap indicators - only show when not dragging AND track is not magnetic */}
      {!isDragging && !track.magnetic &&
        gaps.map((gap, gapIndex) => (
          <TimelineGapIndicator
            key={`gap-${track.id}-${gapIndex}`}
            gap={gap}
            trackIndex={trackIndex}
            totalDuration={totalDuration}
            trackItems={track.items}
            onItemMove={onItemMove}
            trackId={track.id}
          />
        ))}

      {/* "+" add clip button — appears after the last item on the track */}
      {sortedItems.length > 0 && !isDragging && (
        <div
          className="absolute top-1/2 -translate-y-1/2 z-10 opacity-0 hover:opacity-100 transition-opacity duration-150"
          style={{
            left: `${(lastItemEnd / totalDuration) * 100}%`,
            marginLeft: 4,
          }}
        >
          <button
            className="flex items-center justify-center rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] hover:border-white/20 text-white/40 hover:text-white/80 transition-all duration-150"
            style={{
              width: 28,
              height: TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT - 4,
            }}
            onClick={() => onAddClipAfter?.(trackIndex, lastItemEnd)}
            title="Add clip"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Ghost elements for this track */}
      {ghostElements.map((ghostElement, ghostIndex) => (
        <TimelineGhostElement
          key={`ghost-${trackIndex}-${ghostIndex}`}
          ghostElement={ghostElement}
          rowIndex={trackIndex}
          trackCount={trackCount}
          isValidDrop={isValidDrop}
          isFloating={false}
        />
      ))}
    </div>
  );
};