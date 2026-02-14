import React from "react";
import { CaptionOverlay } from "../../../types";
import { captionTemplates } from "../../../templates/caption-templates";
import { Type } from "lucide-react";

/**
 * Props for the CaptionStylePanel component
 * @interface CaptionStylePanelProps
 * @property {CaptionOverlay} localOverlay - Current caption overlay being styled
 * @property {Function} setLocalOverlay - Function to update the caption overlay
 */
interface CaptionStylePanelProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
}

/**
 * CaptionStylePanel Component
 *
 * @component
 * @description
 * Provides a visual interface for selecting and customizing caption styles.
 * Features include:
 * - Pre-defined style templates
 * - Live preview of styles
 * - Color palette visualization
 * - Active state indication
 *
 * Each template includes:
 * - Preview text with highlight example
 * - Template name and status
 * - Color scheme visualization
 *
 * @example
 * ```tsx
 * <CaptionStylePanel
 *   localOverlay={captionOverlay}
 *   setLocalOverlay={handleStyleUpdate}
 * />
 * ```
 */
export const CaptionStylePanel: React.FC<CaptionStylePanelProps> = ({
  localOverlay,
  setLocalOverlay,
}) => {
  const currentFontSize = parseInt(localOverlay?.styles?.fontSize || "24") || 24;

  const handleFontSizeChange = (newSize: number) => {
    setLocalOverlay({
      ...localOverlay,
      styles: {
        ...localOverlay.styles,
        fontSize: `${newSize}px`,
      } as CaptionOverlay["styles"],
    });
  };

  return (
    <div className="space-y-4">
      {/* Font Size Control */}
      <div className="rounded-lg bg-muted/50 border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Font Size</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{currentFontSize}px</span>
        </div>
        <input
          type="range"
          min={16}
          max={72}
          step={2}
          value={currentFontSize}
          onChange={(e) => handleFontSizeChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">16</span>
          <span className="text-[10px] text-muted-foreground">72</span>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(captionTemplates).map(([templateId, template]) => (
          <button
            key={templateId}
            onClick={() => {
              const preservedFontSize = localOverlay.styles?.fontSize || template.styles.fontSize;
              setLocalOverlay({
                ...localOverlay,
                template: templateId,
                styles: {
                  ...template.styles,
                  fontSize: preservedFontSize,
                } as CaptionOverlay["styles"],
              });
            }}
            className={
              `group relative overflow-hidden rounded-lg transition-all duration-200
              ${
                localOverlay?.template === templateId
                  ? " bg-primary/10 border-2 border-primary"
                  : "border-border hover:border-accent bg-muted/50 hover:bg-muted/80"
              }`
            }
          >
            {/* Preview Area — dark background simulating video */}
            <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-black/90">
              <div className="absolute inset-0 flex items-end justify-center pb-4 px-3">
                <span
                  style={{
                    ...template.styles,
                    fontSize: "0.85rem",
                    lineHeight: "1.3",
                    display: "inline-flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "3px",
                  }}
                >
                  {"Every great story".split(" ").map((word, wi) => (
                    <span
                      key={wi}
                      style={wi === 2 ? {
                        ...template.styles.highlightStyle,
                        display: "inline-block",
                        transform: `scale(${template.styles.highlightStyle?.scale || 1})`,
                      } : { display: "inline-block" }}
                    >
                      {word}
                    </span>
                  ))}
                  {" "}
                  {"starts with one word.".split(" ").map((word, wi) => (
                    <span key={`b-${wi}`} style={{ display: "inline-block" }}>
                      {word}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* Template Info and Color Palette */}
            <div className="flex items-center justify-between p-3 bg-card/50 backdrop-blur-sm">
              {/* Template Name and Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-extralight text-primary-foreground">
                  {template.name}
                </span>
                {localOverlay?.template === templateId && (
                  <span className="text-[10px] text-primary font-extralight bg-primary/10 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>

              {/* Color Palette Preview */}
              <div className="flex items-center gap-1.5">
                {[
                  template.styles.color,
                  template.styles.highlightStyle?.backgroundColor,
                ].map((color, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full border-[0.1px] border-popover-foreground/30"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
