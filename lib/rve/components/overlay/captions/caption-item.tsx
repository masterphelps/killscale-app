import React, { forwardRef } from "react";
import { Card, CardContent } from "../../ui/card";
import { Caption } from "../../../types";
import { cn } from "../../../utils/general/utils";
import { CaptionTimeInput } from "./caption-time-input";
import { CaptionTextEditor } from "./caption-text-editor";

interface CaptionItemProps {
  caption: Caption;
  index: number;
  isActive: boolean;
  isUpcoming: boolean;
  isPast: boolean;
  timingError?: string;
  getInputValue: (index: number, field: 'startMs' | 'endMs') => string;
  onInputChange: (index: number, field: 'startMs' | 'endMs', value: string) => void;
  onTimingChange: (index: number, field: 'startMs' | 'endMs', value: string) => void;
  onTextChange: (index: number, text: string) => void;
}

export const CaptionItem = forwardRef<HTMLDivElement, CaptionItemProps>(
  ({
    caption,
    index,
    isActive,
    isUpcoming,
    isPast,
    timingError,
    getInputValue,
    onInputChange,
    onTimingChange,
    onTextChange,
  }, ref) => {
    return (
      <Card
        ref={ref}
        className={cn(
          "bg-background group transition-all duration-200 rounded-sm",
          isActive
            ? "bg-background text-foreground border border-caption-overlay"
            : isUpcoming || isPast
            ? "border bg-background text-caption-item-foreground opacity-70"
            : "border bg-muted text-muted-foreground hover:bg-caption-item/5 hover:border-caption-item/50"
        )}
      >
        <CardContent className="p-3 space-y-2 rounded-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CaptionTimeInput
                label="Start"
                value={getInputValue(index, 'startMs')}
                isActive={isActive}
                onChange={(value) => onInputChange(index, 'startMs', value)}
                onBlur={(value) => onTimingChange(index, 'startMs', value)}
              />
              <CaptionTimeInput
                label="End"
                value={getInputValue(index, 'endMs')}
                isActive={isActive}
                onChange={(value) => onInputChange(index, 'endMs', value)}
                onBlur={(value) => onTimingChange(index, 'endMs', value)}
              />
            </div>
            {timingError && (
              <div className="text-xs text-destructive font-extralight">
                {timingError}
              </div>
            )}
          </div>

          <CaptionTextEditor
            text={caption.text}
            isActive={isActive}
            onChange={(text) => onTextChange(index, text)}
          />
        </CardContent>
      </Card>
    );
  }
);

CaptionItem.displayName = "CaptionItem"; 