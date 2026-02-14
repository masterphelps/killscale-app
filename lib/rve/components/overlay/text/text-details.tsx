import React from "react";
import { Settings, PaintBucket, LayoutTemplate } from "lucide-react";
import { useEditorContext } from "../../../contexts/editor-context";
import { TextOverlay } from "../../../types";
import { TextSettingsPanel } from "./text-settings-panel";
import { TextStylePanel } from "./text-style-panel";
import { TextTemplatesPanel } from "./text-templates-panel";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Textarea } from "../../ui/textarea";
import { Separator } from "../../ui/separator";

/**
 * Props for the TextDetails component
 * @interface TextDetailsProps
 * @property {TextOverlay} localOverlay - The local state of the text overlay being edited
 * @property {function} setLocalOverlay - Function to update the local overlay state
 */
interface TextDetailsProps {
  localOverlay: TextOverlay;
  setLocalOverlay: (overlay: TextOverlay) => void;
}

/**
 * TextDetails component provides a UI for editing text overlay properties and styles.
 * It includes a live preview, text editor, and tabbed panels for settings and styling.
 * Changes are debounced to prevent excessive re-renders.
 *
 * @component
 * @param {TextDetailsProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export const TextDetails: React.FC<TextDetailsProps> = ({
  localOverlay,
  setLocalOverlay,
}) => {
  const { changeOverlay } = useEditorContext();

  /**
   * Handles changes to direct overlay properties
   * @param {keyof TextOverlay} field - The field to update
   * @param {string} value - The new value
   */
  const handleInputChange = (field: keyof TextOverlay, value: string) => {
    const updatedOverlay = { ...localOverlay, [field]: value } as TextOverlay;
    // Update local state immediately for responsive UI
    setLocalOverlay(updatedOverlay);

    // Update global state immediately (no debounce to prevent losing changes)
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  /**
   * Handles changes to nested style properties
   * @param {keyof TextOverlay["styles"]} field - The style field to update
   * @param {string} value - The new value
   */
  const handleStyleChange = (
    field: keyof TextOverlay["styles"],
    value: any
  ) => {
    // Update local state immediately for responsive UI
    const updatedLocalOverlay = {
      ...localOverlay,
      styles: { ...localOverlay.styles, [field]: value },
    };
    setLocalOverlay(updatedLocalOverlay);

    // Update global state immediately (no debounce to prevent losing changes)
    changeOverlay(updatedLocalOverlay.id, () => updatedLocalOverlay);
  };

  /**
   * Handles position and size changes for the text overlay
   */
  const handlePositionChange = (updates: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }) => {
    const updatedOverlay = {
      ...localOverlay,
      ...updates,
    };
    // Update local state immediately for responsive UI
    setLocalOverlay(updatedOverlay);

    // Update global state immediately
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  return (
    <div className="space-y-4">
      {/* Preview and Edit Section */}
      <div className="flex flex-col px-2 mt-2">
        {/* Editor */}
        <Textarea
          value={localOverlay.content || ""}
          onChange={(e) => handleInputChange("content", e.target.value)}
          placeholder="Enter your text here..."
          className="w-full min-h-[60px] resize-none text-base bg-input border-gray-300 text-foreground"
          spellCheck="false"
        />
      </div>
      <Separator />
      {/* Settings Tabs */}
      <div className="flex flex-col gap-4 px-2">
        <UnifiedTabs
          tabs={[
            {
              value: "settings",
              label: "Settings",
              icon: <Settings className="w-3 h-3" />,
              content: (
                <TextSettingsPanel
                  localOverlay={localOverlay}
                  handleStyleChange={handleStyleChange}
                />
              ),
            },
            {
              value: "style",
              label: "Style",
              icon: <PaintBucket className="w-3 h-3" />,
              content: (
                <TextStylePanel
                  localOverlay={localOverlay}
                  handleInputChange={handleInputChange}
                  handleStyleChange={handleStyleChange}
                  onPositionChange={handlePositionChange}
                />
              ),
            },
            {
              value: "templates",
              label: "Templates",
              icon: <LayoutTemplate className="w-3 h-3" />,
              content: (
                <TextTemplatesPanel
                  localOverlay={localOverlay}
                  setLocalOverlay={setLocalOverlay}
                  changeOverlay={changeOverlay}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};
