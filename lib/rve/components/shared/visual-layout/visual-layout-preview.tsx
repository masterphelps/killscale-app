import React from "react";
import { Layout3DTemplate } from "../../../adaptors/default-3d-layout-adaptors";

interface VisualLayoutPreviewProps {
  layout: Layout3DTemplate;
  isSelected: boolean;
  onClick: () => void;
}

export const VisualLayoutPreview: React.FC<VisualLayoutPreviewProps> = ({
  layout,
  isSelected,
  onClick,
}) => {
  // Get the transform styles for preview
  const previewTransform = layout.transform();
  
  // Scale down transform for preview while maintaining visual character
  const getScaledTransform = (originalTransform?: string) => {
    if (!originalTransform || originalTransform === "none") return "none";
    
    // Scale down translateZ values by 50% and overall scale by 80% for preview
    return originalTransform
      .replace(/translateZ\((-?\d+(?:\.\d+)?)px\)/g, (_, value) => 
        `translateZ(${parseFloat(value) * 0.5}px)`
      )
      .replace(/^/, 'scale(0.9) ');
  };
  
  return (
    <button
      onClick={onClick}
      className={`
        relative p-4 rounded-md border-2 transition-all duration-200 hover:scale-105
        shadow-md hover:shadow-lg
        ${isSelected
          ? "border-primary bg-primary/10 shadow-primary/20"
          : "border-border bg-card hover:border-muted-foreground/50 shadow-card/50"
        }
      `}
    >
      {/* Dotted Background Pattern */}
      <div 
        className="absolute inset-0 rounded-md opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '6px 6px',
          backgroundPosition: '0 0, 3px 3px'
        }}
      />
      
      {/* Preview Container */}
      <div className="relative flex flex-col items-center justify-center space-y-2 min-h-[50px]">
        {/* 3D Preview Stage - Increased size and added overflow clipping */}
        <div className="w-12 h-10 relative flex items-center justify-center overflow-hidden">
          {/* Perspective container to ensure proper 3D rendering */}
          <div 
            className="relative w-full h-full flex items-center justify-center"
            style={{
              perspective: "600px",
              transformStyle: "preserve-3d"
            }}
          >
            {/* Main 3D Element */}
            <div
              className="w-10 h-8 bg-linear-to-br from-sky-200 to-sky-700 rounded border border-slate-400/30 shadow-sm"
              style={{
                transform: getScaledTransform(previewTransform.transform),
                transformStyle: previewTransform.transformStyle as any || "flat",
                transformOrigin: "center center",
                backfaceVisibility: "hidden",
              }}
            />
            
            {/* Subtle depth indicator for complex transforms */}
            {previewTransform.transform && previewTransform.transform !== "none" && (
              <div
                className="absolute w-10 h-6 bg-linear-to-br from-slate-400/40 to-slate-600/40 rounded border border-slate-500/20 shadow-sm"
                style={{
                  transform: `${getScaledTransform(previewTransform.transform)} translateZ(-1px)`,
                  transformStyle: "preserve-3d",
                  transformOrigin: "center center",
                  opacity: 0.4,
                }}
              />
            )}
          </div>
        </div>
        
        {/* Layout Name - Added top border for visual separation */}
        <div className="text-center w-full pt-1 border-t border-border/30">
          <div className="text-[9px] text-muted-foreground font-extralight leading-tight px-1">
            {layout.name}
          </div>
        </div>
      </div>
    </button>
  );
}; 