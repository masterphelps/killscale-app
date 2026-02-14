import React from "react";
import { Droplet } from "lucide-react";
import { TimelineItemLabel } from "./timeline-item-label";
import { BaseItemContentProps } from "../timeline-item-content-factory";

interface BlurItemContentProps extends BaseItemContentProps {
  data?:
    | {
        blurLevel?: number; // Blur intensity in pixels
        backgroundColor?: string; // Background color for the blur overlay
        borderRadius?: string;
        styles?: {
          blurLevel?: number;
          backgroundColor?: string;
          borderRadius?: string;
        };
      }
    | any; // Allow any to handle full overlay object
}

export const BlurItemContent: React.FC<BlurItemContentProps> = ({
  label,
  data,
  isHovering = false,
}) => {
  // Extract blur level from overlay data structure
  // data contains the full overlay object, so we need to access styles.blurLevel
  const blurLevel = data?.styles?.blurLevel ?? data?.blurLevel ?? 10;
  const displayLabel = label || `BLUR (${blurLevel}px)`;

  return (
    <TimelineItemLabel
      icon={Droplet}
      label={displayLabel}
      defaultLabel="BLUR"
      isHovering={isHovering}
      iconClassName="w-3 h-3 text-white/80"
    />
  );
};
