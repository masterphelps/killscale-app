import React from "react";
import { CaptionOverlay, CaptionStyles, Caption } from "../../../types";
import { captionTemplates } from "../../../templates/caption-templates";

import { AlignLeft, PaintBucket } from "lucide-react";

import { CaptionStylePanel } from "./caption-style-panel";
import { CaptionTimeline } from "./caption-timeline";
import { UnifiedTabs } from "../shared/unified-tabs";

/**
 * Props for the CaptionSettings component
 * @interface CaptionSettingsProps
 * @property {CaptionOverlay} localOverlay - Current caption overlay being edited
 * @property {Function} setLocalOverlay - Function to update the caption overlay
 * @property {number} currentFrame - Current frame position in the video
 * @property {number} startFrame - Starting frame of the caption overlay
 * @property {Caption[]} captions - Array of caption objects
 */
interface CaptionSettingsProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
  currentFrame: number;
  startFrame: number;
  captions: Caption[];
}

/**
 * Default styling configuration for captions
 * Uses the classic template from caption-templates.ts
 */
export const defaultCaptionStyles: CaptionStyles = captionTemplates.classic.styles;

/**
 * CaptionSettings Component
 *
 * @component
 * @description
 * Provides a tabbed interface for managing caption settings including:
 * - Caption text and timing management
 * - Visual style customization
 * - Voice settings (planned feature)
 *
 * The component uses a tab-based layout to organize different aspects of caption
 * configuration, making it easier for users to focus on specific settings.
 *
 * @example
 * ```tsx
 * <CaptionSettings
 *   localOverlay={captionOverlay}
 *   setLocalOverlay={handleOverlayUpdate}
 *   currentFrame={30}
 *   startFrame={0}
 *   captions={[...]}
 * />
 * ```
 */
export const CaptionSettings: React.FC<CaptionSettingsProps> = ({
  localOverlay,
  setLocalOverlay,
  currentFrame,
}) => {
  const currentMs = (currentFrame / 30) * 1000;

  return (
    <UnifiedTabs
      defaultValue="captions"
      tabs={[
        {
          value: "captions",
          label: "Edit",
          icon: <AlignLeft className="w-3 h-3" />,
          content: (
            <div className="overflow-y-auto [&_[data-radix-scroll-area-viewport]]:!scrollbar-none" style={{
              height: 'calc(100vh - 120px)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              <CaptionTimeline
                localOverlay={localOverlay}
                setLocalOverlay={setLocalOverlay}
                currentMs={currentMs}
              />
            </div>
          ),
        },
        {
          value: "display",
          label: "Style",
          icon: <PaintBucket className="w-3 h-3" />,
          content: (
            <div className="overflow-y-auto [&_[data-radix-scroll-area-viewport]]:!scrollbar-none" style={{
              height: 'calc(100vh - 120px)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              <CaptionStylePanel
                localOverlay={localOverlay}
                setLocalOverlay={setLocalOverlay}
              />
            </div>
          ),
        },
      ]}
    />
  );
};
