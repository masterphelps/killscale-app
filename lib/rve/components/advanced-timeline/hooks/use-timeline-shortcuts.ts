import { useHotkeys } from "react-hotkeys-hook";
import { ZOOM_CONSTRAINTS } from "../constants";

interface UseTimelineShortcutsProps {
  handlePlayPause: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoomScale: number;
  setZoomScale: (scale: number) => void;
}

/**
 * A custom hook that sets up keyboard shortcuts for timeline controls
 *
 * Keyboard shortcuts:
 * - Space: Play/Pause
 * - Cmd/Ctrl + Z: Undo
 * - Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y: Redo
 * - Cmd/Ctrl + Plus/=: Zoom in
 * - Cmd/Ctrl + Minus/-: Zoom out
 *
 * @param {Object} props
 * @param {() => void} props.handlePlayPause - Function to toggle play/pause state
 * @param {() => void} props.undo - Function to handle undo operation
 * @param {() => void} props.redo - Function to handle redo operation
 * @param {boolean} props.canUndo - Whether undo operation is available
 * @param {boolean} props.canRedo - Whether redo operation is available
 * @param {number} props.zoomScale - Current zoom level
 * @param {(scale: number) => void} props.setZoomScale - Function to update zoom level
 */
export const useTimelineShortcuts = ({
  handlePlayPause,
  undo,
  redo,
  canUndo,
  canRedo,
  zoomScale,
  setZoomScale,
}: UseTimelineShortcutsProps) => {
  useHotkeys(
    "space",
    (e) => {
      // Don't trigger if user is typing in a form element
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }
      
      e.preventDefault();
      handlePlayPause();
    }
  );

  useHotkeys("meta+z, ctrl+z", (e) => {
    e.preventDefault();
    if (canUndo) undo();
  });

  useHotkeys("meta+shift+z, ctrl+shift+z, meta+y, ctrl+y", (e) => {
    e.preventDefault();
    if (canRedo) redo();
  });

  useHotkeys("meta+=, meta+plus, ctrl+=, ctrl+plus", (e) => {
    e.preventDefault();
    const newScale = Math.min(
      zoomScale + ZOOM_CONSTRAINTS.step,
      ZOOM_CONSTRAINTS.max
    );
    setZoomScale(newScale);
  });

  useHotkeys(
    "meta+-, meta+minus, ctrl+-, ctrl+minus",
    (e) => {
      e.preventDefault();
      const newScale = Math.max(
        zoomScale - ZOOM_CONSTRAINTS.step,
        ZOOM_CONSTRAINTS.min
      );
      setZoomScale(newScale);
    },
    {
      keydown: true,
      preventDefault: true,
    }
  );
}; 