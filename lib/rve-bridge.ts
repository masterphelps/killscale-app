/**
 * Data bridge between KillScale OverlayConfig (API/storage format)
 * and RVE Overlay[] (editor runtime format).
 *
 * Pure functions — no React dependencies.
 */

import type {
  OverlayConfig,
  AppendedClip,
  VideoClipEdit,
  MusicTrack,
  HookOverlay as KSHookOverlay,
  CaptionOverlay as KSCaptionOverlay,
  CTAOverlay as KSCTAOverlay,
  GraphicOverlay as KSGraphicOverlay,
  EndCardOverlay as KSEndCardOverlay,
} from '@/remotion/types'

import {
  OverlayType,
  type Overlay,
  type ClipOverlay,
  type TextOverlay,
  type ShapeOverlay,
  type CaptionOverlay as RVECaptionOverlay,
  type ImageOverlay,
  type SoundOverlay,
  type CTAOverlay as RVECTAOverlay,
  type Caption,
} from '@/lib/rve/types'

// ─── Constants ───

const CANVAS_W = 1080
const CANVAS_H = 1920

// Position presets (1080×1920 canvas)
const POSITION_MAP: Record<string, { left: number; top: number; width: number; height: number }> = {
  top:    { left: 0, top: 80,   width: CANVAS_W, height: 300 },
  center: { left: 0, top: 810,  width: CANVAS_W, height: 300 },
  bottom: { left: 0, top: 1520, width: CANVAS_W, height: 300 },
}

const GRAPHIC_POSITION_MAP: Record<string, { left: number; top: number }> = {
  top_left:     { left: 40, top: 40 },
  top_right:    { left: 880, top: 40 },
  bottom_left:  { left: 40, top: 1720 },
  bottom_right: { left: 880, top: 1720 },
  center:       { left: 440, top: 860 },
}

// Metadata tags for identifying overlay purpose on reverse conversion
const META_TAG_HOOK = '__ks_hook'
const META_TAG_CTA = '__ks_cta'
const META_TAG_GRAPHIC = '__ks_graphic'
const META_TAG_CAPTION = '__ks_caption'
const META_TAG_ENDCARD_BG = '__ks_endcard_bg'
const META_TAG_ENDCARD_TEXT = '__ks_endcard_text'
const META_TAG_VOICEOVER = '__ks_voiceover'
export const META_TAG_MUSIC = '__ks_music'

let nextId = 1000 // start high to avoid collisions with RVE's own IDs

function genId(): number {
  return nextId++
}

function secToFrames(sec: number, fps: number): number {
  return Math.round(sec * fps)
}

/** Clamp overlay timing so from + duration stays within totalFrames. Returns null if overlay falls entirely outside. */
function clampTiming(from: number, dur: number, totalFrames: number): { from: number; durationInFrames: number } | null {
  const clampedFrom = Math.max(0, Math.min(from, totalFrames - 1))
  const clampedDur = Math.max(1, Math.min(dur, totalFrames - clampedFrom))
  if (clampedFrom >= totalFrames) return null
  return { from: clampedFrom, durationInFrames: clampedDur }
}

function framesToSec(frames: number, fps: number): number {
  return frames / fps
}

// ─── OverlayConfig → RVE Overlay[] ───

export function overlayConfigToRVEOverlays(
  config: OverlayConfig,
  videoUrl: string,
  durationSec: number,
  fps: number = 30,
): Overlay[] {
  const overlays: Overlay[] = []
  const totalFrames = secToFrames(durationSec, fps)

  // Dynamic row assignment — only allocate rows for overlays that exist
  // (avoids empty gaps in the timeline when graphics/voiceover are absent)
  let nextRow = 0
  const hookRow = config.hook ? nextRow++ : -1
  const captionRow = config.captions?.length ? nextRow++ : -1
  const ctaRow = config.cta ? nextRow++ : -1
  const graphicsRow = config.graphics?.length ? nextRow++ : -1
  const voiceoverRow = config.voiceoverUrl ? nextRow++ : -1
  const musicRow = config.musicTracks?.length ? nextRow++ : -1
  const videoRow = nextRow++
  // End card gets its own rows after video
  const endCardBgRow = config.endCard ? nextRow++ : -1
  const endCardTextRow = 0 // end card text goes on foreground row

  const hasVoiceover = !!config.voiceoverUrl

  // 1. Hook → TextOverlay (foreground)
  if (config.hook) {
    const h = config.hook
    const pos = POSITION_MAP[h.position || 'top']
    const content = h.line2 ? `${h.line1}\n${h.line2}` : h.line1
    const hookTiming = clampTiming(secToFrames(h.startSec, fps), secToFrames(h.endSec - h.startSec, fps), totalFrames)

    if (hookTiming) overlays.push({
      id: genId(),
      type: OverlayType.TEXT,
      content,
      from: hookTiming.from,
      durationInFrames: hookTiming.durationInFrames,
      left: pos.left,
      top: pos.top,
      width: pos.width,
      height: pos.height,
      row: hookRow,
      isDragging: false,
      rotation: 0,
      styles: {
        fontSize: `${h.fontSize || 52}px`,
        fontWeight: String(h.fontWeight || 800),
        color: '#FFFFFF',
        backgroundColor: 'transparent',
        fontFamily: 'Outfit',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        textShadow: '2px 2px 8px rgba(0,0,0,0.7)',
        animation: (h.animationEnter || h.animationExit) ? {
          enter: h.animationEnter || 'none',
          exit: h.animationExit || 'none',
        } : undefined,
        // Tag for reverse identification
        // @ts-expect-error — custom metadata property
        __ksTag: META_TAG_HOOK,
      },
    } satisfies TextOverlay)
  }

  // 2. Captions → CaptionOverlay
  if (config.captions && config.captions.length > 0) {
    const captions = config.captions
    const firstStart = Math.min(...captions.map(c => c.startSec))
    const lastEnd = Math.max(...captions.map(c => c.endSec))

    // RVE caption times are RELATIVE to the container start (useCurrentFrame is per-Sequence)
    const rveCaptions: Caption[] = captions.map(c => {
      const relStartMs = (c.startSec - firstStart) * 1000
      const relEndMs = (c.endSec - firstStart) * 1000
      return {
        text: c.text,
        startMs: relStartMs,
        endMs: relEndMs,
        timestampMs: relStartMs,
        confidence: 1,
        words: c.text.split(' ').map((word, i, arr) => {
          const segDur = (relEndMs - relStartMs) / arr.length
          return {
            word,
            startMs: relStartMs + i * segDur,
            endMs: relStartMs + (i + 1) * segDur,
            confidence: 1,
          }
        }),
      }
    })

    const captionPos = POSITION_MAP[captions[0]?.position || 'bottom']
    const capTiming = clampTiming(secToFrames(firstStart, fps), secToFrames(lastEnd - firstStart, fps), totalFrames)

    if (capTiming) overlays.push({
      id: genId(),
      type: OverlayType.CAPTION,
      captions: rveCaptions,
      from: capTiming.from,
      durationInFrames: capTiming.durationInFrames,
      left: captionPos.left,
      top: captionPos.top,
      width: captionPos.width,
      height: captionPos.height,
      row: captionRow,
      isDragging: false,
      rotation: 0,
      // Use saved styles if available, otherwise default
      styles: (config.captionStyles as any) || {
        fontFamily: 'Outfit',
        fontSize: `${captions[0]?.fontSize || 36}px`,
        lineHeight: 1.3,
        textAlign: 'center',
        color: '#FFFFFF',
        fontWeight: captions[0]?.fontWeight || 600,
        textShadow: '1px 1px 4px rgba(0,0,0,0.5)',
        highlightStyle: {
          backgroundColor: config.brandColor || '#3b82f6',
          color: '#FFFFFF',
          scale: 1.1,
          fontWeight: 800,
          padding: '4px 8px',
          borderRadius: '4px',
        },
      },
      template: config.captionTemplate || 'default',
    } satisfies RVECaptionOverlay)
  }

  // 3. CTA → restore as original overlay type (CTA or TEXT) with full styles
  if (config.cta) {
    const c = config.cta
    const ctaDur = c.durationSec ? secToFrames(c.durationSec, fps) : totalFrames - secToFrames(c.startSec, fps)
    const ctaTiming = clampTiming(secToFrames(c.startSec, fps), ctaDur, totalFrames)

    if (ctaTiming) {
      // Use stored position if available, otherwise default
      const pos = c.rvePosition || { left: POSITION_MAP.bottom.left + 200, top: POSITION_MAP.bottom.top, width: 680, height: 120 }

      if (c.overlayType === 'cta' && c.rveStyles) {
        // Restore as native CTA overlay (sidebar-created) with full styles
        overlays.push({
          id: genId(),
          type: OverlayType.CTA,
          content: c.buttonText,
          from: ctaTiming.from,
          durationInFrames: ctaTiming.durationInFrames,
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          row: ctaRow,
          isDragging: false,
          rotation: 0,
          styles: c.rveStyles,
        } as RVECTAOverlay)
      } else if (c.rveStyles) {
        // Restore as TEXT overlay with full saved styles
        overlays.push({
          id: genId(),
          type: OverlayType.TEXT,
          content: c.buttonText,
          from: ctaTiming.from,
          durationInFrames: ctaTiming.durationInFrames,
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          row: ctaRow,
          isDragging: false,
          rotation: 0,
          styles: {
            ...c.rveStyles,
            // @ts-expect-error — custom metadata property
            __ksTag: META_TAG_CTA,
          },
        } satisfies TextOverlay)
      } else {
        // Fallback: default CTA styling (legacy configs without rveStyles)
        overlays.push({
          id: genId(),
          type: OverlayType.TEXT,
          content: c.buttonText,
          from: ctaTiming.from,
          durationInFrames: ctaTiming.durationInFrames,
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
          row: ctaRow,
          isDragging: false,
          rotation: 0,
          styles: {
            fontSize: `${c.fontSize || 32}px`,
            fontWeight: '700',
            color: c.textColor || '#FFFFFF',
            backgroundColor: c.buttonColor || config.brandColor || '#3b82f6',
            fontFamily: 'Outfit',
            fontStyle: 'normal',
            textDecoration: 'none',
            textAlign: 'center',
            padding: '16px 32px',
            borderRadius: '16px',
            animation: (c.animationEnter || c.animationExit) ? {
              enter: c.animationEnter || 'none',
              exit: c.animationExit || 'none',
            } : undefined,
            // @ts-expect-error — custom metadata property
            __ksTag: META_TAG_CTA,
          },
        } satisfies TextOverlay)
      }
    }
  }

  // 4. Graphics → ImageOverlay
  if (config.graphics) {
    config.graphics.forEach(g => {
      const gPos = GRAPHIC_POSITION_MAP[g.position] || GRAPHIC_POSITION_MAP.center
      const gTiming = clampTiming(secToFrames(g.startSec, fps), secToFrames(g.endSec - g.startSec, fps), totalFrames)
      if (!gTiming) return

      overlays.push({
        id: genId(),
        type: OverlayType.IMAGE,
        src: g.imageUrl || '',
        content: g.text || '',
        from: gTiming.from,
        durationInFrames: gTiming.durationInFrames,
        left: gPos.left,
        top: gPos.top,
        width: 160,
        height: 160,
        row: graphicsRow,
        isDragging: false,
        rotation: 0,
        styles: {
          opacity: g.opacity ?? 1,
          objectFit: 'contain',
        },
      } satisfies ImageOverlay)
    })
  }

  // 5. Voiceover → SoundOverlay (tagged to distinguish from music)
  if (config.voiceoverUrl) {
    overlays.push({
      id: genId(),
      type: OverlayType.SOUND,
      content: 'Voiceover',
      src: config.voiceoverUrl,
      from: 0,
      durationInFrames: totalFrames,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      row: voiceoverRow,
      isDragging: false,
      rotation: 0,
      styles: {
        volume: 1,
        // @ts-expect-error — custom metadata property
        __ksTag: META_TAG_VOICEOVER,
      },
    } satisfies SoundOverlay)
  }

  // 5b. Music tracks → SoundOverlay (no voiceover tag)
  if (config.musicTracks) {
    for (const track of config.musicTracks) {
      overlays.push({
        id: genId(),
        type: OverlayType.SOUND,
        content: track.title,
        src: track.src,
        from: track.fromFrame,
        durationInFrames: track.durationFrames,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        row: musicRow,
        isDragging: false,
        rotation: 0,
        styles: {
          volume: track.volume ?? 1,
          // @ts-expect-error — custom metadata property
          __ksTag: META_TAG_MUSIC,
        },
      } satisfies SoundOverlay)
    }
  }

  // 6. Video clips — restore from saved edits (videoClips) or create full-length default
  if (config.videoClips && config.videoClips.length > 0) {
    // Restore saved video clip edits (cuts/trims/splits)
    for (const vc of config.videoClips) {
      const clip: ClipOverlay = {
        id: genId(),
        type: OverlayType.VIDEO,
        content: vc.videoUrl,
        src: vc.videoUrl,
        from: vc.fromFrame,
        durationInFrames: vc.durationFrames,
        left: 0,
        top: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        row: videoRow,
        isDragging: false,
        rotation: 0,
        styles: {
          objectFit: 'cover',
          volume: vc.volume ?? (hasVoiceover ? 0 : 1),
          animation: vc.animation,
        },
      }
      if (vc.videoStartTime != null) clip.videoStartTime = vc.videoStartTime
      if (vc.speed != null) clip.speed = vc.speed
      if (vc.segments) clip.segments = vc.segments
      if (vc.mediaSrcDuration != null) clip.mediaSrcDuration = vc.mediaSrcDuration
      overlays.push(clip)
    }
  } else {
    // No saved clip edits — create full-length base clip (legacy/first-load behavior)
    overlays.push({
      id: genId(),
      type: OverlayType.VIDEO,
      content: videoUrl,
      src: videoUrl,
      from: 0,
      durationInFrames: totalFrames,
      left: 0,
      top: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      row: videoRow,
      isDragging: false,
      rotation: 0,
      styles: {
        objectFit: 'cover',
        volume: hasVoiceover ? 0 : 1,
      },
    } satisfies ClipOverlay)

    // 7. Appended clips (additional video segments) — legacy path
    if (config.appendedClips) {
      for (const clip of config.appendedClips) {
        const clipFrames = secToFrames(clip.durationSeconds, fps)
        overlays.push({
          id: genId(),
          type: OverlayType.VIDEO,
          content: clip.videoUrl,
          src: clip.videoUrl,
          from: clip.fromFrame,
          durationInFrames: clipFrames,
          left: 0,
          top: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          row: videoRow,
          isDragging: false,
          rotation: 0,
          styles: {
            objectFit: 'cover',
            volume: hasVoiceover ? 0 : 1,
          },
        } satisfies ClipOverlay)

        // Also create overlays from the appended clip's own overlay config (hook, captions, CTA)
        // time-shifted to start at the clip's fromFrame
        if (clip.overlayConfig) {
          const subOverlays = overlayConfigToRVEOverlays(clip.overlayConfig, clip.videoUrl, clip.durationSeconds, fps)
          for (const sub of subOverlays) {
            // Skip the VIDEO overlay (we already placed the clip above)
            if (sub.type === OverlayType.VIDEO) continue
            // Time-shift: add the clip's fromFrame offset
            sub.from += clip.fromFrame
            sub.id = genId() // new unique ID
            overlays.push(sub)
          }
        }
      }
    }
  }

  // 8. End card (background + foreground text — extends past ALL clips)
  if (config.endCard) {
    const ec = config.endCard
    const ecFrames = secToFrames(ec.durationSec, fps)

    // Calculate the end of all video content (base + appended clips)
    let allClipsEndFrame = totalFrames
    if (config.appendedClips) {
      for (const clip of config.appendedClips) {
        const clipEnd = clip.fromFrame + secToFrames(clip.durationSeconds, fps)
        if (clipEnd > allClipsEndFrame) allClipsEndFrame = clipEnd
      }
    }

    // Shape background — full screen, starts when ALL video content ends
    overlays.push({
      id: genId(),
      type: OverlayType.SHAPE,
      content: 'End Card',
      from: allClipsEndFrame,
      durationInFrames: ecFrames,
      left: 0,
      top: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      row: endCardBgRow,
      isDragging: false,
      rotation: 0,
      styles: {
        fill: ec.backgroundColor,
        // @ts-expect-error — custom metadata property
        __ksTag: META_TAG_ENDCARD_BG,
      },
    } satisfies ShapeOverlay)

    // Text on end card (if provided)
    if (ec.text) {
      overlays.push({
        id: genId(),
        type: OverlayType.TEXT,
        content: ec.text,
        from: allClipsEndFrame,
        durationInFrames: ecFrames,
        left: 0,
        top: 760,
        width: CANVAS_W,
        height: 400,
        row: endCardTextRow,
        isDragging: false,
        rotation: 0,
        styles: {
          fontSize: `${ec.fontSize || 48}px`,
          fontWeight: '700',
          color: ec.textColor || '#FFFFFF',
          backgroundColor: 'transparent',
          fontFamily: 'Outfit',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          // @ts-expect-error — custom metadata property
          __ksTag: META_TAG_ENDCARD_TEXT,
        },
      } satisfies TextOverlay)
    }
  }

  return overlays
}

// ─── RVE Overlay[] → OverlayConfig ───

function nearestPosition(top: number): 'top' | 'center' | 'bottom' {
  const distances = Object.entries(POSITION_MAP).map(([key, pos]) => ({
    key: key as 'top' | 'center' | 'bottom',
    distance: Math.abs(top - pos.top),
  }))
  distances.sort((a, b) => a.distance - b.distance)
  return distances[0].key
}

function nearestGraphicPosition(left: number, top: number): KSGraphicOverlay['position'] {
  const positions = Object.entries(GRAPHIC_POSITION_MAP).map(([key, pos]) => ({
    key: key as KSGraphicOverlay['position'],
    distance: Math.sqrt(Math.pow(left - pos.left, 2) + Math.pow(top - pos.top, 2)),
  }))
  positions.sort((a, b) => a.distance - b.distance)
  return positions[0].key
}

export function rveOverlaysToOverlayConfig(
  overlays: Overlay[],
  existingConfig?: Partial<OverlayConfig>,
  fps: number = 30,
): OverlayConfig {
  let hook: KSHookOverlay | undefined
  const captions: KSCaptionOverlay[] = []
  let cta: KSCTAOverlay | undefined
  const graphics: KSGraphicOverlay[] = []
  let captionStyles: Record<string, any> | undefined
  let captionTemplate: string | undefined

  // End card reconstruction
  let endCardBg: { from: number; durationInFrames: number; backgroundColor: string } | undefined
  let endCardText: { content: string; color: string; fontSize: number } | undefined

  // Collect all video overlays, sorted by `from` — first is the base clip, rest are appended
  const videoOverlays = overlays
    .filter(o => o.type === OverlayType.VIDEO)
    .sort((a, b) => a.from - b.from) as ClipOverlay[]

  // Build time ranges for each video clip so we can attribute overlays to the right clip
  const clipRanges = videoOverlays.map(v => ({
    from: v.from,
    end: v.from + v.durationInFrames,
    src: v.src,
    durationSec: framesToSec(v.durationInFrames, fps),
  }))

  // Helper: determine which clip index an overlay belongs to (by time midpoint)
  function getClipIndex(overlayFrom: number, overlayDur: number): number {
    const mid = overlayFrom + overlayDur / 2
    for (let i = clipRanges.length - 1; i >= 0; i--) {
      if (mid >= clipRanges[i].from) return i
    }
    return 0
  }

  // Helper: extract overlay data for a given clip segment (time-shifted to clip-local)
  function extractHook(text: TextOverlay, clipFrom: number): KSHookOverlay {
    const lines = text.content.split('\n')
    const anim = text.styles.animation
    return {
      line1: lines[0] || '',
      line2: lines[1],
      startSec: framesToSec(text.from - clipFrom, fps),
      endSec: framesToSec(text.from + text.durationInFrames - clipFrom, fps),
      animation: existingConfig?.hook?.animation || 'pop',
      animationEnter: anim?.enter || existingConfig?.hook?.animationEnter,
      animationExit: anim?.exit || existingConfig?.hook?.animationExit,
      fontSize: parseInt(text.styles.fontSize) || 52,
      fontWeight: parseInt(text.styles.fontWeight) || 800,
      position: nearestPosition(text.top),
    }
  }

  function extractCTA(text: TextOverlay, clipFrom: number): KSCTAOverlay {
    const anim = text.styles.animation
    return {
      buttonText: text.content,
      startSec: framesToSec(text.from - clipFrom, fps),
      durationSec: framesToSec(text.durationInFrames, fps),
      animation: existingConfig?.cta?.animation || 'pop',
      animationEnter: anim?.enter || existingConfig?.cta?.animationEnter,
      animationExit: anim?.exit || existingConfig?.cta?.animationExit,
      buttonColor: text.styles.backgroundColor !== 'transparent' ? text.styles.backgroundColor : undefined,
      textColor: text.styles.color,
      fontSize: parseInt(text.styles.fontSize) || 32,
      overlayType: 'text',
      rveStyles: { ...text.styles },
      rvePosition: { left: text.left, top: text.top, width: text.width, height: text.height },
    }
  }

  function extractCaptions(cap: RVECaptionOverlay, clipFrom: number): KSCaptionOverlay[] {
    const containerStartSec = framesToSec(cap.from - clipFrom, fps)
    return cap.captions.map(c => ({
      text: c.text,
      startSec: containerStartSec + c.startMs / 1000,
      endSec: containerStartSec + c.endMs / 1000,
      fontSize: parseInt(cap.styles?.fontSize || '36') || 36,
      fontWeight: typeof cap.styles?.fontWeight === 'number' ? cap.styles.fontWeight : 600,
      position: nearestPosition(cap.top),
      highlight: !!cap.styles?.highlightStyle,
      highlightWord: c.words?.[0]?.word,
    }))
  }

  // Per-clip overlay data collectors
  const perClipHooks: (KSHookOverlay | undefined)[] = clipRanges.map(() => undefined)
  const perClipCaptions: KSCaptionOverlay[][] = clipRanges.map(() => [])
  const perClipCTAs: (KSCTAOverlay | undefined)[] = clipRanges.map(() => undefined)

  for (const o of overlays) {
    if (o.type === OverlayType.VIDEO) continue

    if (o.type === OverlayType.SHAPE) {
      const shape = o as ShapeOverlay
      const tag = (shape.styles as any)?.__ksTag
      if (tag === META_TAG_ENDCARD_BG) {
        endCardBg = {
          from: shape.from,
          durationInFrames: shape.durationInFrames,
          backgroundColor: shape.styles.fill || '#000000',
        }
      }
      continue
    }

    if (o.type === OverlayType.TEXT) {
      const text = o as TextOverlay
      const tag = (text.styles as any)?.__ksTag

      if (tag === META_TAG_ENDCARD_TEXT) {
        endCardText = {
          content: text.content,
          color: text.styles.color,
          fontSize: parseInt(text.styles.fontSize) || 48,
        }
        continue
      }

      const ci = getClipIndex(text.from, text.durationInFrames)
      const clipFrom = clipRanges[ci]?.from || 0

      if (tag === META_TAG_CTA) {
        // Always capture CTA with absolute times for top-level config
        // (videoClips format uses global overlays, not per-clip)
        cta = extractCTA(text, 0)
        perClipCTAs[ci] = extractCTA(text, clipFrom)
      } else {
        // Hook text — always capture with absolute times
        if (!hook) {
          hook = extractHook(text, 0)
        }
        if (!perClipHooks[ci]) {
          perClipHooks[ci] = extractHook(text, clipFrom)
        }
      }
    }

    if (o.type === OverlayType.CAPTION) {
      const cap = o as RVECaptionOverlay
      const ci = getClipIndex(cap.from, cap.durationInFrames)
      const clipFrom = clipRanges[ci]?.from || 0
      const extracted = extractCaptions(cap, clipFrom)
      perClipCaptions[ci].push(...extracted)
      // Always capture captions with absolute times for top-level config
      // (videoClips format uses global overlays, not per-clip)
      const containerStartSec = framesToSec(cap.from, fps)
      cap.captions.forEach(c => {
        captions.push({
          text: c.text,
          startSec: containerStartSec + c.startMs / 1000,
          endSec: containerStartSec + c.endMs / 1000,
          fontSize: parseInt(cap.styles?.fontSize || '36') || 36,
          fontWeight: typeof cap.styles?.fontWeight === 'number' ? cap.styles.fontWeight : 600,
          position: nearestPosition(cap.top),
          highlight: !!cap.styles?.highlightStyle,
          highlightWord: c.words?.[0]?.word,
        })
      })
      // Capture full caption styles and template for round-trip fidelity
      if (!captionStyles && cap.styles) {
        captionStyles = { ...cap.styles }
      }
      if (!captionTemplate && cap.template) {
        captionTemplate = cap.template
      }
    }

    if (o.type === OverlayType.IMAGE) {
      const img = o as ImageOverlay
      graphics.push({
        type: 'logo',
        imageUrl: img.src,
        text: img.content || undefined,
        position: nearestGraphicPosition(img.left, img.top),
        startSec: framesToSec(img.from, fps),
        endSec: framesToSec(img.from + img.durationInFrames, fps),
        opacity: img.styles?.opacity ?? 1,
      })
    }

    // Handle sidebar-created CTA overlays (type OverlayType.CTA, NOT TEXT with __ksTag)
    if (o.type === OverlayType.CTA) {
      const ctaOverlay = o as RVECTAOverlay
      const ci = getClipIndex(ctaOverlay.from, ctaOverlay.durationInFrames)
      const clipFrom = clipRanges[ci]?.from || 0
      const anim = ctaOverlay.styles.animation
      // Always capture with absolute times for top-level config
      cta = {
        buttonText: ctaOverlay.content,
        startSec: framesToSec(ctaOverlay.from, fps),
        durationSec: framesToSec(ctaOverlay.durationInFrames, fps),
        animation: existingConfig?.cta?.animation || 'pop',
        animationEnter: anim?.enter || existingConfig?.cta?.animationEnter,
        animationExit: anim?.exit || existingConfig?.cta?.animationExit,
        buttonColor: ctaOverlay.styles.backgroundColor !== 'transparent' ? ctaOverlay.styles.backgroundColor : undefined,
        textColor: ctaOverlay.styles.color,
        fontSize: parseInt(ctaOverlay.styles.fontSize) || 32,
        overlayType: 'cta',
        rveStyles: { ...ctaOverlay.styles },
        rvePosition: { left: ctaOverlay.left, top: ctaOverlay.top, width: ctaOverlay.width, height: ctaOverlay.height },
      }
      perClipCTAs[ci] = {
        ...cta,
        startSec: framesToSec(ctaOverlay.from - clipFrom, fps),
      }
    }
  }

  // Build appended clips with per-clip overlay configs (legacy format)
  const appendedClips: AppendedClip[] = []
  for (let i = 1; i < videoOverlays.length; i++) {
    const v = videoOverlays[i]
    const clipOverlayConfig: OverlayConfig = {
      style: existingConfig?.style || 'clean',
      hook: perClipHooks[i],
      captions: perClipCaptions[i].length > 0 ? perClipCaptions[i] : undefined,
      cta: perClipCTAs[i],
    }
    // Only include overlayConfig if the clip has any overlays
    const hasOverlays = clipOverlayConfig.hook || clipOverlayConfig.captions || clipOverlayConfig.cta
    appendedClips.push({
      videoUrl: v.src,
      durationSeconds: framesToSec(v.durationInFrames, fps),
      fromFrame: v.from,
      overlayConfig: hasOverlays ? clipOverlayConfig : undefined,
    })
  }

  // Capture ALL video clip edits (cuts/trims/splits) for persistence
  const videoClips: VideoClipEdit[] = videoOverlays.map(v => {
    const vc: VideoClipEdit = {
      videoUrl: v.src,
      fromFrame: v.from,
      durationFrames: v.durationInFrames,
      volume: v.styles?.volume,
    }
    if (v.videoStartTime != null) vc.videoStartTime = v.videoStartTime
    if (v.speed != null) vc.speed = v.speed
    if (v.segments) vc.segments = v.segments
    if (v.mediaSrcDuration != null) vc.mediaSrcDuration = v.mediaSrcDuration
    if (v.styles?.animation) vc.animation = v.styles.animation
    return vc
  })

  // Extract voiceover URL from tagged sound overlays only (not music tracks)
  let voiceoverUrl: string | undefined
  for (const o of overlays) {
    if (o.type === OverlayType.SOUND) {
      const sound = o as SoundOverlay
      const tag = (sound.styles as any)?.__ksTag
      if (tag === META_TAG_VOICEOVER && sound.src) {
        voiceoverUrl = sound.src
        break
      }
    }
  }
  // Fallback: if no tagged voiceover found but content is 'Voiceover', use that
  // (handles overlays created before tagging was added)
  if (!voiceoverUrl) {
    for (const o of overlays) {
      if (o.type === OverlayType.SOUND) {
        const sound = o as SoundOverlay
        const tag = (sound.styles as any)?.__ksTag
        // Never treat music-tagged sounds as voiceover
        if (tag === META_TAG_MUSIC) continue
        if (sound.content === 'Voiceover' && sound.src) {
          voiceoverUrl = sound.src
          break
        }
      }
    }
  }

  // Extract music tracks (non-voiceover sound overlays)
  const musicTracks: MusicTrack[] = []
  for (const o of overlays) {
    if (o.type === OverlayType.SOUND) {
      const sound = o as SoundOverlay
      const tag = (sound.styles as any)?.__ksTag
      // Skip voiceover-tagged sounds and legacy 'Voiceover' content sounds
      if (tag === META_TAG_VOICEOVER || sound.content === 'Voiceover') continue
      if (sound.src) {
        musicTracks.push({
          src: sound.src,
          title: sound.content || 'Music',
          fromFrame: sound.from,
          durationFrames: sound.durationInFrames,
          volume: sound.styles?.volume,
        })
      }
    }
  }

  // Assemble end card from detected shape + text
  const endCard: KSEndCardOverlay | undefined = endCardBg ? {
    durationSec: framesToSec(endCardBg.durationInFrames, fps),
    backgroundColor: endCardBg.backgroundColor,
    text: endCardText?.content,
    textColor: endCardText?.color,
    fontSize: endCardText?.fontSize,
  } : undefined

  return {
    hook: hook || existingConfig?.hook,
    captions: captions.length > 0 ? captions : existingConfig?.captions,
    cta: cta || existingConfig?.cta,
    graphics: graphics.length > 0 ? graphics : existingConfig?.graphics,
    endCard: endCard || existingConfig?.endCard,
    style: existingConfig?.style || 'clean',
    brandColor: existingConfig?.brandColor,
    accentColor: existingConfig?.accentColor,
    voiceoverUrl: voiceoverUrl || existingConfig?.voiceoverUrl,
    musicTracks: musicTracks.length > 0 ? musicTracks : existingConfig?.musicTracks,
    appendedClips: appendedClips.length > 0 ? appendedClips : existingConfig?.appendedClips,
    videoClips: videoClips.length > 0 ? videoClips : undefined,
    captionStyles: captionStyles || existingConfig?.captionStyles,
    captionTemplate: captionTemplate || existingConfig?.captionTemplate,
  }
}
