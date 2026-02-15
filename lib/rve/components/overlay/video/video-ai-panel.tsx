import React, { useState } from "react";
import { ClipOverlay, CaptionOverlay, OverlayType, GreenscreenConfig } from "../../../types";
import { Button } from "../../ui/button";
import { Wand2, Loader2, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";

/**
 * Props for the VideoAIPanel component
 * @interface VideoAIPanelProps
 * @property {ClipOverlay} localOverlay - The current overlay object containing video settings
 * @property {function} [onAIGenerate] - Callback to generate captions via Whisper+Claude endpoint
 */
interface VideoAIPanelProps {
  localOverlay: ClipOverlay;
  onAIGenerate?: (prompt: string) => Promise<void>;
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
  onAIGenerate,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isServiceReady = !!onAIGenerate;

  const reset = () => {
    setIsProcessing(false);
    setIsCompleted(false);
    setIsError(false);
    setError(null);
  };

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
    if (!onAIGenerate) return;

    setIsProcessing(true);
    setIsCompleted(false);
    setIsError(false);
    setError(null);

    try {
      await onAIGenerate("Generate captions from the video audio");
      setIsCompleted(true);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err.message : "Failed to generate captions");
    } finally {
      setIsProcessing(false);
    }
  };

  const getButtonContent = () => {
    if (isProcessing) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Generating...
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
