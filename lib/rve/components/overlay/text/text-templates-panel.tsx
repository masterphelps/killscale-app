import React from "react";
import { textOverlayTemplates } from "../../../templates/text-overlay-templates";
import { TextOverlay } from "../../../types";

interface TextTemplatesPanelProps {
  localOverlay: TextOverlay;
  setLocalOverlay: (overlay: TextOverlay) => void;
  changeOverlay: (id: number, updater: () => TextOverlay) => void;
}

/**
 * TextTemplatesPanel displays the 9 text style templates in a compact grid.
 * Clicking a template applies its styles to the currently selected text overlay,
 * preserving the existing content, position, duration, and animations.
 */
export const TextTemplatesPanel: React.FC<TextTemplatesPanelProps> = ({
  localOverlay,
  setLocalOverlay,
  changeOverlay,
}) => {
  const applyTemplate = (template: (typeof textOverlayTemplates)[string]) => {
    const updatedOverlay: TextOverlay = {
      ...localOverlay,
      styles: {
        ...template.styles,
        opacity: 1,
        zIndex: 1,
        transform: "none",
        textAlign: template.styles.textAlign as "left" | "center" | "right",
        fontSizeScale: localOverlay.styles.fontSizeScale ?? 1,
      },
    };
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      {Object.entries(textOverlayTemplates).map(([key, option]) => (
        <div
          key={key}
          onClick={() => applyTemplate(option)}
          className="group relative overflow-hidden border-2 bg-card rounded-md transition-all duration-200 hover:border-secondary hover:bg-accent/30 cursor-pointer"
        >
          {/* Preview Container */}
          <div className="aspect-16/6 w-full flex items-center justify-center p-2 pb-10">
            <div
              className="text-base transform-gpu transition-transform duration-200 group-hover:scale-102 text-foreground"
              style={{
                ...option.styles,
                fontSize: "1rem",
                padding: option.styles.padding || undefined,
                fontFamily: undefined,
                color: undefined,
              }}
            >
              {option.content}
            </div>
          </div>

          {/* Label */}
          <div className="absolute bottom-0 left-0 right-0 backdrop-blur-[2px] px-2 py-1">
            <div className="font-extralight text-foreground text-[10px]">
              {option.name}
            </div>
            <div className="text-muted-foreground text-[8px] leading-tight">
              {option.preview}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
