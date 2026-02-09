import React from 'react'
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  OffthreadVideo,
  Img,
} from 'remotion'
import type { AdOverlayProps, HookOverlay, CaptionOverlay, CTAOverlay, GraphicOverlay, OverlayStyle } from './types'

// ─── Style Presets ───────────────────────────────────────────────────────────

const STYLE_PRESETS: Record<OverlayStyle, {
  fontFamily: string
  hookBg: string
  hookTextColor: string
  captionBg: string
  captionTextColor: string
  captionHighlight: string
  ctaBg: string
  ctaTextColor: string
  shadowIntensity: number
}> = {
  capcut: {
    fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif',
    hookBg: 'rgba(0,0,0,0.7)',
    hookTextColor: '#ffffff',
    captionBg: 'rgba(0,0,0,0.75)',
    captionTextColor: '#ffffff',
    captionHighlight: '#FFD700',
    ctaBg: '#10B981',
    ctaTextColor: '#ffffff',
    shadowIntensity: 0.6,
  },
  minimal: {
    fontFamily: '"Inter", -apple-system, sans-serif',
    hookBg: 'transparent',
    hookTextColor: '#ffffff',
    captionBg: 'transparent',
    captionTextColor: '#ffffff',
    captionHighlight: '#60A5FA',
    ctaBg: '#ffffff',
    ctaTextColor: '#000000',
    shadowIntensity: 0.8,
  },
  bold: {
    fontFamily: '"Impact", "Arial Black", sans-serif',
    hookBg: 'rgba(0,0,0,0.8)',
    hookTextColor: '#ffffff',
    captionBg: 'rgba(0,0,0,0.85)',
    captionTextColor: '#ffffff',
    captionHighlight: '#F59E0B',
    ctaBg: '#EF4444',
    ctaTextColor: '#ffffff',
    shadowIntensity: 0.5,
  },
  clean: {
    fontFamily: '"Inter", "Helvetica Neue", sans-serif',
    hookBg: 'rgba(255,255,255,0.15)',
    hookTextColor: '#ffffff',
    captionBg: 'rgba(255,255,255,0.1)',
    captionTextColor: '#ffffff',
    captionHighlight: '#34D399',
    ctaBg: '#6366F1',
    ctaTextColor: '#ffffff',
    shadowIntensity: 0.4,
  },
}

// ─── Animation Helpers ───────────────────────────────────────────────────────

function useEntryAnimation(animation: 'pop' | 'fade' | 'slide') {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (animation === 'pop') {
    const s = spring({ frame, fps, config: { stiffness: 200, damping: 12, mass: 0.8 } })
    return {
      opacity: interpolate(s, [0, 1], [0, 1]),
      transform: `scale(${interpolate(s, [0, 1], [0.3, 1])})`,
    }
  }

  if (animation === 'slide') {
    const s = spring({ frame, fps, config: { stiffness: 120, damping: 14 } })
    return {
      opacity: interpolate(s, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
      transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)`,
    }
  }

  // fade
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
  return { opacity, transform: 'none' }
}

// ─── Hook Text Component ─────────────────────────────────────────────────────

const HookText: React.FC<{ config: HookOverlay; style: OverlayStyle; brandColor?: string }> = ({
  config,
  style: styleName,
  brandColor,
}) => {
  const preset = STYLE_PRESETS[styleName]
  const anim = useEntryAnimation(config.animation)

  return (
    <div
      style={{
        position: 'absolute',
        top: '12%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 40px',
        ...anim,
      }}
    >
      <div
        style={{
          background: preset.hookBg,
          borderRadius: 16,
          padding: '24px 36px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: preset.fontFamily,
            fontSize: 52,
            fontWeight: 800,
            color: preset.hookTextColor,
            lineHeight: 1.2,
            textShadow: `0 2px 8px rgba(0,0,0,${preset.shadowIntensity})`,
          }}
        >
          {config.line1}
        </div>
        {config.line2 && (
          <div
            style={{
              fontFamily: preset.fontFamily,
              fontSize: 48,
              fontWeight: 700,
              color: config.line2Color || brandColor || '#10B981',
              lineHeight: 1.3,
              marginTop: 8,
              textShadow: `0 2px 8px rgba(0,0,0,${preset.shadowIntensity})`,
            }}
          >
            {config.line2}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Caption Component ───────────────────────────────────────────────────────

const Caption: React.FC<{ config: CaptionOverlay; style: OverlayStyle; brandColor?: string }> = ({
  config,
  style: styleName,
  brandColor,
}) => {
  const preset = STYLE_PRESETS[styleName]
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })

  // Highlight a specific word in the text
  const renderText = () => {
    if (!config.highlightWord) {
      return <span>{config.text}</span>
    }

    const parts = config.text.split(new RegExp(`(${config.highlightWord})`, 'gi'))
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === config.highlightWord!.toLowerCase() ? (
            <span key={i} style={{ color: brandColor || preset.captionHighlight }}>{part}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '18%',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 32px',
        opacity,
      }}
    >
      <div
        style={{
          background: config.highlight
            ? 'rgba(0,0,0,0.85)'
            : preset.captionBg,
          borderRadius: 12,
          padding: '16px 28px',
          maxWidth: '90%',
        }}
      >
        <div
          style={{
            fontFamily: preset.fontFamily,
            fontSize: 36,
            fontWeight: 600,
            color: preset.captionTextColor,
            textAlign: 'center',
            lineHeight: 1.4,
            textShadow: `0 1px 4px rgba(0,0,0,${preset.shadowIntensity})`,
          }}
        >
          {renderText()}
        </div>
      </div>
    </div>
  )
}

// ─── CTA Component ───────────────────────────────────────────────────────────

const CTASection: React.FC<{ config: CTAOverlay; style: OverlayStyle; brandColor?: string }> = ({
  config,
  style: styleName,
  brandColor,
}) => {
  const preset = STYLE_PRESETS[styleName]
  const anim = useEntryAnimation(config.animation)

  const buttonBg = config.buttonColor || brandColor || preset.ctaBg

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        ...anim,
      }}
    >
      {config.brandName && (
        <div
          style={{
            fontFamily: preset.fontFamily,
            fontSize: 28,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.8)',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}
        >
          {config.brandName}
        </div>
      )}
      <div
        style={{
          background: buttonBg,
          borderRadius: 50,
          padding: '18px 48px',
          boxShadow: `0 4px 20px ${buttonBg}66`,
        }}
      >
        <div
          style={{
            fontFamily: preset.fontFamily,
            fontSize: 32,
            fontWeight: 800,
            color: preset.ctaTextColor,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          {config.buttonText}
        </div>
      </div>
    </div>
  )
}

// ─── Graphic Overlay Component ───────────────────────────────────────────────

const GraphicItem: React.FC<{ config: GraphicOverlay; style: OverlayStyle }> = ({ config }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 10], [0, config.opacity ?? 0.8], { extrapolateRight: 'clamp' })

  const positionStyle: React.CSSProperties = (() => {
    switch (config.position) {
      case 'top_left': return { top: 24, left: 24 }
      case 'top_right': return { top: 24, right: 24 }
      case 'bottom_left': return { bottom: 24, left: 24 }
      case 'bottom_right': return { bottom: 24, right: 24 }
      case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
      default: return { top: 24, left: 24 }
    }
  })()

  if (config.type === 'logo' || config.type === 'badge' || config.type === 'watermark') {
    return (
      <div style={{ position: 'absolute', ...positionStyle, opacity }}>
        {config.imageUrl ? (
          <Img src={config.imageUrl} style={{ width: config.type === 'watermark' ? 60 : 80, height: 'auto' }} />
        ) : config.text ? (
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            {config.text}
          </div>
        ) : null}
      </div>
    )
  }

  // lower_third
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: 0,
        right: 0,
        opacity,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 8,
          padding: '12px 24px',
          fontSize: 24,
          fontWeight: 500,
          color: '#ffffff',
        }}
      >
        {config.text}
      </div>
    </div>
  )
}

// ─── Main Composition ────────────────────────────────────────────────────────

export const AdOverlay: React.FC<AdOverlayProps> = ({ videoUrl, durationInSeconds, overlayConfig }) => {
  const { fps } = useVideoConfig()
  const totalFrames = Math.round(durationInSeconds * fps)
  const styleName = overlayConfig.style || 'capcut'
  const brandColor = overlayConfig.brandColor

  const secToFrame = (sec: number) => Math.round(sec * fps)

  return (
    <AbsoluteFill>
      {/* Background video — full duration */}
      <AbsoluteFill>
        <OffthreadVideo
          src={videoUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Hook text */}
      {overlayConfig.hook && (
        <Sequence
          from={secToFrame(overlayConfig.hook.startSec)}
          durationInFrames={secToFrame(overlayConfig.hook.endSec - overlayConfig.hook.startSec)}
        >
          <HookText config={overlayConfig.hook} style={styleName} brandColor={brandColor} />
        </Sequence>
      )}

      {/* Timed captions */}
      {overlayConfig.captions?.map((caption, i) => (
        <Sequence
          key={`caption-${i}`}
          from={secToFrame(caption.startSec)}
          durationInFrames={secToFrame(caption.endSec - caption.startSec)}
        >
          <Caption config={caption} style={styleName} brandColor={brandColor} />
        </Sequence>
      ))}

      {/* CTA section */}
      {overlayConfig.cta && (
        <Sequence
          from={secToFrame(overlayConfig.cta.startSec)}
          durationInFrames={totalFrames - secToFrame(overlayConfig.cta.startSec)}
        >
          <CTASection config={overlayConfig.cta} style={styleName} brandColor={brandColor} />
        </Sequence>
      )}

      {/* Graphics overlays */}
      {overlayConfig.graphics?.map((graphic, i) => (
        <Sequence
          key={`graphic-${i}`}
          from={secToFrame(graphic.startSec)}
          durationInFrames={secToFrame(graphic.endSec - graphic.startSec)}
        >
          <GraphicItem config={graphic} style={styleName} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
