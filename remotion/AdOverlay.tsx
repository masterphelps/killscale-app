import React from 'react'
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  OffthreadVideo,
  Audio,
  Img,
} from 'remotion'
import type { AdOverlayProps, HookOverlay, CaptionOverlay, CTAOverlay, GraphicOverlay, OverlayStyle, OverlayConfig } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip internal metadata keys from rveStyles before applying as CSS */
function cleanStyles(styles: Record<string, any> | undefined): React.CSSProperties {
  if (!styles) return {}
  const { __ksTag, fontSizeScale, ...css } = styles
  // Convert rem font sizes to px (RVE editor uses 16px root on a scaled canvas;
  // Remotion renders at full 1080x1920 where 1rem ≈ 16px is too small)
  if (typeof css.fontSize === 'string' && css.fontSize.endsWith('rem')) {
    const remValue = parseFloat(css.fontSize)
    // The editor renders at ~360px wide viewport, composition is 1080px = 3x scale
    // So 3.2rem in editor ≈ 3.2 * 16 * 3 = 153.6px in composition
    css.fontSize = `${Math.round(remValue * 16 * 3)}px`
  }
  // Ensure WebkitBackgroundClip gradient text trick works in Remotion's Chromium
  // React uses camelCase but some RVE styles may come as camelCase already
  if (css.WebkitBackgroundClip === 'text') {
    css.backgroundClip = 'text'
  }
  return css as React.CSSProperties
}

// ─── Style Presets (fallback when rveStyles not available) ────────────────────

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
  wordflash: {
    fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif',
    hookBg: 'transparent',
    hookTextColor: '#ffffff',
    captionBg: 'transparent',
    captionTextColor: 'rgba(255,255,255,0.4)',
    captionHighlight: '#ffffff',
    ctaBg: '#8B5CF6',
    ctaTextColor: '#ffffff',
    shadowIntensity: 0.9,
  },
  promopunch: {
    fontFamily: '"Impact", "Arial Black", sans-serif',
    hookBg: 'rgba(239,68,68,0.9)',
    hookTextColor: '#ffffff',
    captionBg: 'transparent',
    captionTextColor: '#ffffff',
    captionHighlight: '#EF4444',
    ctaBg: '#EF4444',
    ctaTextColor: '#ffffff',
    shadowIntensity: 0.7,
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
  const hasRve = !!(config.rvePosition && config.rveStyles)

  if (hasRve) {
    // ── RVE mode: exact position + exact styles from the editor ──
    const pos = config.rvePosition!
    const styles = cleanStyles(config.rveStyles)
    return (
      <div
        style={{
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          opacity: anim.opacity,
        }}
      >
        <div style={{ ...styles, width: '100%' }}>
          {config.line1}
        </div>
        {config.line2 && (
          <div
            style={{
              ...styles,
              width: '100%',
              color: config.line2Color || brandColor || '#10B981',
              // Override gradient text for line2 if it has a solid color
              ...(config.line2Color ? {
                WebkitTextFillColor: config.line2Color,
                WebkitBackgroundClip: undefined,
                background: undefined,
              } : {}),
              marginTop: 8,
            }}
          >
            {config.line2}
          </div>
        )}
      </div>
    )
  }

  // ── Fallback: preset-based positioning ──
  const positionStyle: React.CSSProperties = (() => {
    switch (config.position || 'top') {
      case 'center': return { top: '50%', transform: 'translateY(-50%)' }
      case 'bottom': return { top: '70%' }
      default: return { top: '30%' }  // Hook at 30% from top
    }
  })()

  const mergedStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 40px',
    ...positionStyle,
    opacity: anim.opacity,
    transform: [positionStyle.transform, anim.transform].filter(Boolean).join(' ') || undefined,
  }

  const hookFontSize = config.fontSize || 52
  const hookFontWeight = config.fontWeight || 800

  return (
    <div style={mergedStyle}>
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
            fontSize: hookFontSize,
            fontWeight: hookFontWeight,
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
              fontSize: hookFontSize * 0.92,
              fontWeight: hookFontWeight - 100,
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

const Caption: React.FC<{
  config: CaptionOverlay
  style: OverlayStyle
  brandColor?: string
  captionStyles?: Record<string, any>
  captionPosition?: { left: number; top: number; width: number; height: number }
}> = ({
  config,
  style: styleName,
  brandColor,
  captionStyles,
  captionPosition,
}) => {
  const preset = STYLE_PRESETS[styleName]
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
  const hasRve = !!(captionPosition && captionStyles)

  // Animated highlight: the highlighted word pops in with a spring
  const highlightSpring = spring({ frame, fps, config: { stiffness: 300, damping: 18, mass: 0.6 } })

  // Highlight a specific word in the text
  const renderText = (baseStyles: React.CSSProperties) => {
    if (!config.highlightWord) {
      return <span>{config.text}</span>
    }

    const parts = config.text.split(new RegExp(`(${config.highlightWord})`, 'gi'))

    // RVE highlight styles if available
    const rawHlStyle: React.CSSProperties = captionStyles?.highlightStyle
      ? cleanStyles(captionStyles.highlightStyle)
      : { color: brandColor || preset.captionHighlight }

    // Animate the highlight: scale pops in, opacity transitions
    const hlScale = rawHlStyle.scale
      ? interpolate(highlightSpring, [0, 1], [1, Number(rawHlStyle.scale) || 1.07])
      : interpolate(highlightSpring, [0, 1], [1, 1.07])

    const hlStyle: React.CSSProperties = {
      ...rawHlStyle,
      scale: undefined, // handled via transform
      display: 'inline-block',
      transform: `scale(${hlScale})`,
    }

    // Dim non-highlighted words for contrast
    const dimStyle: React.CSSProperties = {
      opacity: interpolate(highlightSpring, [0, 1], [0.6, 0.5]),
    }

    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === config.highlightWord!.toLowerCase() ? (
            <span key={i} style={hlStyle}>{part}</span>
          ) : (
            <span key={i} style={dimStyle}>{part}</span>
          )
        )}
      </>
    )
  }

  if (hasRve) {
    // ── RVE mode: exact position + exact styles from the editor ──
    const pos = captionPosition!
    const { highlightStyle, ...textCss } = captionStyles || {}
    const styles = cleanStyles(textCss)

    return (
      <div
        style={{
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          opacity,
        }}
      >
        <div style={{ ...styles, width: '100%' }}>
          {renderText(styles)}
        </div>
      </div>
    )
  }

  // ── Fallback: preset-based positioning ──
  const captionPositionStyle: React.CSSProperties = (() => {
    switch (config.position || 'bottom') {
      case 'top': return { top: '30%' }
      case 'center': return { top: '50%', transform: 'translateY(-50%)' }
      default: return { top: '70%' }  // Captions at 70% from top
    }
  })()

  const fallbackStyles: React.CSSProperties = {
    fontFamily: preset.fontFamily,
    fontSize: config.fontSize || 36,
    fontWeight: config.fontWeight || 600,
    color: preset.captionTextColor,
    textAlign: 'center',
    lineHeight: 1.4,
    textShadow: `0 1px 4px rgba(0,0,0,${preset.shadowIntensity})`,
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 32px',
        opacity,
        ...captionPositionStyle,
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
        <div style={fallbackStyles}>
          {renderText(fallbackStyles)}
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
  const hasRve = !!(config.rvePosition && config.rveStyles)

  if (hasRve) {
    // ── RVE mode: exact position + exact styles from the editor ──
    const pos = config.rvePosition!
    const styles = cleanStyles(config.rveStyles)

    return (
      <div
        style={{
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          opacity: anim.opacity,
        }}
      >
        <div style={{ ...styles, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {config.buttonText}
        </div>
      </div>
    )
  }

  // ── Fallback: preset-based positioning ──
  const buttonBg = config.buttonColor || brandColor || preset.ctaBg

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',   // CTA at 50% from top
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
            fontSize: config.fontSize || 32,
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

  if (config.rvePosition) {
    // ── RVE mode: exact position from the editor ──
    const pos = config.rvePosition
    const styles = cleanStyles(config.rveStyles)
    return (
      <div
        style={{
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          opacity,
          ...(config.rotation ? { transform: `rotate(${config.rotation}deg)` } : {}),
          ...styles,
        }}
      >
        {config.imageUrl ? (
          <Img src={config.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : config.text ? (
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            {config.text}
          </div>
        ) : null}
      </div>
    )
  }

  // ── Fallback: preset-based positioning ──
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

export const AdOverlay: React.FC<AdOverlayProps> = ({ videoUrl, durationInSeconds, overlayConfig, trimStartSec }) => {
  const { fps } = useVideoConfig()
  const totalFrames = Math.round(durationInSeconds * fps)
  const styleName = overlayConfig.style || 'capcut'
  const brandColor = overlayConfig.brandColor

  const secToFrame = (sec: number) => Math.round(sec * fps)

  // Trim: startFrom tells OffthreadVideo which frame of the source to begin at
  const trimStart = trimStartSec ? Math.round(trimStartSec * fps) : 0

  // Multi-clip support: use videoClips if available, otherwise single videoUrl
  const videoClips = overlayConfig.videoClips

  return (
    <AbsoluteFill>
      {/* Background video(s) */}
      {videoClips && videoClips.length > 0 ? (
        // Multi-clip timeline: each clip is a Sequence with its own OffthreadVideo
        <>
          {videoClips.map((clip, i) => (
            <Sequence
              key={`clip-${i}`}
              from={clip.fromFrame}
              durationInFrames={Math.max(1, clip.durationFrames)}
            >
              <AbsoluteFill>
                <OffthreadVideo
                  src={clip.videoUrl}
                  startFrom={clip.videoStartTime ? Math.round(clip.videoStartTime * fps) : 0}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  volume={clip.volume ?? 1}
                />
              </AbsoluteFill>
            </Sequence>
          ))}
        </>
      ) : (
        // Single video fallback (legacy)
        <AbsoluteFill>
          <OffthreadVideo
            src={videoUrl}
            startFrom={trimStart}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      )}

      {/* Hook text */}
      {overlayConfig.hook && (() => {
        const hookDur = secToFrame(overlayConfig.hook.endSec - overlayConfig.hook.startSec)
        if (hookDur <= 0) return null
        return (
          <Sequence
            from={secToFrame(overlayConfig.hook.startSec)}
            durationInFrames={hookDur}
          >
            <HookText config={overlayConfig.hook} style={styleName} brandColor={brandColor} />
          </Sequence>
        )
      })()}

      {/* Timed captions */}
      {overlayConfig.captions?.map((caption, i) => {
        const capDur = secToFrame(caption.endSec - caption.startSec)
        if (capDur <= 0) return null
        return (
          <Sequence
            key={`caption-${i}`}
            from={secToFrame(caption.startSec)}
            durationInFrames={capDur}
          >
            <Caption
              config={caption}
              style={styleName}
              brandColor={brandColor}
              captionStyles={overlayConfig.captionStyles}
              captionPosition={overlayConfig.captionPosition}
            />
          </Sequence>
        )
      })}

      {/* CTA section */}
      {overlayConfig.cta && (() => {
        const ctaFrom = secToFrame(overlayConfig.cta.startSec)
        const ctaDur = overlayConfig.cta.durationSec
          ? secToFrame(overlayConfig.cta.durationSec)
          : totalFrames - ctaFrom
        if (ctaDur <= 0 || ctaFrom >= totalFrames) return null
        return (
          <Sequence from={ctaFrom} durationInFrames={Math.max(1, ctaDur)}>
            <CTASection config={overlayConfig.cta} style={styleName} brandColor={brandColor} />
          </Sequence>
        )
      })()}

      {/* Graphics overlays */}
      {overlayConfig.graphics?.map((graphic, i) => {
        const gDur = secToFrame(graphic.endSec - graphic.startSec)
        if (gDur <= 0) return null
        return (
          <Sequence
            key={`graphic-${i}`}
            from={secToFrame(graphic.startSec)}
            durationInFrames={gDur}
          >
            <GraphicItem config={graphic} style={styleName} />
          </Sequence>
        )
      })}

      {/* Voiceover audio */}
      {overlayConfig.voiceoverUrl && (
        <Audio src={overlayConfig.voiceoverUrl} volume={1} />
      )}

      {/* Music tracks */}
      {overlayConfig.musicTracks?.map((track, i) => {
        const trackDur = Math.max(1, track.durationFrames)
        return (
          <Sequence key={`music-${i}`} from={track.fromFrame} durationInFrames={trackDur}>
            <Audio src={track.src} volume={track.volume ?? 0.5} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
