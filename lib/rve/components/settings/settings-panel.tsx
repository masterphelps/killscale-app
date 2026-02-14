import React, {  } from "react";
import { useEditorContext } from "../../contexts/editor-context";
import ColorPicker from "react-best-gradient-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";
import { SaveHistory } from "./save-history";

/**
 * Settings Panel Component
 *
 * 
 * A panel that provides settings for the React Video Editor.
 * Currently includes:
 * 1. Background color setting for the video canvas
 * 2. Timeline height size controls
 * 
 * Future settings can be added here such as:
 * - Canvas size/aspect ratio
 * - Default animation settings
 * - Export quality settings
 * - Theme preferences
 */
export const SettingsPanel: React.FC = () => {
  const { 
    backgroundColor = "white", 
    setBackgroundColor,
    showAlignmentGuides,
    setShowAlignmentGuides,
  } = useEditorContext();

  return (
    <div className="p-2 space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-extralight">Player</h3>
        
        {/* Background Color Setting */}
        <div className="space-y-2">
          <label className="text-xs font-extralight">
            Background Color
          </label>
          <div className="flex items-center gap-2 mt-2">
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <div
                    className="h-8 w-8 rounded-md border border-border cursor-pointer"
                    style={{ backgroundColor }}
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-[330px] bg-card"
                  side="right"
                >
                  <ColorPicker
                    value={backgroundColor}
                    onChange={(color) => setBackgroundColor?.(color)}
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
              value={backgroundColor}
              onChange={(e) => setBackgroundColor?.(e.target.value)}
              placeholder="white"
              className="flex-1 bg-background border rounded-md text-xs p-2 hover:border transition-colors text-primary"
            />
            {backgroundColor !== "white" && (
              <Button
                onClick={() => setBackgroundColor?.("white")}
                variant="ghost"
                size="sm"
              >
                Reset
              </Button>
            )}
          </div>
        </div>
   
   <Separator />

        {/* Alignment Guides Setting */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extralight ">
              Show Alignment Guide
            </label>
            <Switch
              checked={showAlignmentGuides}
              onCheckedChange={setShowAlignmentGuides}
            />
          </div>
        </div>
        </div>

      
      <Separator />

      {/* Timeline Height Settings */}
      {/* <TimelineHeightSettings /> */}

      {/* <Separator /> */}

      {/* Save History Section */}
      <SaveHistory />
    </div>
  );
};