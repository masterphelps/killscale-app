import React from "react";
import { CaptionOverlay } from "../../../types";
import { CaptionItem } from "./caption-item";

interface CaptionTimelineContainerProps {
  localOverlay: CaptionOverlay;
  currentMs: number;
  containerRef: React.RefObject<HTMLDivElement>;
  activeCaptionRef: React.RefObject<HTMLDivElement>;
  timingErrors: {[key: number]: string};
  getInputValue: (index: number, field: 'startMs' | 'endMs') => string;
  onInputChange: (index: number, field: 'startMs' | 'endMs', value: string) => void;
  onTimingChange: (index: number, field: 'startMs' | 'endMs', value: string) => void;
  onTextChange: (index: number, text: string) => void;
}

export const CaptionTimelineContainer: React.FC<CaptionTimelineContainerProps> = ({
  localOverlay,
  currentMs,
  containerRef,
  activeCaptionRef,
  timingErrors,
  getInputValue,
  onInputChange,
  onTimingChange,
  onTextChange,
}) => {
  return (
    <div
      className="bg-background space-y-2 max-h-screen overflow-y-auto scrollbar-none scrollbar-hidden rounded-sm" 
      ref={containerRef}
    >
      {localOverlay?.captions?.map((caption, index) => {
        // Convert absolute currentMs to relative time for comparison with stored caption timings
        const overlayStartMs = (localOverlay.from / 30) * 1000;
        const relativeCurrentMs = Math.max(0, currentMs - overlayStartMs);
        
        const isActive = relativeCurrentMs >= caption.startMs && relativeCurrentMs < caption.endMs;
        const isUpcoming = relativeCurrentMs < caption.startMs;
        const isPast = relativeCurrentMs >= caption.endMs;

        return (
          <CaptionItem
            key={index}
            ref={isActive ? activeCaptionRef : undefined}
            caption={caption}
            index={index}
            isActive={isActive}
            isUpcoming={isUpcoming}
            isPast={isPast}
            timingError={timingErrors[index]}
            getInputValue={getInputValue}
            onInputChange={onInputChange}
            onTimingChange={onTimingChange}
            onTextChange={onTextChange}
          />
        );
      })}
    </div>
  );
}; 