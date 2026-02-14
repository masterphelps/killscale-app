import React from "react";
import { Button } from "../ui/button";
import { Save } from "lucide-react";

interface SaveControlsProps {
  /**
   * Function to save the project
   */
  onSave?: () => Promise<void>;
  /**
   * Whether the save operation is in progress
   */
  isSaving?: boolean;
}

/**
 * SaveControls component provides a save button for the project
 */
export const SaveControls: React.FC<SaveControlsProps> = ({
  onSave,
  isSaving = false,
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative hover:bg-accent text-foreground"
      onClick={onSave}
      disabled={isSaving}
    >
      <Save className="w-3.5 h-3.5" />
    </Button>
  );
};