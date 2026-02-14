/**
 * CropControls Component
 * 
 * A generic toggle control for enabling/disabling cropping for any overlay type.
 * When enabled, applies a default crop area to the media.
 */
import React from "react";
import { Switch } from "../../ui/switch";
import { Crop } from "lucide-react";

interface CropControlsProps {
  cropEnabled?: boolean;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  clipPath?: string;
  onStyleChange: (updates: {
    cropEnabled?: boolean;
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    clipPath?: string;
  }) => void;
}



/**
 * CropControls Component
 * 
 * A generic toggle control for enabling/disabling cropping.
 * When enabled, applies a default crop area to the media.
 */
export const CropControls: React.FC<CropControlsProps> = ({
  cropEnabled = false,
  cropX,
  onStyleChange,
}) => {
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
    onStyleChange(updates);
  };

  /**
   * Handles enabling/disabling crop functionality
   */
  const handleCropToggle = (enabled: boolean) => {
    const updates: any = {
      cropEnabled: enabled,
    };

    if (enabled) {
      // When enabling crop, initialize default values if they don't exist
      // This ensures the crop handles appear at the edges when first enabled
      if (cropX === undefined) {
        updates.cropX = 0;
        updates.cropY = 0;
        updates.cropWidth = 100;
        updates.cropHeight = 100;
      }
    } else {
      // When disabling crop, keep both the crop values AND the clipPath
      // This preserves the cropping effect and settings for when they re-enable crop
      // The cropEnabled flag only controls whether the crop overlay UI is shown
    }

    onStyleChange(updates);
  };

  return (
    <div className="space-y-4 rounded-md bg-card p-4 border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-extralight text-foreground">
            Crop
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {(cropX !== undefined && cropX !== 0) && (
            <button
              onClick={handleClearCrop}
              className="text-xs px-2.5 py-1.5 rounded-md transition-colors bg-muted/50 text-muted-foreground hover:bg-muted"
            >
              Reset
            </button>
          )}
          <Switch
            checked={cropEnabled}
            onCheckedChange={handleCropToggle}
          />
        </div>
      </div>
    </div>
  );
}; 