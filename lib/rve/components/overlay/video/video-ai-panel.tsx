import React, { useState } from "react";
import { ClipOverlay, CaptionOverlay, OverlayType, GreenscreenConfig } from "../../../types";
import { Button } from "../../ui/button";
import { Wand2, Loader2, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
import { useAICaptions } from "../../../hooks/use-ai-captions";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";

/**
 * Props for the VideoAIPanel component
 * @interface VideoAIPanelProps
 * @property {ClipOverlay} localOverlay - The current overlay object containing video settings
 */
interface VideoAIPanelProps {
  localOverlay: ClipOverlay;
}

/**
 * VideoAIPanel Component
 *
 * A panel that provides AI-powered actions for video overlays. Currently includes:
 * - Generate captions from video (placeholder)
 *
 * Future AI features could include:
 * - Auto-generate thumbnails
 * - Scene detection
 * - Content analysis
 * - Smart cropping
 *
 * @component
 * @param {VideoAIPanelProps} props - Component props
 * @returns {JSX.Element} The rendered AI panel
 */
export const VideoAIPanel: React.FC<VideoAIPanelProps> = ({
  localOverlay,
}) => {
  const {
    progress,
    error,
    isProcessing,
    isCompleted,
    isError,
    isServiceReady,
    generateCaptions,
    reset
  } = useAICaptions();

  const {
    overlays,
    currentFrame,
    setOverlays,
    setSelectedOverlayId,
    changeOverlay
  } = useEditorContext();

  const { addAtPlayhead } = useTimelinePositioning();

  // Initialize greenscreen state from overlay
  const [greenscreenEnabled, setGreenscreenEnabled] = useState(localOverlay.greenscreen?.enabled ?? false);
  const [greenscreenSensitivity, setGreenscreenSensitivity] = useState(localOverlay.greenscreen?.sensitivity ?? 100);
  const [redThreshold, setRedThreshold] = useState(localOverlay.greenscreen?.threshold?.red ?? 100);
  const [greenMin, setGreenMin] = useState(localOverlay.greenscreen?.threshold?.green ?? 100);
  const [blueThreshold, setBlueThreshold] = useState(localOverlay.greenscreen?.threshold?.blue ?? 100);
  const [smoothing, setSmoothing] = useState(localOverlay.greenscreen?.smoothing ?? 0);
  const [spill, setSpill] = useState(localOverlay.greenscreen?.spill ?? 0);

  // Update overlay greenscreen settings
  const updateGreenscreen = (updates: Partial<GreenscreenConfig>) => {
    const newGreenscreen: GreenscreenConfig = {
      enabled: greenscreenEnabled,
      sensitivity: greenscreenSensitivity,
      threshold: {
        red: redThreshold,
        green: greenMin,
        blue: blueThreshold,
      },
      smoothing,
      spill,
      ...updates,
    };

    changeOverlay(localOverlay.id, (overlay) => ({
      ...overlay,
      greenscreen: newGreenscreen,
    } as ClipOverlay));
  };

  const handleGreenscreenToggle = (checked: boolean) => {
    setGreenscreenEnabled(checked);
    updateGreenscreen({ enabled: checked });
  };

  const handleSensitivityChange = (value: number[]) => {
    setGreenscreenSensitivity(value[0]);
    updateGreenscreen({ sensitivity: value[0] });
  };

  const handleRedThresholdChange = (value: number[]) => {
    setRedThreshold(value[0]);
    updateGreenscreen({
      threshold: { red: value[0], green: greenMin, blue: blueThreshold },
    });
  };

  const handleGreenMinChange = (value: number[]) => {
    setGreenMin(value[0]);
    updateGreenscreen({
      threshold: { red: redThreshold, green: value[0], blue: blueThreshold },
    });
  };

  const handleBlueThresholdChange = (value: number[]) => {
    setBlueThreshold(value[0]);
    updateGreenscreen({
      threshold: { red: redThreshold, green: greenMin, blue: value[0] },
    });
  };

  const handleSmoothingChange = (value: number[]) => {
    setSmoothing(value[0]);
    updateGreenscreen({ smoothing: value[0] });
  };

  const handleSpillChange = (value: number[]) => {
    setSpill(value[0]);
    updateGreenscreen({ spill: value[0] });
  };

  const handleGenerateCaptions = async () => {
    if (!localOverlay.src) {
      console.error("No video source available");
      return;
    }

    try {
      const captions = await generateCaptions({
        videoSrc: localOverlay.src,
        language: 'en',
        outputFormat: 'json'
      });

      if (captions && captions.length > 0) {
        // Calculate total duration in frames based on the last caption
        const lastCaption = captions[captions.length - 1];
        const totalDurationMs = lastCaption.endMs + 500; // Add small buffer
        const calculatedDurationInFrames = Math.ceil((totalDurationMs / 1000) * 30); // Assuming 30 FPS

        // Add at playhead position
        const { from, row, updatedOverlays } = addAtPlayhead(
          currentFrame,
          overlays,
          'top'
        );

        // Generate ID
        const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;

        // Create new caption overlay
        const newCaptionOverlay: CaptionOverlay = {
          id: newId,
          type: OverlayType.CAPTION,
          from,
          durationInFrames: calculatedDurationInFrames,
          captions: captions,
          left: 230,
          top: 414,
          width: 833,
          height: 269,
          rotation: 0,
          isDragging: false,
          row,
        };

        // Update overlays with both the shifted overlays and the new overlay in a single operation
        const finalOverlays = [...updatedOverlays, newCaptionOverlay];
        setOverlays(finalOverlays);
        setSelectedOverlayId(newId);
      }
    } catch (error) {
      console.error("Failed to generate captions:", error);
    }
  };

  const getButtonContent = () => {
    if (isProcessing) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Generating... {progress !== undefined && `${Math.round(progress)}%`}
        </>
      );
    }
    
    if (isCompleted) {
      return (
        <>
          <CheckCircle className="w-4 h-4 mr-2" />
          Captions Generated!
        </>
      );
    }
    
    if (isError) {
      return (
        <>
          <AlertCircle className="w-4 h-4 mr-2" />
          Try Again
        </>
      );
    }
    
    return (
      <>
        <Wand2 className="w-4 h-4 mr-2" />
        Generate Captions
      </>
    );
  };

  const getButtonVariant = () => {
    if (isCompleted) return "default";
    if (isError) return "destructive";
    return "default";
  };

  return (
    <div className="space-y-4">
      {/* Greenscreen Removal Section */}
      <div className="rounded-lg border bg-card transition-all duration-200 hover:bg-accent/50 hover:border-primary/30">
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-extralight text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Green Screen Removal
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed font-extralight">
                  Remove green screen background from your video
                </p>
              </div>
              <Switch
                checked={greenscreenEnabled}
                onCheckedChange={handleGreenscreenToggle}
              />
            </div>

            {greenscreenEnabled && (
              <div className="space-y-3 pt-2 border-t">
                {/* Sensitivity Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extralight">
                      Sensitivity
                    </label>
                    <span className="text-xs min-w-[40px] text-right">
                      {greenscreenSensitivity}
                    </span>
                  </div>
                  <Slider
                    value={[greenscreenSensitivity]}
                    onValueChange={handleSensitivityChange}
                    min={0}
                    max={255}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground font-extralight">
                    Higher values remove more green
                  </p>
                </div>

                {/* Advanced Controls Collapsible */}
                <details className="space-y-2">
                  <summary className="text-xs font-extralight cursor-pointer hover:text-foreground">
                    Advanced Settings
                  </summary>
                  
                  <div className="space-y-3 pt-2">
                    {/* Red Threshold */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extralight">
                          Red Threshold
                        </label>
                        <span className="text-xs min-w-[40px] text-right">
                          {redThreshold}
                        </span>
                      </div>
                      <Slider
                        value={[redThreshold]}
                        onValueChange={handleRedThresholdChange}
                        min={0}
                        max={255}
                        step={5}
                        className="w-full"
                      />
                    </div>

                    {/* Green Minimum */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extralight">
                          Green Minimum
                        </label>
                        <span className="text-xs min-w-[40px] text-right">
                          {greenMin}
                        </span>
                      </div>
                      <Slider
                        value={[greenMin]}
                        onValueChange={handleGreenMinChange}
                        min={0}
                        max={255}
                        step={5}
                        className="w-full"
                      />
                    </div>

                    {/* Blue Threshold */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extralight">
                          Blue Threshold
                        </label>
                        <span className="text-xs min-w-[40px] text-right">
                          {blueThreshold}
                        </span>
                      </div>
                      <Slider
                        value={[blueThreshold]}
                        onValueChange={handleBlueThresholdChange}
                        min={0}
                        max={255}
                        step={5}
                        className="w-full"
                      />
                    </div>

                    {/* Smoothing */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extralight">
                          Edge Smoothing
                        </label>
                        <span className="text-xs min-w-[40px] text-right">
                          {smoothing}
                        </span>
                      </div>
                      <Slider
                        value={[smoothing]}
                        onValueChange={handleSmoothingChange}
                        min={0}
                        max={10}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    {/* Spill Removal */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extralight">
                          Spill Removal
                        </label>
                        <span className="text-xs min-w-[40px] text-right">
                          {spill.toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        value={[spill * 100]}
                        onValueChange={(value) => handleSpillChange([value[0] / 100])}
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground font-extralight">
                        Remove green tint from edges
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auto Captions Section */}
      <div className="space-y-3">
        <div className="rounded-lg border bg-card transition-all duration-200 hover:bg-accent/50 hover:border-primary/30">
          <div className="p-4">
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-extralight text-foreground mb-1">
                  Auto Captions
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed font-extralight">
                  Generate captions from the video&apos;s audio track using AI
                </p>
                {!isServiceReady && (
                  <p className="text-xs text-amber-600 mt-1 font-extralight">
                    AI service not configured. Using demo mode.
                  </p>
                )}
              </div>
              
              {error && (
                <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive font-extralight">{error}</p>
                </div>
              )}
              
              {isProcessing && progress !== undefined && (
                <div className="space-y-1">
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-extralight">Processing audio...</p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  onClick={handleGenerateCaptions}
                  variant={getButtonVariant()}
                  size="sm"
                  className="flex-1 justify-center"
                  disabled={isProcessing}
                >
                  {getButtonContent()}
                </Button>
                
                {(isCompleted || isError) && (
                  <Button
                    onClick={reset}
                    variant="outline"
                    size="sm"
                    className="px-3"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 
