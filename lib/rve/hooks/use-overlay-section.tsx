// hooks/use-overlay-selection.tsx
import { useCallback } from "react";
import { useEditorContext } from "../contexts/editor-context";
import { useEditorSidebar } from "../contexts/sidebar-context";
import { Overlay, OverlayType } from "../types";

/**
 * A custom hook that manages overlay selection in the editor.
 *
 * @returns {Object} An object containing:
 *   - handleOverlaySelect: A callback function to handle overlay selection and update the sidebar panel
 *
 * @example
 * const { handleOverlaySelect } = useOverlaySelection();
 * // Later in your component:
 * <OverlayComponent onClick={() => handleOverlaySelect(overlay)} />
 */
export const useOverlaySelection = () => {
  // Try to get the editor context, but don't fail if it's not available
  // This allows the hook to work in rendering contexts where EditorProvider is not available
  let setSelectedOverlayId: ((id: number) => void) | null = null;
  let setActivePanel: ((panel: OverlayType) => void) | null = null;
  let setIsOpen: ((open: boolean) => void) | null = null;

  try {
    const editorContext = useEditorContext();
    setSelectedOverlayId = editorContext.setSelectedOverlayId;
  } catch (error) {
    // EditorContext not available (e.g., in remotion bundle)
    // This is expected in rendering contexts
  }

  try {
    const sidebarContext = useEditorSidebar();
    setActivePanel = sidebarContext.setActivePanel;
    setIsOpen = sidebarContext.setIsOpen;
  } catch (error) {
    // SidebarContext not available (e.g., in remotion bundle)
    // This is expected in rendering contexts
  }

  const handleOverlaySelect = useCallback(
    (overlay: Overlay) => {
      // Only perform selection logic if we're in an interactive context
      if (setSelectedOverlayId) {
        setSelectedOverlayId(overlay.id);
      }

      // Only perform sidebar logic if we're in an interactive context
      if (setActivePanel && setIsOpen) {
        // Set the appropriate sidebar panel based on overlay type
        switch (overlay.type) {
          case OverlayType.TEXT:
            setActivePanel(OverlayType.TEXT);
            break;
          case OverlayType.VIDEO:
            setActivePanel(OverlayType.VIDEO);
            break;
          case OverlayType.SOUND:
            setActivePanel(OverlayType.SOUND);
            break;
          case OverlayType.STICKER:
            setActivePanel(OverlayType.STICKER);
            break;
          case OverlayType.IMAGE:
            setActivePanel(OverlayType.IMAGE);
            break;
          case OverlayType.CAPTION:
            setActivePanel(OverlayType.CAPTION);
            break;
        }
        
        // Open the sidebar to show the selected overlay's panel
        setIsOpen(true);
      }
    },
    [setSelectedOverlayId, setActivePanel, setIsOpen]
  );

  return { handleOverlaySelect };
};
