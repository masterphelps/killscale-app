import React, { useMemo, useCallback } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { OverlayType, TextOverlay } from "../../../types";
import { textOverlayTemplates } from "../../../templates/text-overlay-templates";
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from "../../advanced-timeline/hooks/use-new-item-drag";

/**
 * Interface for the SelectTextOverlay component props
 */
interface SelectTextOverlayProps {
  // No props needed - component manages its own overlay creation
}

/**
 * SelectTextOverlay Component
 *
 * This component renders a grid of text overlay templates that users can select from.
 * When a template is selected, it creates a new text overlay with predefined styles
 * and positions it at the next available spot in the timeline.
 *
 * Features:
 * - Displays a grid of text overlay templates with preview and information
 * - Automatically positions new overlays in the timeline
 * - Applies template styles while maintaining consistent base properties
 * - Supports dark/light mode with appropriate styling
 *
 * @component
 */
export const SelectTextOverlay: React.FC<SelectTextOverlayProps> = () => {
  const { overlays, currentFrame, setOverlays, setSelectedOverlayId } = useEditorContext();
  const { addAtPlayhead } = useTimelinePositioning();

  /**
   * Creates and adds a new text overlay to the editor
   * @param option - The selected template option from textOverlayTemplates
   */
  const handleAddOverlay = useCallback((option: (typeof textOverlayTemplates)[0]) => {
    const { from, row, updatedOverlays } = addAtPlayhead(
      currentFrame,
      overlays
    );

    const newOverlay: Omit<TextOverlay, "id"> = {
      left: 100,
      top: 100,
      width: 500,
      height: 180,
      durationInFrames: 90,
      from,
      row,
      rotation: 0,
      isDragging: false,
      type: OverlayType.TEXT,
      content: option.content ?? "Testing",
      styles: {
        ...option.styles,
        // Remove hardcoded fontSize to let dynamic calculation work
        opacity: 1,
        zIndex: 1,
        transform: "none",
        textAlign: option.styles.textAlign as "left" | "center" | "right",
        fontSizeScale: 1, // Default scale factor
      },
    };

    // Update overlays with both the shifted overlays and the new overlay in a single operation
    const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;
    const overlayWithId = { ...newOverlay, id: newId } as TextOverlay;
    const finalOverlays = [...updatedOverlays, overlayWithId];
    
    setOverlays(finalOverlays);
    setSelectedOverlayId(newId);
  }, [currentFrame, overlays, addAtPlayhead, setOverlays, setSelectedOverlayId]);

  /**
   * Handle drag start for timeline integration
   */
  const handleDragStart = useCallback((option: (typeof textOverlayTemplates)[0]) => (e: React.DragEvent) => {
    // Set drag data for timeline
    const dragData = {
      isNewItem: true,
      type: 'text',
      label: option.name,
      duration: 3, // Default 3 seconds (90 frames / 30 fps)
      data: option, // Pass template data
    };
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    
    // Set global drag state for timeline
    setCurrentNewItemDragType(dragData.type);
    setCurrentNewItemDragData(dragData);
    
    // Create a custom drag preview with text
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.padding = '8px 12px';
    dragPreview.style.backgroundColor = 'rgba(0,0,0,0.8)';
    dragPreview.style.color = 'white';
    dragPreview.style.borderRadius = '4px';
    dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    dragPreview.style.fontSize = '14px';
    dragPreview.style.whiteSpace = 'nowrap';
    dragPreview.textContent = option.name;
    
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 40, 20);
    
    // Clean up the preview element after drag starts
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  }, []);
  
  /**
   * Handle drag end - clear drag state
   */
  const handleDragEnd = useCallback(() => {
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
  }, []);

  return useMemo(
    () => (
      <div className="grid grid-cols-1 gap-3 p-2">
        {Object.entries(textOverlayTemplates).map(([key, option]) => (
          <div
            key={key}
            onClick={() => handleAddOverlay(option)}
            draggable={true}
            onDragStart={handleDragStart(option)}
            onDragEnd={handleDragEnd}
            className="group relative overflow-hidden border-2  bg-card rounded-md transition-all duration-200 hover:border-secondary hover:bg-accent/30 cursor-pointer"
          >
            {/* Preview Container */}
            <div className="aspect-16/6 w-full flex items-center justify-center p-2 pb-12">
              <div
                className="text-base transform-gpu transition-transform duration-200 group-hover:scale-102 text-foreground"
                style={{
                  ...option.styles,
                  fontSize: "1.25rem",
                  padding: option.styles.padding || undefined,
                  fontFamily: undefined,
                  color: undefined,
                }}
              >
                {option.content}
              </div>
            </div>

            {/* Label */}
            <div className="absolute bottom-0 left-0 right-0 backdrop-blur-[2px] px-3 py-1.5">
              <div className="font-extralight text-foreground text-[11px]">
                {option.name}
              </div>
              <div className="text-muted-foreground text-[9px] leading-tight">
                {option.preview}
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
    [handleAddOverlay, handleDragStart, handleDragEnd]
  );
};
