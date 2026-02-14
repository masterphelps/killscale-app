import React from "react";
import { ImageOverlay } from "../../../types";
import { AnimationSettings } from "../../shared/animation/animation-settings";
import { VisualLayoutSettings } from "../../shared/visual-layout/visual-layout-settings";
import { CropSettings } from "../video/crop-settings";
import { PositionSettings } from "../../shared/position/position-settings";

/**
 * Props for the ImageSettingsPanel component
 */
interface ImageSettingsPanelProps {
  /** The current state of the image overlay being edited */
  localOverlay: ImageOverlay;
  /** Callback to update the overlay's style properties */
  handleStyleChange: (updates: Partial<ImageOverlay["styles"]>) => void;
  /** Callback to update the overlay's position and size */
  onPositionChange?: (updates: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }) => void;
}

/**
 * ImageSettingsPanel Component
 *
 * A panel that allows users to configure crop, animation and 3D layout settings for an image overlay.
 * Provides options to set both enter and exit animations from a predefined set
 * of animation templates, as well as 3D layout transformations.
 *
 * Features:
 * - Positioning controls for quick layout adjustments
 * - Crop settings with aspect ratio presets
 * - Enter animation selection
 * - Exit animation selection
 * - 3D layout transformation selection
 * - Option to remove animations and 3D effects ("None" selection)
 */
export const ImageSettingsPanel: React.FC<ImageSettingsPanelProps> = ({
  localOverlay,
  handleStyleChange,
  onPositionChange,
}) => {
  // Handlers for animation selection
  const handleEnterAnimationSelect = (animationKey: string) => {
    handleStyleChange({
      animation: {
        ...localOverlay.styles.animation,
        enter: animationKey === "none" ? "" : animationKey,
      },
    });
  };

  const handleExitAnimationSelect = (animationKey: string) => {
    handleStyleChange({
      animation: {
        ...localOverlay.styles.animation,
        exit: animationKey === "none" ? "" : animationKey,
      },
    });
  };

  const handleLayout3DSelect = (layoutKey: string) => {
    const updates: Partial<ImageOverlay["styles"]> = {
      layout3D: {
        layout: layoutKey === "none" ? "" : layoutKey,
      },
    };
    
    // Clear padding when applying a 3D layout effect
    if (layoutKey !== "none") {
      updates.padding = "0px";
      updates.paddingBackgroundColor = "white";
    }
    
    handleStyleChange(updates);
  };

  return (
    <div className="space-y-2">
      {/* Positioning Controls */}

      <CropSettings
        localOverlay={localOverlay as any}
        handleStyleChange={handleStyleChange}
        />

        {onPositionChange && (
          <PositionSettings
            overlayWidth={localOverlay.width}
            overlayHeight={localOverlay.height}
            onPositionChange={onPositionChange}
          />
        )}
        
      <AnimationSettings
        selectedEnterAnimation={localOverlay.styles.animation?.enter || "none"}
        selectedExitAnimation={localOverlay.styles.animation?.exit || "none"}
        onEnterAnimationSelect={handleEnterAnimationSelect}
        onExitAnimationSelect={handleExitAnimationSelect}
      />
      
      <VisualLayoutSettings
        selectedLayout={localOverlay.styles.layout3D?.layout || "none"}
        onLayoutSelect={handleLayout3DSelect}
      />
    </div>
  );
};
