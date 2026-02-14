import React from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible";

/**
 * Interface for the VisualLayoutSection component
 */
interface VisualLayoutSectionProps {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * VisualLayoutSection displays a collapsible section of 3D layout options
 */
export const VisualLayoutSection: React.FC<VisualLayoutSectionProps> = ({
  title,
  count,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className="w-full mb-4 px-0 mx-0"
    >
      <div className="border border-border rounded-sm overflow-hidden">
        <CollapsibleTrigger className="w-full flex justify-between items-center px-4 py-3 bg-card hover:bg-accent/50 duration-200 ease-out">
          <div className="flex items-center">
            <span className="font-extralight text-foreground text-xs">
              {title}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              ({count})
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`duration-200 ease-out ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 bg-sidebar border-t border-border">
            <div className="grid grid-cols-4 sm:grid-cols-3 gap-2 place-items-center">{children}</div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}; 