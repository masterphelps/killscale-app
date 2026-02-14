import React from "react";
import { ImageOverlay } from "../../../types";
import { ImageStylePanel } from "./image-style-panel";
import { ImageSettingsPanel } from "./image-settings-panel";
import { ImagePreview } from "./image-preview";
import { ImageAIPanel } from "./image-ai-panel";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Settings, PaintBucket, Sparkles } from "lucide-react";

/**
 * Props for the ImageDetails component
 * @interface ImageDetailsProps
 * @property {ImageOverlay} localOverlay - Current image overlay being edited
 * @property {Function} setLocalOverlay - Function to update the image overlay
 * @property {Function} onChangeImage - Optional callback to initiate image replacement
 */
interface ImageDetailsProps {
  localOverlay: ImageOverlay;
  setLocalOverlay: (overlay: ImageOverlay) => void;
  onChangeImage?: () => void;
}

/**
 * ImageDetails Component
 *
 * @component
 * @description
 * Provides a tabbed interface for managing image settings and styles.
 * Features include:
 * - Image preview
 * - Style customization panel
 * - Settings configuration panel
 * - Real-time updates
 *
 * The component serves as the main configuration interface
 * for image overlays in the editor.
 *
 * @example
 * ```tsx
 * <ImageDetails
 *   localOverlay={imageOverlay}
 *   setLocalOverlay={handleOverlayUpdate}
 *   onChangeImage={startReplaceMode}
 * />
 * ```
 */
export const ImageDetails: React.FC<ImageDetailsProps> = ({
  localOverlay,
  setLocalOverlay,
  onChangeImage,
}) => {
  const handleStyleChange = (updates: Partial<ImageOverlay["styles"]>) => {
    const updatedOverlay = {
      ...localOverlay,
      styles: {
        ...localOverlay.styles,
        ...updates,
      },
    };
    setLocalOverlay(updatedOverlay);
  };

  /**
   * Handles position and size changes for the image overlay
   */
  const handlePositionChange = (updates: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }) => {
    const updatedOverlay = {
      ...localOverlay,
      ...updates,
    };
    setLocalOverlay(updatedOverlay);
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      <ImagePreview overlay={localOverlay} onChangeImage={onChangeImage} />

      <UnifiedTabs
        tabs={[
          {
            value: "settings",
            label: "Settings",
            icon: <Settings className="w-4 h-4" />,
            content: (
              <ImageSettingsPanel
                localOverlay={localOverlay}
                handleStyleChange={handleStyleChange}
                onPositionChange={handlePositionChange}
              />
            ),
          },
          {
            value: "style",
            label: "Style",
            icon: <PaintBucket className="w-4 h-4" />,
            content: (
              <ImageStylePanel
                localOverlay={localOverlay}
                handleStyleChange={handleStyleChange}
              />
            ),
          },
          {
            value: "ai",
            label: "AI",
            icon: <Sparkles className="w-4 h-4" />,
            content: (
              <ImageAIPanel
                localOverlay={localOverlay}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
