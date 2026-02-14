import React from "react";
import { ClipOverlay } from "../../../types";
import { MediaFilterPresetSelector } from "../common/media-filter-preset-selector";
import { MediaPaddingControls } from "../common/media-padding-controls";
import { Slider } from "../../ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

/**
 * Props for the VideoStylePanel component
 * @interface VideoStylePanelProps
 * @property {ClipOverlay} localOverlay - The current overlay object containing video styles
 * @property {Function} handleStyleChange - Callback function to update overlay styles
 */
interface VideoStylePanelProps {
  localOverlay: ClipOverlay;
  handleStyleChange: (updates: Partial<ClipOverlay["styles"]>) => void;
}

/**
 * VideoStylePanel Component
 *
 * A panel that provides controls for styling video overlays. It allows users to adjust:
 * - Object fit (cover, contain, fill)
 * - Border radius
 * - Brightness
 * - Filter presets (retro, vintage, Wes Anderson, etc.)
 * - Padding and padding background color
 *
 * The component uses a local overlay state and propagates changes through the handleStyleChange callback.
 * All style controls maintain both light and dark theme compatibility.
 *
 * @component
 * @param {VideoStylePanelProps} props - Component props
 * @returns {JSX.Element} A styled form containing video appearance controls
 */
export const VideoStylePanel: React.FC<VideoStylePanelProps> = ({
  localOverlay,
  handleStyleChange,
}) => {
  return (
    <div className="space-y-2">
      {/* Appearance Settings */}
      <div className="space-y-4 rounded-md bg-card p-4 border">
        <h3 className="text-sm font-extralight text-foreground">Appearance</h3>

        <div className="space-y-2">
          <label className="text-xs font-extralight">
            Fit
          </label>
          <Select
            value={localOverlay?.styles?.objectFit ?? "cover"}
            onValueChange={(value) =>
              handleStyleChange({ objectFit: value as any })
            }
          >
            <SelectTrigger className="w-full font-extralight shadow-none">
              <SelectValue placeholder="Select fit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter Preset Selector */}
        <MediaFilterPresetSelector
          localOverlay={localOverlay}
          handleStyleChange={handleStyleChange}
        />

        {/* Border Radius */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extralight">
              Border Radius
            </label>
            <span className="text-xs min-w-[40px] text-right">
              {localOverlay?.styles?.borderRadius ?? "0px"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[
                parseInt(localOverlay?.styles?.borderRadius ?? "0")
              ]}
              onValueChange={(value) =>
                handleStyleChange({ borderRadius: `${value[0]}px` })
              }
              min={0}
              max={50}
              step={1}
              className="flex-1"
            />
          </div>
        </div>

        {/* Brightness */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extralight">Brightness</label>
            <span className="text-xs min-w-[40px] text-right">
              {parseInt(
                localOverlay?.styles?.filter?.match(
                  /brightness\((\d+)%\)/
                )?.[1] ?? "100"
              )}
              %
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[
                parseInt(
                  localOverlay?.styles?.filter?.match(
                    /brightness\((\d+)%\)/
                  )?.[1] ?? "100"
                ),
              ]}
              onValueChange={(value) => {
                const currentFilter = localOverlay?.styles?.filter || "";
                const newFilter =
                  currentFilter.replace(/brightness\(\d+%\)/, "") +
                  ` brightness(${value[0]}%)`;
                handleStyleChange({ filter: newFilter.trim() });
              }}
              min={0}
              max={200}
              step={10}
              className="flex-1"
            />
          </div>
        </div>

        {/* Media Padding Controls */}
        <MediaPaddingControls
          localOverlay={localOverlay}
          handleStyleChange={handleStyleChange}
        />
      </div>
    </div>
  );
};
