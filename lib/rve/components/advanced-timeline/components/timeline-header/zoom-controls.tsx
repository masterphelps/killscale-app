import React, { useCallback } from "react";

import { ZoomOut, ZoomIn, Maximize, AlignHorizontalSpaceAround } from "lucide-react";
import { Button } from '../../../ui/button';

import { ZOOM_CONSTRAINTS } from "../../constants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../ui/tooltip";
import { Separator } from "../../../ui/separator";
import { Slider } from "../../../ui/slider";

interface ZoomControlsProps {
  zoomScale: number;
  setZoomScale: (scale: number, isDragging?: boolean) => void;
  resetZoom?: () => void;
  startSliderDrag?: () => void;
  endSliderDrag?: () => void;
  zoomConstraints?: typeof ZOOM_CONSTRAINTS; // Optional, defaults to constants
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomScale,
  setZoomScale,
  resetZoom,
  startSliderDrag,
  endSliderDrag,
  zoomConstraints = ZOOM_CONSTRAINTS, // Use default if not provided
}) => {
  const [isLocalDragging, setIsLocalDragging] = React.useState(false);
  const isDraggingRef = React.useRef(false); // Use ref for immediate tracking

  const handleSliderDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsLocalDragging(true);
    startSliderDrag?.();
  }, [startSliderDrag]);
  
  const handleSliderDragEnd = useCallback(() => {
    // Use a small delay to ensure onValueChange has completed
    setTimeout(() => {
      isDraggingRef.current = false;
      setIsLocalDragging(false);
      endSliderDrag?.();
    }, 0);
  }, [endSliderDrag]);
  
  const handleSliderChange = useCallback(
    (value: number[]) => {
      const newScale = value[0] / 100;
      const isLargeJump = Math.abs(newScale - zoomScale) > 0.1;
      
      // For large jumps (clicking on track), treat as dragging
      // This ensures playhead-centered zoom even for track clicks
      const isDragging = isDraggingRef.current || isLargeJump;
      
      // If it's a large jump (track click), initialize dragging state
      if (isLargeJump && !isDraggingRef.current) {
        isDraggingRef.current = true;
        startSliderDrag?.();
      }
      
      // Pass the isDragging flag to setZoomScale
      setZoomScale(newScale, isDragging);
    },
    [setZoomScale, zoomScale, isLocalDragging, startSliderDrag]
  );

  const handleZoomOut = () => {
    const newScale = Math.max(
      zoomConstraints.min,
      zoomScale - zoomConstraints.step
    );
    setZoomScale(newScale);
  };

  const handleZoomIn = () => {
    const newScale = Math.min(
      zoomConstraints.max,
      zoomScale + zoomConstraints.step
    );
    setZoomScale(newScale);
  };

  const handleZoomReset = () => {
    if (resetZoom) {
      resetZoom();
    } else {
      // Fallback to old behavior if resetZoom is not provided
      setZoomScale(zoomConstraints.default);
    }
  };

  return (
    <div className="flex items-center gap-1 w-full sm:w-48 z-50">
    
      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleZoomOut}
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-6 sm:w-6 text-gray-500 dark:text-zinc-400 hover:bg-gray-100/80 dark:hover:bg-gray-800/80"
              disabled={zoomScale <= zoomConstraints.min}
              onTouchStart={(e) => e.preventDefault()}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ZoomOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={5}
            align="center"
          >
            <span className="text-gray-700 dark:text-zinc-200">Zoom Out</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
   
      
      {/* Slider - hidden on mobile, shown on sm+ screens */}
      <Slider
        value={[zoomScale * 100]}
        onValueChange={handleSliderChange}
        onPointerDown={handleSliderDragStart}
        onPointerUp={handleSliderDragEnd}
        min={zoomConstraints.min * 100}
        max={zoomConstraints.max * 100}
        step={zoomConstraints.step * 100}
        className="hidden sm:flex flex-1 mx-2 hover:cursor-pointer"
        aria-label="Timeline Zoom"
      />

    

      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleZoomIn}
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-6 sm:w-6 text-gray-500 dark:text-zinc-400 hover:bg-gray-100/80 dark:hover:bg-gray-800/80"
              disabled={zoomScale >= zoomConstraints.max}
              onTouchStart={(e) => e.preventDefault()}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ZoomIn className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={5}
            align="center"
          >
            <span className="text-gray-700 dark:text-zinc-200">Zoom In</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Separator - only shown on larger screens when slider is visible */}
      <Separator orientation="vertical" className="hidden sm:block h-4 mx-2" />

      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleZoomReset}
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-6 sm:w-6 text-gray-500 dark:text-zinc-400 hover:bg-gray-100/80 dark:hover:bg-gray-800/80"
              disabled={zoomScale === zoomConstraints.default}
              onTouchStart={(e) => e.preventDefault()}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <AlignHorizontalSpaceAround className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={5}
            className="bg-white dark:bg-gray-900 text-xs px-2 py-1 rounded-md z-[9999] border border-gray-200 dark:border-gray-700"
            align="center"
          >
            <span className="text-gray-700 dark:text-zinc-200">Reset Zoom</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
