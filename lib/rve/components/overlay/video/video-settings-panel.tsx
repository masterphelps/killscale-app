import React from "react";
import { ClipOverlay } from "../../../types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Toggle } from "../../ui/toggle";
import { AnimationSettings } from "../../shared/animation/animation-settings";
import { CropSettings } from "./crop-settings";
import { PositionSettings } from "../../shared/position/position-settings";

const SPEED_OPTIONS = [
  { value: 0.25, label: "0.25x" },
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x (Normal)" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 1.75, label: "1.75x" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
  { value: 4, label: "4x" },
];

/**
 * Props for the VideoSettingsPanel component
 * @interface VideoSettingsPanelProps
 * @property {ClipOverlay} localOverlay - The current overlay object containing video settings and styles
 * @property {Function} handleStyleChange - Callback function to update overlay styles
 * @property {Function} onSpeedChange - Callback function to update speed and duration
 * @property {Function} onPositionChange - Callback function to update overlay position and size
 */
interface VideoSettingsPanelProps {
  localOverlay: ClipOverlay;
  handleStyleChange: (updates: Partial<ClipOverlay["styles"]>) => void;
  onSpeedChange?: (speed: number, newDuration: number) => void;
  onPositionChange?: (updates: { left?: number; top?: number; width?: number; height?: number }) => void;
}

/**
 * VideoSettingsPanel Component
 *
 * A panel that provides controls for configuring video overlay settings including:
 * - Positioning controls for quick layout adjustments
 * - Volume control with mute/unmute functionality
 * - Playback speed control
 * - Enter/Exit animation selection
 *
 * The component uses a local overlay state and provides a UI for users to modify
 * video-specific settings. Changes are propagated through the handleStyleChange callback.
 *
 * @component
 * @param {VideoSettingsPanelProps} props - Component props
 * @returns {JSX.Element} The rendered settings panel
 */
export const VideoSettingsPanel: React.FC<VideoSettingsPanelProps> = ({
  localOverlay,
  handleStyleChange,
  onSpeedChange,
  onPositionChange,
}) => {
  // Add state to control select open state
  const [isSelectOpen, setIsSelectOpen] = React.useState(false);

  // Cleanup effect for unmounting
  React.useEffect(() => {
    return () => {
      // Ensure select is closed when component unmounts
      setIsSelectOpen(false);
    };
  }, []);

  const handleSpeedChange = (newSpeed: number) => {
    if (localOverlay) {
      // Get the base duration (duration at 1x speed)
      const baseDuration =
        localOverlay.durationInFrames * (localOverlay.speed ?? 1);
      // Calculate new duration based on new speed
      const newDuration = Math.round(baseDuration / newSpeed);

      if (onSpeedChange) {
        onSpeedChange(newSpeed, newDuration);
      } else {
        console.warn(
          "onSpeedChange not provided, speed changes will not work. Please provide onSpeedChange prop to handle speed updates."
        );
      }
      // Close select after change
      setIsSelectOpen(false);
    }
  };

  // Handlers for animation selection
  const handleEnterAnimationSelect = (animationKey: string) => {
    handleStyleChange({
      animation: {
        ...localOverlay?.styles?.animation,
        enter: animationKey === "none" ? "" : animationKey,
      },
    });
  };

  const handleExitAnimationSelect = (animationKey: string) => {
    handleStyleChange({
      animation: {
        ...localOverlay?.styles?.animation,
        exit: animationKey === "none" ? "" : animationKey,
      },
    });
  };

  return (
    <div className="space-y-2">
     
      {/* Crop Settings */}
      <CropSettings
        localOverlay={localOverlay}
        handleStyleChange={handleStyleChange}
      />

       {/* Positioning Controls */}
       {onPositionChange && (
        <PositionSettings
          overlayWidth={localOverlay.width}
          overlayHeight={localOverlay.height}
          onPositionChange={onPositionChange}
        />
      )}


      {/* Volume Settings */}
      <div className="space-y-2 rounded-md bg-card p-4 border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extralight text-foreground">
            Volume
          </h3>
          <Toggle
            pressed={(localOverlay?.styles?.volume ?? 1) === 0}
            onPressedChange={(pressed) =>
              handleStyleChange({
                volume: pressed ? 0 : 1,
              })
            }
            size="sm"
            className="text-xs text-foreground   "
          >
            {(localOverlay?.styles?.volume ?? 1) === 0 ? "Unmute" : "Mute"}
          </Toggle>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Slider
            value={[localOverlay?.styles?.volume ?? 1]}
            onValueChange={(value) =>
              handleStyleChange({ volume: value[0] })
            }
            min={0}
            max={1}
            step={0.1}
            className="flex-1"
          />
          <span className="text-xs min-w-[40px] text-right">
            {Math.round((localOverlay?.styles?.volume ?? 1) * 100)}%
          </span>
        </div>
      </div>

      {/* Speed Settings */}
      <div className="space-y-2 rounded-md bg-card p-4 border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extralight text-foreground">
            Playback Speed
          </h3>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Select
            open={isSelectOpen}
            onOpenChange={setIsSelectOpen}
            value={String(localOverlay?.speed ?? 1)}
            onValueChange={(value) => handleSpeedChange(parseFloat(value))}
          >
            <SelectTrigger className="w-full font-extralight shadow-xs text-foreground">
              <SelectValue className="text-foreground" placeholder="Select speed" />
            </SelectTrigger>
            <SelectContent>
              {SPEED_OPTIONS.map((option) => (
                <SelectItem className="font-extralight text-foreground" key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Animation Settings - Using the new AnimationSettings component */}
      <AnimationSettings
        selectedEnterAnimation={localOverlay?.styles?.animation?.enter || "none"}
        selectedExitAnimation={localOverlay?.styles?.animation?.exit || "none"}
        onEnterAnimationSelect={handleEnterAnimationSelect}
        onExitAnimationSelect={handleExitAnimationSelect}
      />
    </div>
  );
};
