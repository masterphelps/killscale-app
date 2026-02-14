import React from "react";
import { ClipOverlay } from "../../../types";
import { generateClipPath } from "../../../utils/crop-utils";
import { Switch } from "../../ui/switch";
import { Crop } from "lucide-react";
import { Separator } from "../../ui/separator";


const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:5", label: "4:5", ratio: 4 / 5 },
  { value: "5:4", label: "5:4", ratio: 5 / 4 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "21:9", label: "21:9", ratio: 21 / 9 },
];

interface CropSettingsProps {
  localOverlay: ClipOverlay;
  handleStyleChange: (updates: Partial<ClipOverlay["styles"]>) => void;
}

/**
 * CropSettings Component
 * 
 * Provides crop controls for video overlays including:
 * - Enable/disable crop toggle in the header
 * - Preset aspect ratio buttons for quick cropping
 * - Visual aspect ratio indicators
 * - Reset crop button
 */
export const CropSettings: React.FC<CropSettingsProps> = ({
  localOverlay,
  handleStyleChange,
}) => {
  const isCropEnabled = localOverlay?.styles?.cropEnabled ?? false;

  /**
   * Calculates and applies an aspect ratio crop to the video
   * Centers the crop and makes it as large as possible while maintaining the ratio
   */
  const handleApplyAspectRatio = (targetRatio: number) => {
    if (!localOverlay) return;

    // Get the video's current dimensions
    const videoWidth = localOverlay.width;
    const videoHeight = localOverlay.height;
    const videoRatio = videoWidth / videoHeight;

    let cropWidth: number;
    let cropHeight: number;
    let cropX: number;
    let cropY: number;

    if (videoRatio > targetRatio) {
      // Video is wider than target ratio - crop width
      cropHeight = 100;
      cropWidth = (targetRatio * videoHeight / videoWidth) * 100;
      cropX = (100 - cropWidth) / 2;
      cropY = 0;
    } else {
      // Video is taller than target ratio - crop height
      cropWidth = 100;
      cropHeight = (videoWidth / (targetRatio * videoHeight)) * 100;
      cropX = 0;
      cropY = (100 - cropHeight) / 2;
    }

    // Round values for cleaner numbers
    const roundedCropX = Math.round(cropX * 100) / 100;
    const roundedCropY = Math.round(cropY * 100) / 100;
    const roundedCropWidth = Math.round(cropWidth * 100) / 100;
    const roundedCropHeight = Math.round(cropHeight * 100) / 100;

    // Generate clipPath using utility function
    const clipPath = generateClipPath(roundedCropX, roundedCropY, roundedCropWidth, roundedCropHeight);

    const updates = {
      cropEnabled: true,
      cropX: roundedCropX,
      cropY: roundedCropY,
      cropWidth: roundedCropWidth,
      cropHeight: roundedCropHeight,
      clipPath,
    };

    handleStyleChange(updates);
  };

  /**
   * Handles clearing/resetting crop settings
   */
  const handleClearCrop = () => {
    const updates = {
      cropEnabled: false,
      cropX: undefined,
      cropY: undefined,
      cropWidth: undefined,
      cropHeight: undefined,
      clipPath: undefined,
    };
    handleStyleChange(updates);
  };

  /**
   * Handles enabling/disabling crop functionality
   * When toggling on, initializes default crop values if they don't exist
   * When toggling off, keeps the crop values but hides the crop handles
   */
  const handleCropToggle = (enabled: boolean) => {
    const updates: any = {
      cropEnabled: enabled,
    };

    if (enabled) {
      // When enabling crop, initialize default values if they don't exist
      if (localOverlay?.styles?.cropX === undefined) {
        updates.cropX = 0;
        updates.cropY = 0;
        updates.cropWidth = 100;
        updates.cropHeight = 100;
      }
    }
    // When disabling, we keep the crop values but hide the handles
    // This allows users to "finish" cropping without losing their adjustments
    // Use the Reset button to clear crop values

    handleStyleChange(updates);
  };

  return (
    <div className="space-y-4 rounded-md bg-card p-4 border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-xs font-extralight text-foreground">Crop</h3>
        </div>
        <Switch
          checked={isCropEnabled}
          onCheckedChange={handleCropToggle}
        />
      </div>


      {isCropEnabled && (
          <>
          <Separator/>
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-2 block font-extralight text-foreground">
                Aspect Ratios
              </label>
              <div className="grid grid-cols-4 gap-2">
                {ASPECT_RATIOS.map((aspectRatio) => (
                  <button
                    key={aspectRatio.value}
                    onClick={() => handleApplyAspectRatio(aspectRatio.ratio)}
                    className="flex flex-col items-center justify-center p-2 rounded-md border border-border bg-background hover:bg-accent hover:border-accent-foreground transition-colors group"
                    title={`Apply ${aspectRatio.label} aspect ratio`}
                  >
                    <div
                      className="bg-muted/50 hover:bg-accent-foreground/10 transition-colors mb-1.5 border group-hover:border-accent-foreground/20 border-border"
                      style={{
                        width: aspectRatio.ratio >= 1 ? '28px' : `${28 * aspectRatio.ratio}px`,
                        height: aspectRatio.ratio >= 1 ? `${28 / aspectRatio.ratio}px` : '28px',
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                      {aspectRatio.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Separator/>

            <div className="flex items-center justify-between ">
              <span className="text-xs text-muted-foreground font-extralight">
                Use handles to fine-tune
              </span>
              <button
                onClick={handleClearCrop}
                className="text-xs px-3 py-1.5 rounded-md transition-colors bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              >
                Reset
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

