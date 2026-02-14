import React from "react";
import { ClipOverlay, ImageOverlay } from "../../../types";
import { Slider } from "../../ui/slider";
import { Button } from "../../ui/button";
import ColorPicker from "react-best-gradient-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

/**
 * Props for the MediaPaddingControls component
 * @interface MediaPaddingControlsProps
 * @property {ClipOverlay | ImageOverlay} localOverlay - The current overlay object containing styles
 * @property {Function} handleStyleChange - Callback function to update overlay styles
 */
interface MediaPaddingControlsProps {
  localOverlay: ClipOverlay | ImageOverlay;
  handleStyleChange: (
    updates: Partial<ClipOverlay["styles"] | ImageOverlay["styles"]>
  ) => void;
}

/**
 * MediaPaddingControls Component
 *
 * A reusable component for controlling padding and padding background color
 * for both video and image overlays.
 *
 * @component
 * @param {MediaPaddingControlsProps} props - Component props
 * @returns {JSX.Element} UI controls for padding and padding background
 */
export const MediaPaddingControls: React.FC<MediaPaddingControlsProps> = ({
  localOverlay,
  handleStyleChange,
}) => {
  // Extract current padding value or set default
  const paddingValue = localOverlay?.styles?.padding || "0px";
  const paddingMatch = paddingValue.match(/^(\d+)px$/);
  const numericPadding = paddingMatch ? parseInt(paddingMatch[1], 10) : 0;

  // Extract current padding background color or set default
  const paddingBackgroundColor =
    localOverlay?.styles?.paddingBackgroundColor || "white";

  return (
    <div className="space-y-4">
      {/* Padding Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground font-extralight">
            Padding
          </label>
          <span className="text-xs min-w-[40px] text-right">
            {paddingValue}
          </span>
        </div>
        <Slider
          value={[numericPadding]}
          onValueChange={(value) =>
            handleStyleChange({ padding: `${value[0]}px` })
          }
          min={0}
          max={100}
          step={5}
          className="w-full"
        />
      </div>

      {/* Padding Background Color */}
      <div className="space-y-2">
        <label className="text-xs text-foreground font-extralight">
          Padding Background
        </label>
        <div className="flex items-center gap-2">
          <div className="space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <div
                      className="h-8 w-8 rounded-md border cursor-pointer"
                      style={{ backgroundColor: paddingBackgroundColor }}
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[330px] bg-card"
                    side="right"
                  >
                    {/* // TODO - check I think this might break render for colours */}
                    <ColorPicker
                      value={paddingBackgroundColor}
                      onChange={(color) => handleStyleChange({ paddingBackgroundColor: color })}
                      // hideInputs
                      hideHue
                      hideControls
                      hideColorTypeBtns
                      hideAdvancedSliders
                      hideColorGuide
                      hideInputType
                      height={200}
                    />
                          </PopoverContent>
                </Popover>
              </div>
          <input
            type="text"
            value={paddingBackgroundColor}
            onChange={(e) =>
              handleStyleChange({ paddingBackgroundColor: e.target.value })
            }
            placeholder="white"
            className="flex-1 bg-background border rounded-md text-xs p-2 hover:border transition-colors text-primary"
          />
          {paddingBackgroundColor !== "white" && (
            <Button
              onClick={() =>
                handleStyleChange({ paddingBackgroundColor: "white" })
              }
              variant="ghost"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
