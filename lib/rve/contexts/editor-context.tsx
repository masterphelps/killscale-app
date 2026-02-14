import React, { createContext, useContext, ReactNode } from "react";
import { Overlay, AspectRatio, CaptionStyles } from "../types";

// Define the shape of the context
export interface EditorContextProps {
  // Overlay Management
  overlays: Overlay[]; // Array of all overlays in the editor
  selectedOverlayId: number | null; // Currently selected overlay's ID
  setSelectedOverlayId: any; // Function to select an overlay
  // Multi-select support
  selectedOverlayIds: number[]; // Array of currently selected overlay IDs
  setSelectedOverlayIds: (ids: number[]) => void; // Function to set multiple selected overlays
  changeOverlay: (
    // Function to update overlay properties
    id: number,
    updater: Partial<Overlay> | ((overlay: Overlay) => Overlay)
  ) => void;
  setOverlays: (overlays: Overlay[]) => void;

  // Player State
  isPlaying: boolean; // Current playback state
  currentFrame: number; // Current frame position in the video
  playerRef: React.RefObject<any>; // Reference to the video player component
  playbackRate: number; // Current playback speed multiplier
  setPlaybackRate: (rate: number) => void; // Update playback speed

  // Player Controls
  togglePlayPause: () => void; // Toggle play/pause state
  play: () => void; // Start playback
  pause: () => void; // Pause playback
  seekTo: (frame: number) => void; // Seek to specific frame
  formatTime: (frame: number) => string; // Convert frame number to timestamp
  handleTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void; // Handle timeline scrubbing

  // Overlay Operations
  handleOverlayChange: (updatedOverlay: Overlay) => void; // Handle changes to overlay properties
  addOverlay: (overlay: Overlay) => void; // Add new overlay
  deleteOverlay: (id: number) => void; // Remove overlay
  duplicateOverlay: (id: number) => void; // Clone existing overlay
  splitOverlay: (id: number, splitPosition: number) => void; // Split overlay at given position

  // Video Dimensions and Aspect Ratio
  aspectRatio: AspectRatio; // Current aspect ratio setting
  setAspectRatio: (ratio: AspectRatio) => void; // Update aspect ratio
  playerDimensions: { width: number; height: number }; // Current player dimensions
  updatePlayerDimensions: (width: number, height: number) => void; // Update player size
  getAspectRatioDimensions: () => { width: number; height: number }; // Calculate dimensions based on ratio

  // Video Properties
  durationInFrames: number; // Total number of frames
  durationInSeconds: number; // Total duration in seconds
  renderMedia: () => void; // Trigger media rendering
  state: any; // General state object with proper typing
  renderState: any; // Separate render state to prevent unnecessary re-renders

  // Timeline
  deleteOverlaysByRow: (row: number) => void; // Delete overlays by row

  // New style management prop
  updateOverlayStyles: (
    overlayId: number,
    styles: Partial<CaptionStyles>
  ) => void;

  // New resetOverlays prop
  resetOverlays: () => void;

  // Autosave functionality
  saveProject?: () => Promise<void>; // Manual save function
  
  // Loading state
  isInitialLoadComplete: boolean; // Whether the initial autosave check is complete

  // Add renderType to the context
  renderType: string;

  // Add fps to the context
  fps: number;

  // API Configuration
  baseUrl?: string;

  // Configuration
  initialRows: number;
  maxRows: number;
  zoomConstraints: {
    min: number;
    max: number;
    step: number;
    default: number;
  };
  snappingConfig: {
    thresholdFrames: number;
    enableVerticalSnapping: boolean;
  };
  disableMobileLayout: boolean;
  disableVideoKeyframes: boolean;
  enablePushOnDrag: boolean;
  videoWidth: number;
  videoHeight: number;
  
  // Alignment Guides
  showAlignmentGuides: boolean;
  setShowAlignmentGuides: (show: boolean) => void;

  // Settings
  backgroundColor: string;
  setBackgroundColor: (color: string) => void;
  
  // Timeline Height Settings
  trackHeight: number;
  setTrackHeight: (height: number) => void;
  timelineItemHeight: number;
  setTimelineItemHeight: (height: number) => void;
}

// Create the context with undefined as default value
const EditorContext = createContext<EditorContextProps | undefined>(undefined);

// Provider component that wraps parts of the app that need access to the context
export const EditorProvider: React.FC<{
  value: EditorContextProps;
  children: ReactNode;
}> = ({ value, children }) => {
  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
};

// Custom hook that components can use to access the context
// Throws an error if used outside of EditorProvider
export const useEditorContext = (): EditorContextProps => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
};
