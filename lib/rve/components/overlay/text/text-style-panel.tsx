import React, { useState, useMemo, useEffect, useRef } from "react";
import { TextOverlay } from "../../../types";
import { ToggleGroup, ToggleGroupItem } from "../../ui/toggle-group";
import { AlignLeft, AlignCenter, AlignRight, RotateCcw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Slider } from "../../ui/slider";
import ColorPicker from "react-best-gradient-color-picker";
import { GOOGLE_FONTS_LIST } from "../../../data/google-fonts-list";
import { useFontPreviewLoader } from "../../../utils/text/load-font-preview";
import { Input } from "../../ui/input";
import { Search } from "lucide-react";
import type { FontInfo } from "@remotion/google-fonts";
import { PositionSettings } from "../../shared/position/position-settings";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";

/**
 * Font weight options
 */
const fontWeights = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra Light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

/**
 * Extract available weights from FontInfo metadata
 * @param fontInfo - Font metadata from Google Fonts API
 * @returns Array of available weight strings
 */
function extractAvailableWeights(fontInfo: FontInfo): string[] {
  const weights = new Set<string>();
  
  // Extract weights from normal style
  if (fontInfo.fonts.normal) {
    Object.keys(fontInfo.fonts.normal).forEach(weight => weights.add(weight));
  }
  
  // Extract weights from italic style (usually same weights, but include them too)
  if (fontInfo.fonts.italic) {
    Object.keys(fontInfo.fonts.italic).forEach(weight => weights.add(weight));
  }
  
  // Convert to array and sort numerically
  return Array.from(weights).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Props for FontItem component
 */
interface FontItemProps {
  fontFamily: string;
  previewUrl: string;
  isSelected: boolean;
  onClick: () => void;
  loadFontForPreview: (fontFamily: string, previewUrl?: string) => Promise<void>;
  isFontLoaded: (fontFamily: string) => boolean;
  makeFontPreviewName: (fontFamily: string) => string;
}

/**
 * Individual font item that automatically loads font when scrolled into view
 */
const FontItem: React.FC<FontItemProps> = ({
  fontFamily,
  previewUrl,
  isSelected,
  onClick,
  loadFontForPreview,
  isFontLoaded,
  makeFontPreviewName,
}) => {
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isFontLoaded(fontFamily)) {
            // Load font as soon as it comes into view, using the correct previewUrl
            loadFontForPreview(fontFamily, previewUrl).catch(() => {
              // Silently fail - error is already logged in loadFontPreview
            });
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Start loading before it comes into view
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [fontFamily, previewUrl, loadFontForPreview, isFontLoaded]);

  const fontLoaded = isFontLoaded(fontFamily);
  const fontFamilyStyle = fontLoaded
    ? { fontFamily: makeFontPreviewName(fontFamily) }
    : {};

  return (
    <button
      ref={itemRef}
      onClick={onClick}
      className={`w-full px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground ${
        isSelected ? "bg-accent text-accent-foreground" : ""
      }`}
      style={fontFamilyStyle}
    >
      {fontFamily}
    </button>
  );
};

/**
 * Props for the TextStylePanel component
 * @interface TextStylePanelProps
 * @property {TextOverlay} localOverlay - The current text overlay object containing styles and content
 * @property {Function} handleInputChange - Callback function to handle changes to overlay text content
 * @property {Function} handleStyleChange - Callback function to handle style changes for the text overlay
 */
interface TextStylePanelProps {
  localOverlay: TextOverlay;
  handleInputChange: (field: keyof TextOverlay, value: string) => void;
  handleStyleChange: (field: keyof TextOverlay["styles"], value: any) => void;
  onPositionChange?: (updates: { left?: number; top?: number; width?: number; height?: number }) => void;
}

/**
 * Panel component for managing text overlay styling options
 * Provides controls for typography settings (font family, alignment) and colors (text color, highlight)
 *
 * @component
 * @param {TextStylePanelProps} props - Component props
 * @returns {JSX.Element} A panel with text styling controls
 */
export const TextStylePanel: React.FC<TextStylePanelProps> = ({
  localOverlay,
  handleStyleChange,
  onPositionChange,
}) => {
  const [fontSearch, setFontSearch] = useState("");
  const [availableWeights, setAvailableWeights] = useState<string[]>(["400"]); // Default to regular
  const { loadFontForPreview, makeFontPreviewName, isFontLoaded } = useFontPreviewLoader();

  // Update available weights when font family changes
  useEffect(() => {
    if (!localOverlay.styles.fontFamily) {
      setAvailableWeights(["400"]); // Default weights
      return;
    }

    // Fetch available weights from the Google Fonts API
    const fetchFontWeights = async () => {
      try {
        const response = await fetch(`/api/fonts/${localOverlay.styles.fontFamily}`);
        
        if (!response.ok) {
          console.warn(`Failed to fetch font metadata for ${localOverlay.styles.fontFamily}`);
          setAvailableWeights(["400"]); // Fallback to default
          return;
        }

        const fontInfo: FontInfo = await response.json();
        const weights = extractAvailableWeights(fontInfo);
        setAvailableWeights(weights);
        
        // If current weight is not available, reset to 400 or the first available weight
        const currentWeight = localOverlay.styles.fontWeight || "400";
        if (!weights.includes(currentWeight)) {
          const defaultWeight = weights.includes("400") ? "400" : weights[0];
          handleStyleChange("fontWeight", defaultWeight);
        }
      } catch (error) {
        console.error(`Error fetching font metadata:`, error);
        setAvailableWeights(["400"]); // Fallback to default
      }
    };

    fetchFontWeights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOverlay.styles.fontFamily, handleStyleChange]);

  // Filter fonts based on search
  const filteredFonts = useMemo(() => {
    if (!fontSearch) return GOOGLE_FONTS_LIST;
    const searchTerm = fontSearch.toLowerCase();
    return GOOGLE_FONTS_LIST.filter((font) =>
      font.fontFamily.toLowerCase().includes(searchTerm)
    );
  }, [fontSearch]);

  // Parse current letter spacing into em units for the slider control
  const currentLetterSpacingEm = useMemo(() => {
    const ls = localOverlay.styles.letterSpacing;
    if (!ls) return 0;
    const numeric = parseFloat(ls);
    if (Number.isNaN(numeric)) return 0;
    if (ls.endsWith("px")) return numeric / 16; // Convert px to em (approx.)
    return numeric; // Treat bare number or em as em
  }, [localOverlay.styles.letterSpacing]);

  const showFontSizeReset = (localOverlay.styles.fontSizeScale ?? 1) !== 1;
  const showLetterSpacingReset = currentLetterSpacingEm !== 0;

  return (
    <TooltipProvider>
    <div className="space-y-2">
      {/* Positioning Controls */}
      {onPositionChange && (
        <PositionSettings
          overlayWidth={localOverlay.width}
          overlayHeight={localOverlay.height}
          onPositionChange={onPositionChange}
        />
      )}

      {/* Typography Settings */}
      <div className="space-y-4 rounded-md bg-sidebar p-2.5 border">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground/50">
              Font Family
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full px-3 py-2 text-xs text-left text-foreground bg-background border rounded-md hover:bg-accent hover:text-accent-foreground">
                  {localOverlay.styles.fontFamily || "Select a font"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" side="bottom" align="start">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Search fonts..."
                      value={fontSearch}
                      onChange={(e) => setFontSearch(e.target.value)}
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {filteredFonts.length === 0 ? (
                    <div className="p-4 text-xs text-center text-muted-foreground">
                      No fonts found
                    </div>
                  ) : (
                    filteredFonts.map((font) => (
                      <FontItem
                        key={font.importName}
                        fontFamily={font.fontFamily}
                        previewUrl={font.previewUrl}
                        isSelected={localOverlay.styles.fontFamily === font.fontFamily}
                        onClick={() => {
                          handleStyleChange("fontFamily", font.fontFamily);
                          setFontSearch("");
                        }}
                        loadFontForPreview={loadFontForPreview}
                        isFontLoaded={isFontLoaded}
                        makeFontPreviewName={makeFontPreviewName}
                      />
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-foreground text-muted-foreground/50">
              Font Weight
            </label>
            <Select
              value={localOverlay.styles.fontWeight || "400"}
              onValueChange={(value) => handleStyleChange("fontWeight", value)}
            >
              <SelectTrigger className="w-full text-xs text-foreground">
                <SelectValue className="text-foreground" placeholder="Select weight" />
              </SelectTrigger>
              <SelectContent>
                {fontWeights
                  .filter((weight) => availableWeights.includes(weight.value))
                  .map((weight) => (
                    <SelectItem
                      key={weight.value}
                      value={weight.value}
                      className="text-xs text-foreground"
                      style={{ fontWeight: weight.value }}
                    >
                      {weight.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground/50 py-1">
              Font Size
            </label>
            <div className="flex items-center gap-2">
              {showFontSizeReset && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleStyleChange("fontSizeScale", undefined)}
                      className="text-xs px-2 py-1.5 rounded-md transition-colors bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Reset font size</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <Slider
            value={[localOverlay.styles.fontSizeScale || 1]}
            onValueChange={(value) => handleStyleChange("fontSizeScale", value[0])}
            min={0.3}
            max={3}
            step={0.1}
            className="w-full"
          />
        </div>

        {/* Letter Spacing */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground/50 py-1">
              Letter Spacing
            </label>
            <div className="flex items-center gap-2">
              {showLetterSpacingReset && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleStyleChange("letterSpacing", undefined)}
                      className="text-xs px-2 py-1.5 rounded-md transition-colors bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Reset letter spacing</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <Slider
            value={[currentLetterSpacingEm]}
            onValueChange={(value) =>
              handleStyleChange("letterSpacing", `${value[0].toFixed(2)}em`)
            }
            min={-0.10}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-4">
            <label className="text-xs text-muted-foreground/50">Alignment</label>
            <ToggleGroup
              type="single"
              size="sm"
              className="justify-start gap-1 text-foreground"
              value={localOverlay.styles.textAlign || "left"}
              onValueChange={(value) => {
                if (value) handleStyleChange("textAlign", value);
              }}
            >
              <ToggleGroupItem
                value="left"
                aria-label="Align left"
                className="h-10 w-10"
              >
                <AlignLeft className="h-4 w-4 text-foreground" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="center"
                aria-label="Align center"
                className="h-10 w-10"
              >
                <AlignCenter className="h-4 w-4 text-foreground" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="right"
                aria-label="Align right"
                className="h-10 w-10"
              >
                <AlignRight className="h-4 w-4 text-foreground" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-2 rounded-md bg-sidebar p-2.5 border">
        <h5 className="text-sm font-light leading-none text-foreground">Colors</h5>

        <div className="grid grid-cols-3 gap-2">
          {!localOverlay.styles.WebkitBackgroundClip ? (
            <>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Text Color
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <div
                      className="h-8 w-8 rounded-md border cursor-pointer"
                      style={{ backgroundColor: localOverlay.styles.color }}
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[330px]"
                    side="right"
                  >
                    <ColorPicker
                      value={localOverlay.styles.color}
                      onChange={(color) => handleStyleChange("color", color)}
                      // hideInputs
                      hideHue
                      hideControls
                      hideColorTypeBtns
                      hideAdvancedSliders
                      hideColorGuide
                      hideInputType
                      height={200}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Highlight
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <div
                      className="h-8 w-8 rounded-md border cursor-pointer"
                      style={{
                        backgroundColor: localOverlay.styles.backgroundColor,
                      }}
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[330px]"
                    side="right"
                  >
                    <ColorPicker
                      value={localOverlay.styles.backgroundColor}
                      onChange={(color) => {
                        handleStyleChange("backgroundColor", color);
                      }}
                      hideInputs
                      hideHue
                      hideControls
                      hideColorTypeBtns
                      hideAdvancedSliders
                      hideColorGuide
                      hideInputType
                      height={200}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          ) : (
            <div className="col-span-3">
              <p className="text-xs text-muted-foreground">
                Color settings are not available for gradient text styles
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
};
