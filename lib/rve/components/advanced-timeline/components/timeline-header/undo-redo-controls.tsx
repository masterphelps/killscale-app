import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { Button } from '../../../ui/button';

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  return (
    <div className="flex items-center gap-1 border-r border-border pr-3 mr-2">
      <Button
        onClick={onUndo}
        disabled={!canUndo}
        variant="link"
        size="icon"
        className="h-8 w-8"
        title="Undo (Ctrl/Cmd + Z)"
        aria-label="Undo last action"
        onTouchStart={(e) => e.preventDefault()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Undo2 className="w-4 h-4 text-text-secondary" />
      </Button>
      
      <Button
        onClick={onRedo}
        disabled={!canRedo}
        variant="link"
        size="icon"
        className="h-8 w-8 text-text-secondary"
        title="Redo (Ctrl/Cmd + Shift + Z)"
        aria-label="Redo last action"
        onTouchStart={(e) => e.preventDefault()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Redo2 className="w-4 h-4" />
      </Button>
    </div>
  );
}; 