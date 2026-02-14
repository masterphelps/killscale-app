import { useEditorContext } from "../contexts/editor-context";
import { Overlay, CaptionStyles, AspectRatio } from "../types";
import { useCallback } from "react";

export interface ReactVideoEditorAPI {
  // Overlays
  overlays: Overlay[];
  selectedOverlayId: number | null;
  addOverlay: (overlay: Overlay) => void;
  deleteOverlay: (overlayId: number) => void;
  updateOverlay: (overlayId: number, updates: Partial<Overlay>) => void;
  updateOverlayStyles: (overlayId: number, styles: Partial<CaptionStyles>) => void;
  duplicateOverlay: (overlayId: number) => void;
  splitOverlay: (overlayId: number, splitFrame: number) => void;
  selectOverlay: (overlayId: number | null) => void;

  // Player
  isPlaying: boolean;
  currentFrame: number;
  playbackRate: number;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (frame: number) => void;
  setPlaybackRate: (rate: number) => void;

  // Timeline
  durationInFrames: number;
  durationInSeconds: number;
  formatTime: (frame: number) => string;

  // Aspect Ratio
  aspectRatio: string;
  setAspectRatio: (ratio: AspectRatio) => void;
  playerDimensions: { width: number; height: number };

  // Project
  saveProject?: () => Promise<void>;
  resetOverlays: () => void;

  // Rendering
  renderMedia?: (params: any) => Promise<any> | void;

  // Settings
  fps: number;

  // Bulk Operations
  setOverlays: (overlays: Overlay[]) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentFrame: (frame: number) => void;
  setSelectedOverlayId: (id: number | null) => void;
}

/**
 * Enhanced useReactVideoEditor hook - the primary interface for programmatic control
 * 
 * This hook provides a unified API for controlling the video editor programmatically.
 * All state changes can be monitored using standard React useEffect patterns.
 * 
 * @returns {ReactVideoEditorAPI} Comprehensive API for video editor control
 * 
 * @example
 * ```tsx
 * // Basic usage
 * const editor = useReactVideoEditor();
 * 
 * // Control playback
 * editor.play();
 * editor.pause();
 * editor.seekTo(120);
 * 
 * // Manage overlays
 * editor.addOverlay(newOverlay);
 * editor.selectOverlay(overlayId);
 * 
 * // Monitor state changes with useEffect
 * useEffect(() => {
 *   console.log('Playback state:', editor.isPlaying, editor.currentFrame);
 * }, [editor.isPlaying, editor.currentFrame]);
 * 
 * // Bulk operations
 * editor.setOverlays(newOverlays);
 * editor.setIsPlaying(true);
 * ```
 */
export const useReactVideoEditor = (): ReactVideoEditorAPI => {
  const editorContext = useEditorContext();

  if (!editorContext) {
    throw new Error('useReactVideoEditor must be used within ReactVideoEditorProvider');
  }

  const {
    overlays,
    selectedOverlayId,
    setSelectedOverlayId,
    addOverlay,
    deleteOverlay,
    changeOverlay,
    updateOverlayStyles,
    duplicateOverlay,
    splitOverlay,
    isPlaying,
    currentFrame,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    formatTime,
    durationInFrames,
    durationInSeconds,
    aspectRatio,
    setAspectRatio,
    playerDimensions,
    saveProject,
    resetOverlays,
    renderMedia,
    fps,
    playerRef,
    setOverlays,
  } = editorContext;

  // Enhanced player controls
  const play = useCallback(() => {
    if (!isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const pause = useCallback(() => {
    if (isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const seekTo = useCallback((frame: number) => {
    if (playerRef?.current) {
      playerRef.current.seekTo(frame);
    }
  }, [playerRef]);

  // Bulk state setters for external state management
  const setIsPlaying = useCallback((playing: boolean) => {
    if (playing !== isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const setCurrentFrame = useCallback((frame: number) => {
    seekTo(frame);
  }, [seekTo]);

  // Enhanced overlay operations
  const updateOverlay = useCallback((overlayId: number, updates: Partial<Overlay>) => {
    changeOverlay(overlayId, (overlay) => ({ ...overlay, ...updates } as Overlay));
  }, [changeOverlay]);

  const selectOverlay = useCallback((overlayId: number | null) => {
    setSelectedOverlayId(overlayId);
  }, [setSelectedOverlayId]);

  return {
    // Overlays
    overlays,
    selectedOverlayId,
    addOverlay,
    deleteOverlay,
    updateOverlay,
    updateOverlayStyles,
    duplicateOverlay,
    splitOverlay,
    selectOverlay,

    // Player
    isPlaying,
    currentFrame,
    playbackRate,
    play,
    pause,
    togglePlayPause,
    seekTo,
    setPlaybackRate,

    // Timeline
    durationInFrames,
    durationInSeconds,
    formatTime,

    // Aspect Ratio
    aspectRatio,
    setAspectRatio,
    playerDimensions,

    // Project
    ...(saveProject && { saveProject }),
    resetOverlays,

    // Rendering
    renderMedia,

    // Settings
    fps,

    // Bulk Operations
    setOverlays,
    setIsPlaying,
    setCurrentFrame,
    setSelectedOverlayId,
  };
}; 