import React, { useState } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { OverlayType, TextOverlay } from "../../../types";

import { TextDetails } from "./text-details";
import { SelectTextOverlay } from "./select-text-overlay";

export const TextOverlaysPanel: React.FC = () => {
  const { selectedOverlayId, overlays } = useEditorContext();
  const [localOverlay, setLocalOverlay] = useState<TextOverlay | null>(null);

  // Sync local overlay only when selection changes — NOT on every overlay edit.
  // Including `overlays` in deps causes a feedback loop: editing a property updates
  // global overlays → re-runs this effect → overwrites local state with stale data.
  React.useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.TEXT) {
      setLocalOverlay(selectedOverlay as TextOverlay);
    } else {
      // Reset localOverlay if selected overlay is not a text overlay
      setLocalOverlay(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOverlayId]);

  const handleSetLocalOverlay = (overlay: TextOverlay) => {
    setLocalOverlay(overlay);
  };

  const isValidTextOverlay = localOverlay && selectedOverlayId !== null;

  return (
    <>
      {!isValidTextOverlay ? (
        <SelectTextOverlay />
      ) : (
        <TextDetails
          localOverlay={localOverlay}
          setLocalOverlay={handleSetLocalOverlay}
        />
      )}
    </>
  );
};
