import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimelineItem } from '../types';

// Type for ghost element data during drag operations
export interface GhostInstanceData {
  id: string;
  left: number;
  width: number;
  top: number;
}

// Type for floating ghost data
export interface FloatingGhostData {
  position: { x: number; y: number };
  width: number;
  isValid: boolean;
  itemData?: {
    type?: string;
    label?: string;
  };
}

// Type for drag information
export interface DragInfoState {
  id: string;
  action: "move" | "resize-start" | "resize-end";
  startX: number;
  startY: number;
  startPosition: number; // start time in seconds
  startDuration: number; // duration in seconds
  startRow: number;
  ghostLeft?: number;
  ghostWidth?: number;
  ghostTop?: number;
  isValidDrop: boolean;
  selectedItemsSnapshot: DraggedItemSnapshot[];
  currentRow?: number;
  finalSnappedFrom?: number;
  finalSnappedRow?: number;
  currentStart?: number;
  currentDuration?: number;
}

// Type for dragged item snapshot
export interface DraggedItemSnapshot {
  id: string;
  originalStart: number; // start time in seconds
  originalDuration: number; // duration in seconds
  originalRow: number;
  type?: string;
  label?: string;
  data?: any;
  mediaStart?: number; // Media offset start time
  mediaSrcDuration?: number; // Total source media duration
  speed?: number; // Playback speed multiplier
}

// Type for new item drag state
export interface NewItemDragState {
  isDragging: boolean;
  itemType: string | null;
  ghostElement: {
    left: number;
    width: number;
    top: number;
  } | null;
  itemData?: {
    type?: string;
    label?: string;
    duration?: number;
  };
}

interface TimelineState {
  ghostMarkerPosition: number | null;
  isDragging: boolean;
  isPlayheadDragging: boolean; // New state to track playhead dragging
  isContextMenuOpen: boolean;
  timelineRef: React.RefObject<HTMLDivElement> | null;
  
  // Drag and drop state
  draggedItem: TimelineItem | null;
  ghostElement: GhostInstanceData[] | null;
  floatingGhost: FloatingGhostData | null;
  isValidDrop: boolean;
  dragInfo: DragInfoState | null;
  
  // New item drag state
  newItemDragState: NewItemDragState;
  
  // Live preview updates during drag
  livePreviewUpdates: Map<string, Partial<TimelineItem>>;

  // Row insertion indicator (between tracks)
  insertionIndex: number | null;
  magneticPreview: { // New state for magnetic preview
    trackId: string;
    previewItems: Array<{ id: string; start: number; end: number; duration: number }>;
  } | null;
  
  // Current drag position for guidelines
  currentDragPosition: {
    start: number;
    end: number;
    trackIndex: number;
  } | null;
}

export interface ITimelineStore extends TimelineState {
  // Basic setters
  setGhostMarkerPosition: (position: number | null) => void;
  setIsDragging: (isDragging: boolean) => void;
  setIsPlayheadDragging: (isPlayheadDragging: boolean) => void;
  setIsContextMenuOpen: (isOpen: boolean) => void;
  setTimelineRef: (ref: React.RefObject<HTMLDivElement>) => void;
  
  // Drag and drop setters
  setDraggedItem: (item: TimelineItem | null) => void;
  setGhostElement: (ghostElement: GhostInstanceData[] | null) => void;
  setFloatingGhost: (floatingGhost: FloatingGhostData | null) => void;
  setIsValidDrop: (isValid: boolean) => void;
  setDragInfo: (dragInfo: DragInfoState | null) => void;
  getDragInfo: () => DragInfoState | null;
  
  // New item drag
  setNewItemDragState: (state: NewItemDragState) => void;
  
  // Live preview
  setLivePreviewUpdates: (updates: Map<string, Partial<TimelineItem>>) => void;
  updateLivePreview: (itemId: string | null, updates: Partial<TimelineItem> | null) => void;
  
  // Insertion indicator
  setInsertionIndex: (index: number | null) => void;
  getInsertionIndex: () => number | null;
  
  // Magnetic preview
  setMagneticPreview: (preview: { trackId: string; previewItems: Array<{ id: string; start: number; end: number; duration: number }> } | null) => void;
  
  // Current drag position for guidelines
  setCurrentDragPosition: (position: { start: number; end: number; trackIndex: number } | null) => void;
  
  // Reset functions
  resetDragState: () => void;
  clearAllState: () => void;
}

const useTimelineStore = create<ITimelineStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ghostMarkerPosition: null,
      isDragging: false,
      isPlayheadDragging: false, // Initialize new state
      isContextMenuOpen: false,
      timelineRef: null,
      draggedItem: null,
      ghostElement: null,
      floatingGhost: null,
      isValidDrop: true,
      dragInfo: null,
      newItemDragState: {
        isDragging: false,
        itemType: null,
        ghostElement: null,
      },
      livePreviewUpdates: new Map(),
      insertionIndex: null,
      magneticPreview: null,
      currentDragPosition: null,

      // Basic setters
      setGhostMarkerPosition: (position: number | null) => {
        set({ ghostMarkerPosition: position });
      },

      setIsDragging: (isDragging: boolean) => {
        set({ isDragging });
      },

      setIsPlayheadDragging: (isPlayheadDragging: boolean) => {
        set({ isPlayheadDragging });
      },

      setIsContextMenuOpen: (isOpen: boolean) => {
        set({ isContextMenuOpen: isOpen });
      },

      setTimelineRef: (ref: React.RefObject<HTMLDivElement>) => {
        set({ timelineRef: ref });
      },

      // Drag and drop setters
      setDraggedItem: (item: TimelineItem | null) => {
        set({ draggedItem: item });
      },

      setGhostElement: (ghostElement: GhostInstanceData[] | null) => {
        set({ ghostElement });
      },

      setFloatingGhost: (floatingGhost: FloatingGhostData | null) => {
        set({ floatingGhost });
      },

      setIsValidDrop: (isValid: boolean) => {
        set({ isValidDrop: isValid });
      },

      setDragInfo: (dragInfo: DragInfoState | null) => {
        set({ dragInfo });
      },

      getDragInfo: () => {
        return get().dragInfo;
      },

      // New item drag
      setNewItemDragState: (state: NewItemDragState) => {
        set({ newItemDragState: state });
      },

      // Live preview
      setLivePreviewUpdates: (updates: Map<string, Partial<TimelineItem>>) => {
        set({ livePreviewUpdates: updates });
      },

      updateLivePreview: (itemId: string | null, updates: Partial<TimelineItem> | null) => {
        const currentUpdates = get().livePreviewUpdates;
        const newMap = new Map(currentUpdates);

        if (itemId === null && updates === null) {
          // Clear all previews
          newMap.clear();
        } else if (itemId !== null && updates === null) {
          // Clear preview for specific item
          newMap.delete(itemId);
        } else if (itemId !== null && updates !== null) {
          // Update preview for specific item
          newMap.set(itemId, {
            ...currentUpdates.get(itemId),
            ...updates,
          });
        }

        set({ livePreviewUpdates: newMap });
      },

      // Insertion indicator
      setInsertionIndex: (index: number | null) => {
        set({ insertionIndex: index });
      },
      getInsertionIndex: () => get().insertionIndex,

      // Magnetic preview
      setMagneticPreview: (preview: { trackId: string; previewItems: Array<{ id: string; start: number; end: number; duration: number }> } | null) => {
        set({ magneticPreview: preview });
      },

      // Current drag position for guidelines
      setCurrentDragPosition: (position: { start: number; end: number; trackIndex: number } | null) => {
        set({ currentDragPosition: position });
      },

      // Reset functions
      resetDragState: () => {
        set({
          draggedItem: null,
          ghostElement: null,
          floatingGhost: null,
          isValidDrop: false,
          dragInfo: null,
          isDragging: false,
          insertionIndex: null,
          magneticPreview: null, // Clear magnetic preview
          currentDragPosition: null, // Clear current drag position
        });
      },

      clearAllState: () => {
        set({
          ghostMarkerPosition: null,
          isDragging: false,
          isContextMenuOpen: false,
          draggedItem: null,
          ghostElement: null,
          floatingGhost: null,
          isValidDrop: true,
          dragInfo: null,
          newItemDragState: {
            isDragging: false,
            itemType: null,
            ghostElement: null,
          },
          livePreviewUpdates: new Map(),
          insertionIndex: null,
        });
      },
    }),
    {
      name: 'advanced-timeline-store',
      partialize: () => ({}), // Don't persist any state
    }
  )
);

export default useTimelineStore; 