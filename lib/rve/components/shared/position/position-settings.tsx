import React, { useState } from "react";
import { Button } from "../../ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible";
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  SquareDot,
} from "lucide-react";
import { useEditorContext } from "../../../contexts/editor-context";

/**
 * Position preset type for quick positioning
 */
type PositionPreset =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "fullscreen";

/**
 * Props for the PositionSettings component
 */
interface PositionSettingsProps {
  /** Current overlay width */
  overlayWidth: number;
  /** Current overlay height */
  overlayHeight: number;
  /** Callback to update the overlay's position and size */
  onPositionChange: (updates: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }) => void;
}

/**
 * PositionSettings Component
 *
 * A collapsible panel that provides quick positioning controls for overlays.
 * Offers preset positions (corners, edges, center) and fullscreen option.
 *
 * Features:
 * - Collapsible interface to save space
 * - 3x3 grid layout for intuitive positioning
 * - One-click positioning presets
 * - Fullscreen/fill canvas option
 * - Automatically uses current aspect ratio from EditorContext
 *
 * @component
 */
export const PositionSettings: React.FC<PositionSettingsProps> = ({
  overlayWidth,
  overlayHeight,
  onPositionChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { getAspectRatioDimensions } = useEditorContext();

  /**
   * Handles positioning preset selection
   * Calculates new position and size based on canvas dimensions and selected preset
   */
  const handlePositionPreset = (preset: PositionPreset) => {
    const canvasDimensions = getAspectRatioDimensions();

    let updates: {
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    } = {};

    switch (preset) {
      case "fullscreen":
        // Scale to fill entire canvas
        updates = {
          left: 0,
          top: 0,
          width: canvasDimensions.width,
          height: canvasDimensions.height,
        };
        break;

      case "center":
        // Center in canvas
        updates = {
          left: (canvasDimensions.width - overlayWidth) / 2,
          top: (canvasDimensions.height - overlayHeight) / 2,
        };
        break;

      case "top-left":
        updates = {
          left: 0,
          top: 0,
        };
        break;

      case "top-center":
        updates = {
          left: (canvasDimensions.width - overlayWidth) / 2,
          top: 0,
        };
        break;

      case "top-right":
        updates = {
          left: canvasDimensions.width - overlayWidth,
          top: 0,
        };
        break;

      case "center-left":
        updates = {
          left: 0,
          top: (canvasDimensions.height - overlayHeight) / 2,
        };
        break;

      case "center-right":
        updates = {
          left: canvasDimensions.width - overlayWidth,
          top: (canvasDimensions.height - overlayHeight) / 2,
        };
        break;

      case "bottom-left":
        updates = {
          left: 0,
          top: canvasDimensions.height - overlayHeight,
        };
        break;

      case "bottom-center":
        updates = {
          left: (canvasDimensions.width - overlayWidth) / 2,
          top: canvasDimensions.height - overlayHeight,
        };
        break;

      case "bottom-right":
        updates = {
          left: canvasDimensions.width - overlayWidth,
          top: canvasDimensions.height - overlayHeight,
        };
        break;
    }

    onPositionChange(updates);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="border rounded-md overflow-hidden bg-card">
        <CollapsibleTrigger className="w-full flex justify-between items-center px-4 py-3 bg-card hover:bg-accent/50 duration-200 ease-out">
          <div className="flex items-center gap-2">
            <span className="font-extralight text-xs text-foreground  ">Position</span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`duration-200 ease-out text-foreground ${isOpen ? "rotate-180" : ""}`}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 bg-card border-t">
            {/* 3x3 grid for position presets */}
            <div className="grid grid-cols-3 gap-1 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("top-left")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Top Left"
              >
                <AlignHorizontalJustifyStart className="h-3 w-3 rotate-90 text-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("top-center")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Top Center"
              >
                <AlignVerticalJustifyStart className="h-3 w-3 text-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("top-right")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Top Right"
              >
                <AlignHorizontalJustifyEnd className="h-3 w-3 rotate-90 text-foreground" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("center-left")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Center Left"
              >
                <AlignHorizontalJustifyStart className="h-3 w-3 text-foreground " />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("center")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Center"
              >
                <SquareDot className="h-3 w-3 text-foreground " />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("center-right")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Center Right"
              >
                <AlignHorizontalJustifyEnd className="h-3 w-3 text-foreground" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("bottom-left")}
                className="h-7 w-full p-0 flex items-center justify-center "
                title="Bottom Left"
              >
                <AlignHorizontalJustifyStart className="h-3 w-3 rotate-90 transform scale-y-[-1] text-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("bottom-center")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Bottom Center"
              >
                <AlignVerticalJustifyEnd className="h-3 w-3 text-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePositionPreset("bottom-right")}
                className="h-7 w-full p-0 flex items-center justify-center"
                title="Bottom Right"
              >
                <AlignHorizontalJustifyEnd className="h-3 w-3 rotate-90 transform scale-y-[-1] text-foreground  " />
              </Button>
            </div>
            
            {/* Fullscreen button - separate row */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePositionPreset("fullscreen")}
              className="h-7 w-full flex items-center justify-center gap-1.5"
              title="Fill Canvas"
            >
              <span className="text-xs text-foreground">Fill Canvas</span>
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

