import React, { memo, useRef, useEffect } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { TimelineItemLabel } from './timeline-item-label';

interface WaveformData {
  peaks: number[];
  length: number;
}

interface AudioItemContentProps {
  label?: string;
  data?: {
    waveformData?: WaveformData; // Updated to use WaveformData interface
    isLoadingWaveform?: boolean; // Add loading state
    volume?: number;
    isMuted?: boolean;
    sampleRate?: number;
    bitrate?: string;
    channels?: number;
    styles?: {
      fadeIn?: number; // Fade in duration in seconds
      fadeOut?: number; // Fade out duration in seconds
      volume?: number;
    };
  };
  itemWidth: number;
  itemHeight: number;
  start: number;
  end: number;
  isHovering?: boolean; // Add hover state prop
}

// High-performance Canvas-based waveform renderer
const AudioWaveform = memo(({ 
  waveformData, 
  itemWidth,
  itemHeight
}: { 
  waveformData: WaveformData;
  itemWidth: number;
  itemHeight: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData?.peaks?.length || itemWidth < 10) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = itemWidth * dpr;
    canvas.height = itemHeight * dpr;
    
    ctx.scale(dpr, dpr);
    canvas.style.width = `${itemWidth}px`;
    canvas.style.height = `${itemHeight}px`;

    // Clear canvas
    ctx.clearRect(0, 0, itemWidth, itemHeight);

    // Calculate bar dimensions
    const peaks = waveformData.peaks;
    const barCount = Math.min(peaks.length, Math.floor(itemWidth / 2)); // 2px per bar minimum
    const barWidth = itemWidth / barCount;
    const centerY = itemHeight / 2;

    // Draw waveform bars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    
    for (let i = 0; i < barCount; i++) {
      const peakIndex = Math.floor((i / barCount) * peaks.length);
      const amplitude = peaks[peakIndex] || 0;
      const barHeight = Math.max(2, amplitude * itemHeight * 0.8);
      
      const x = i * barWidth + barWidth * 0.2;
      const y = centerY - barHeight / 2;
      const width = barWidth * 0.6;
      
      ctx.fillRect(x, y, width, barHeight);
    }
  }, [waveformData, itemWidth, itemHeight]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
});

AudioWaveform.displayName = "AudioWaveform";

export const AudioItemContent: React.FC<AudioItemContentProps> = ({
  label,
  data,
  itemWidth,
  itemHeight,
  isHovering = false
}) => {
  const iconClassName = `w-3 h-3 ${data?.isMuted ? 'text-red-400' : 'text-white/80'}`;
  
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Waveform Background */}
      {data?.waveformData && !data?.isLoadingWaveform ? (
        <div className="absolute inset-0">
          <AudioWaveform 
            waveformData={data.waveformData} 
            itemWidth={itemWidth}
            itemHeight={itemHeight}
          />
        </div>
      ) : data?.isLoadingWaveform ? (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20">
          <div className="flex items-center gap-2 px-2 py-1 bg-black/30 rounded backdrop-blur-sm">
            <Loader2 className="w-3 h-3 animate-spin text-white/80" />
            <span className="text-xs text-white/80">Loading...</span>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-500/30">
          <span className="text-xs text-white/60">No waveform</span>
        </div>
      )}
      
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-start z-10 px-2">
        <TimelineItemLabel 
          icon={Volume2}
          label={label}
          defaultLabel="AUDIO"
          iconClassName={iconClassName}
          isHovering={isHovering}
          showBackground={true}
        />
      </div>
    </div>
  );
}; 