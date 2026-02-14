import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { TemplateOverlay } from "../../../types";

interface ApplyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTemplate: TemplateOverlay | null;
  onApplyTemplate: (template: TemplateOverlay) => void;
}

export const ApplyTemplateDialog: React.FC<ApplyTemplateDialogProps> = ({
  open,
  onOpenChange,
  selectedTemplate,
  onApplyTemplate,
}) => {
  const handleApply = () => {
    if (selectedTemplate) {
      onApplyTemplate(selectedTemplate);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[90%] max-w-md mx-auto rounded-lg p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-extralight text-foreground">
            Apply Template
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground font-extralight">
            Are you sure you want to add this template to your timeline? It
            will replace all existing overlays.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3">
          <AlertDialogCancel className="h-8 text-xs font-extralight text-muted-foreground">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className="h-8 text-xs font-extralight" onClick={handleApply}>
            Apply Template
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}; 