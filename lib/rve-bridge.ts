/**
 * Data bridge between KillScale OverlayConfig (API/storage format)
 * and RVE Overlay[] (editor runtime format).
 *
 * Pure functions — no React dependencies.
 */

import type {
  OverlayConfig,
  AppendedClip,
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
      styles: {
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
      template: 'default',
    } satisfies RVECaptionOverlay)
  }

  // 3. CTA → TextOverlay
  if (config.cta) {
    const c = config.cta
    const ctaPos = POSITION_MAP.bottom
    const ctaTiming = clampTiming(secToFrames(c.startSec, fps), totalFrames - secToFrames(c.startSec, fps), totalFrames)

    if (ctaTiming) overlays.push({
      id: genId(),
      type: OverlayType.TEXT,
      content: c.buttonText,
      from: ctaTiming.from,
      durationInFrames: ctaTiming.durationInFrames,
      left: ctaPos.left + 200,
      top: ctaPos.top,
      width: 680,
      height: 120,
      row: ctaRow,
      isDragging: false,
      rotation: 0,
      styles: {
        fontSize: `${c.fontSize || 32}px`,
        fontWeight: '700',
        color: '#FFFFFF',
        backgroundColor: c.buttonColor || config.brandColor || '#3b82f6',
        fontFamily: 'Outfit',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        padding: '16px 32px',
        borderRadius: '16px',
        // @ts-expect-error — custom metadata property
        __ksTag: META_TAG_CTA,
      },
    } satisfies TextOverlay)
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

  // 5. Voiceover → SoundOverlay
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
      },
    } satisfies SoundOverlay)
  }

  // 6. Video clip (background, behind all overlays) — mute if voiceover present
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

  // 7. Appended clips (additional video segments)
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
    return {
      line1: lines[0] || '',
      line2: lines[1],
      startSec: framesToSec(text.from - clipFrom, fps),
      endSec: framesToSec(text.from + text.durationInFrames - clipFrom, fps),
      animation: existingConfig?.hook?.animation || 'pop',
      fontSize: parseInt(text.styles.fontSize) || 52,
      fontWeight: parseInt(text.styles.fontWeight) || 800,
      position: nearestPosition(text.top),
    }
  }

  function extractCTA(text: TextOverlay, clipFrom: number): KSCTAOverlay {
    return {
      buttonText: text.content,
      startSec: framesToSec(text.from - clipFrom, fps),
      animation: existingConfig?.cta?.animation || 'pop',
      buttonColor: text.styles.backgroundColor !== 'transparent' ? text.styles.backgroundColor : undefined,
      fontSize: parseInt(text.styles.fontSize) || 32,
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
        if (ci === 0) {
          cta = extractCTA(text, 0) // base clip uses absolute times
        }
        perClipCTAs[ci] = extractCTA(text, clipFrom)
      } else {
        // Hook text
        if (ci === 0 && !hook) {
          hook = extractHook(text, 0) // base clip uses absolute times
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
      if (ci === 0) {
        // Base clip captions use absolute times
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
  }

  // Build appended clips with per-clip overlay configs
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

  // Extract voiceover URL from sound overlays
  let voiceoverUrl: string | undefined
  for (const o of overlays) {
    if (o.type === OverlayType.SOUND) {
      const sound = o as SoundOverlay
      if (sound.src) {
        voiceoverUrl = sound.src
        break
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
    appendedClips: appendedClips.length > 0 ? appendedClips : existingConfig?.appendedClips,
  }
}
