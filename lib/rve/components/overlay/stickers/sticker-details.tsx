import React from "react";
import { StickerOverlay } from "../../../types";

import { UnifiedTabs } from "../shared/unified-tabs";
import { StickerStylesPanel } from "./sticker-styles-panel";
import { StickerSettingsPanel } from "./sticker-settings-panel";

/**
 * Props for the StickerDetails component
 * @interface StickerDetailsProps
 * @property {StickerOverlay} localOverlay - Current sticker overlay being edited
 * @property {Function} setLocalOverlay - Function to update the sticker overlay
 */
interface StickerDetailsProps {
  localOverlay: StickerOverlay;
  setLocalOverlay: (overlay: StickerOverlay) => void;
}

/**
 * StickerDetails Component
 *
 * @component
 * @description
 * Provides a tabbed interface for managing sticker settings and styles.
 * Features include:
 * - Sticker preview
 * - Style customization panel
 * - Settings configuration panel
 * - Real-time updates
 *
 * The component serves as the main configuration interface
 * for sticker overlays in the editor.
 *
 * @example
 * ```tsx
 * <StickerDetails
 *   localOverlay={stickerOverlay}
 *   setLocalOverlay={handleOverlayUpdate}
 * />
 * ```
 */
export const StickerDetails: React.FC<StickerDetailsProps> = ({
  localOverlay,
  setLocalOverlay,
}) => {
  const handleStyleChange = (updates: Partial<StickerOverlay["styles"]>) => {
    const updatedOverlay = {
      ...localOverlay,
      styles: {
        ...localOverlay.styles,
        ...updates,
      },
    };
    setLocalOverlay(updatedOverlay);
  };

  return (
    <div className="space-y-4">
      <UnifiedTabs
        settingsContent={
          <StickerSettingsPanel
            localOverlay={localOverlay}
            handleStyleChange={handleStyleChange}
          />
        }
        styleContent={
          <StickerStylesPanel />
        }
      />
    </div>
  );
}; 