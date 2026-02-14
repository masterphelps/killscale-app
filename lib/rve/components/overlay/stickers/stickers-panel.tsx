import React, { useState, useEffect } from "react";

import { useEditorContext } from "../../../contexts/editor-context";
import { Overlay, OverlayType, StickerCategory, StickerOverlay } from "../../../types";
import {
  templatesByCategory,
  getStickerCategories,
} from "../../../templates/sticker-templates/sticker-helpers";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { UnifiedTabs } from "../shared/unified-tabs";
import { StickerPreview } from "./sticker-preview";
import { StickerDetails } from "./sticker-details";

export function StickersPanel() {
  const { 
    overlays, 
    currentFrame, 
    setOverlays, 
    setSelectedOverlayId,
    selectedOverlayId,
    changeOverlay,
  } = useEditorContext();
  const { addAtPlayhead } = useTimelinePositioning();
  const stickerCategories = getStickerCategories();
  const [localOverlay, setLocalOverlay] = useState<StickerOverlay | null>(null);

  // Track selected overlay for edit mode
  useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.STICKER) {
      setLocalOverlay(selectedOverlay as StickerOverlay);
    }
  }, [selectedOverlayId, overlays]);

  /**
   * Updates an existing sticker overlay's properties
   * @param updatedOverlay - The modified overlay object
   * Updates both local state and global editor context
   */
  const handleUpdateOverlay = (updatedOverlay: StickerOverlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  const handleStickerClick = (templateId: string) => {
    const template = Object.values(templatesByCategory)
      .flat()
      .find((t) => t.config.id === templateId);

    if (!template) return;

    const { from, row, updatedOverlays } = addAtPlayhead(
      currentFrame,
      overlays,
      'top'
    );

    // Create the new overlay without an ID (we'll generate it)
    const newOverlay = {
      type: OverlayType.STICKER,
      content: template.config.id,
      category: template.config.category as StickerCategory,
      durationInFrames: 50,
      from,
      height: 150,
      width: 150,
      left: 0,
      top: 0,
      row,
      isDragging: false,
      rotation: 0,
      styles: {
        opacity: 1,
        zIndex: 1,
        ...template.config.defaultProps?.styles,
      },
    };

    // Update overlays with both the shifted overlays and the new overlay in a single operation
    const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;
    const overlayWithId = { ...newOverlay, id: newId } as Overlay;
    const finalOverlays = [...updatedOverlays, overlayWithId];
    
    setOverlays(finalOverlays);
    setSelectedOverlayId(newId);
  };

  const renderStickerContent = (category: string) => (
    <div className="grid grid-cols-2 gap-3 pt-3 pb-3">
      {templatesByCategory[category]?.map((template) => (
        <div
          key={template.config.id}
          className={`
            h-[140px]
            ${template.config.layout === "double" ? "col-span-2" : ""}
          `}
        >
          <StickerPreview
            template={template}
            onClick={() => handleStickerClick(template.config.id)}
          />
        </div>
      ))}
    </div>
  );

  // If we're in edit mode, show the details panel
  if (localOverlay) {
    return (
      <div className="flex flex-col gap-4 p-2 h-full">
        <StickerDetails
          localOverlay={localOverlay}
          setLocalOverlay={handleUpdateOverlay}
        />
      </div>
    );
  }

  // Otherwise show the sticker selection panel
  return (
    <div className="flex flex-col p-2 h-full overflow-hidden">
      <UnifiedTabs
        defaultValue={stickerCategories[0]}
        tabs={stickerCategories.map((category) => ({
          value: category,
          label: category,
          content: (
            <div className="overflow-y-auto scrollbar-hide h-[calc(100vh-100px)]">
              {renderStickerContent(category)}
            </div>
          ),
        }))}
      />
    </div>
  );
}
