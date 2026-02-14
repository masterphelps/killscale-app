import React, { useState } from "react";
import { Layout3DTemplate, layout3DTemplates } from "../../../adaptors/default-3d-layout-adaptors";
import { VisualLayoutPreview } from "./visual-layout-preview";
import { VisualLayoutSection } from "./visual-layout-section";


/**
 * VisualLayoutSettingsProps interface defines the required props for the VisualLayoutSettings component
 */
interface VisualLayoutSettingsProps {
  /** Currently selected 3D layout ID */
  selectedLayout?: string;
  /** Callback function triggered when a 3D layout is selected */
  onLayoutSelect?: (layoutId: string) => void;
}

/**
 * VisualLayoutSettings component provides a unified interface for selecting 3D layout effects
 * Uses the 3D layout templates directly for consistent key mapping
 */
export const VisualLayoutSettings: React.FC<VisualLayoutSettingsProps> = ({
  selectedLayout,
  onLayoutSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSection = () => {
    setIsOpen(prev => !prev);
  };

  // Add a "None" option for no 3D effect
  const noneLayout: Layout3DTemplate = {
    key: "none",
    name: "None",
    preview: "No 3D effect",
    transform: () => ({}),
  };

  // Convert layout3DTemplates to array with keys
  const layoutArray = Object.values(layout3DTemplates);
  
  // All layouts including none option
  const allLayouts = [noneLayout, ...layoutArray.filter(layout => layout.key !== "none")];

  return (
    <div className="w-full">
      {/* 3D Layout Section */}
      <VisualLayoutSection
        title="3D Layout Effects"
        count={allLayouts.length}
        isOpen={isOpen}
        onToggle={toggleSection}
      >
        {allLayouts.map((layout, index) => (
          <VisualLayoutPreview
            key={`layout-${layout.key}-${index}`}
            layout={layout}
            isSelected={selectedLayout === layout.key}
            onClick={() => {
              console.log("Selecting 3D layout:", layout.key);
              onLayoutSelect?.(layout.key!);
            }}
          />
        ))}
      </VisualLayoutSection>
    </div>
  );
}; 