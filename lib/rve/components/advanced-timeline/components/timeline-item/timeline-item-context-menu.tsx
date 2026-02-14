
import React from 'react';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../../../ui/context-menu';
import { Copy, Scissors, Trash2 } from 'lucide-react';


interface TimelineItemContextMenuProps {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSplit?: () => void; // Add split handler
  onDuplicateItems?: (itemIds: string[]) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onSplitItems?: (itemId: string, splitTime: number) => void; // Add split items handler
  isSelected?: boolean;
  selectedItemIds?: string[];
  duplicateText: string;
  deleteText: string;
  showSplit?: boolean; // Whether to show the split option (only for single items)
}

export const TimelineItemContextMenu: React.FC<TimelineItemContextMenuProps> = ({
  onDuplicate,
  onDelete,
  onSplit,
  onDuplicateItems,
  onDeleteItems,
  onSplitItems,
  duplicateText,
  deleteText,
  showSplit = false,
}) => {
  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem 
        onClick={onDuplicate} 
        disabled={!onDuplicateItems}
      >
        <Copy className="mr-2 h-4 w-4" />
        <span>{duplicateText}</span>
      </ContextMenuItem>
      
      {showSplit && onSplit && onSplitItems && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onSplit}>
            <Scissors className="mr-2 h-4 w-4" />
            <span>Split at playhead</span>
          </ContextMenuItem>
        </>
      )}
      
      <ContextMenuSeparator />
      <ContextMenuItem 
        onClick={onDelete} 
        disabled={!onDeleteItems}
        className="text-red-600 focus:text-red-600"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        <span>{deleteText}</span>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}; 