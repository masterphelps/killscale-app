import React from "react";
import { useEditorContext } from "../../contexts/editor-context";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { TIMELINE_CONSTANTS } from "../advanced-timeline/constants";

// Define size presets
const HEIGHT_PRESETS = {
  small: {
    trackHeight: 36,
    itemHeight: 28,
  },
  medium: {
    trackHeight: TIMELINE_CONSTANTS.TRACK_HEIGHT, // 48
    itemHeight: TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT, // 40
  },
  large: {
    trackHeight: 64,
    itemHeight: 52,
  },
} as const;

type HeightSize = keyof typeof HEIGHT_PRESETS;

export const TimelineHeightSettings: React.FC = () => {
  const {
    trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT,
    setTrackHeight,
    timelineItemHeight = TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT,
    setTimelineItemHeight,
  } = useEditorContext();

  // Determine current size based on values
  const getCurrentSize = (): HeightSize => {
    for (const [size, preset] of Object.entries(HEIGHT_PRESETS)) {
      if (preset.trackHeight === trackHeight && preset.itemHeight === timelineItemHeight) {
        return size as HeightSize;
      }
    }
    return 'medium'; // Default fallback
  };

  const currentSize = getCurrentSize();

  const handleSizeChange = (size: HeightSize) => {
    const preset = HEIGHT_PRESETS[size];
    setTrackHeight?.(preset.trackHeight);
    setTimelineItemHeight?.(preset.itemHeight);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-extralight">Timeline</h3>
      
      {/* Size Selection */}
      <div className="space-y-2">
        <Label className="text-xs">Size</Label>
        <div className="flex gap-1">
          {(Object.keys(HEIGHT_PRESETS) as HeightSize[]).map((size) => (
            <Button
              key={size}
              onClick={() => handleSizeChange(size)}
              variant={currentSize === size ? "default" : "outline"}
              size="sm"
              className="text-xs capitalize flex-1"
            >
              {size}
            </Button>
          ))}
        </div>
      </div>

    </div>
  );
}; 