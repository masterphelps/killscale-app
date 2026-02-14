import { useCallback } from 'react';

export interface UseTimelineOperationsProps {
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize?: (itemId: string, newStart: number, newEnd: number) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onDuplicateItems?: (itemIds: string[]) => void;
  onSplitItems?: (itemId: string, splitTime: number) => void;
  onAddNewItem?: (item: any) => void;
}

export interface UseTimelineOperationsReturn {
  handleExternalItemMove: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  handleExternalItemResize: (itemId: string, newStart: number, newEnd: number) => void;
  handleExternalItemsDelete: (itemIds: string[]) => void;
  handleExternalItemsDuplicate: (itemIds: string[]) => void;
  handleExternalItemSplit: (itemId: string, splitTime: number) => void;
  handleExternalAddNewItem: (item: any) => void;
}

export const useTimelineOperations = ({
  onItemMove,
  onItemResize,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  onAddNewItem,
}: UseTimelineOperationsProps): UseTimelineOperationsReturn => {
  
  // External handler wrappers that delegate to parent callbacks
  const handleExternalItemMove = useCallback((itemId: string, newStart: number, newEnd: number, newTrackId: string) => {
    onItemMove?.(itemId, newStart, newEnd, newTrackId);
  }, [onItemMove]);

  const handleExternalItemResize = useCallback((itemId: string, newStart: number, newEnd: number) => {
    onItemResize?.(itemId, newStart, newEnd);
  }, [onItemResize]);

  const handleExternalItemsDelete = useCallback((itemIds: string[]) => {
    onDeleteItems?.(itemIds);
  }, [onDeleteItems]);

  const handleExternalItemsDuplicate = useCallback((itemIds: string[]) => {
    // Just call the external callback - let the parent component handle duplication
    // This ensures proper ID synchronization between timeline and overlay data
    onDuplicateItems?.(itemIds);
  }, [onDuplicateItems]);

  const handleExternalItemSplit = useCallback((itemId: string, splitTime: number) => {
    // Just call the external callback - let the parent component handle splitting
    // This ensures proper ID synchronization between timeline and overlay data
    onSplitItems?.(itemId, splitTime);
  }, [onSplitItems]);

  const handleExternalAddNewItem = useCallback((item: any) => {
    onAddNewItem?.(item);
  }, [onAddNewItem]);

  return {
    handleExternalItemMove,
    handleExternalItemResize,
    handleExternalItemsDelete,
    handleExternalItemsDuplicate,
    handleExternalItemSplit,
    handleExternalAddNewItem,
  };
}; 