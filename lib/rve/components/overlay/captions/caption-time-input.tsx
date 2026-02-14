import React from "react";
import { Input } from "../../ui/input";
import { cn } from "../../../utils/general/utils";

interface CaptionTimeInputProps {
  label: string;
  value: string;
  isActive: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  placeholder?: string;
}

export const CaptionTimeInput: React.FC<CaptionTimeInputProps> = ({
  label,
  value,
  isActive,
  onChange,
  onBlur,
  placeholder = "00:00.0",
}) => {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground font-extralight">{label}:</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
        className={cn(
          "h-6 w-16 px-1 text-xs font-extralight text-center transition-colors",
          isActive 
            ? "text-primary border-caption-overlay/50 bg-background" 
            : "text-foreground border-muted bg-background hover:border-border focus:border-primary focus:text-foreground"
        )}
        placeholder={placeholder}
      />
    </div>
  );
}; 