/**
 * Video Overlay Prompts & Helpers
 *
 * Overlay schema, system prompt for Claude overlay generation,
 * Whisper caption building, transcript formatting, and timeline
 * timestamp remapping for edited video compositions.
 *
 * Extracted from: app/api/creative-studio/generate-overlay/route.ts
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface VideoClipEdit {
  videoUrl: string
  fromFrame: number
  durationFrames: number
  videoStartTime?: number
  speed?: number
}

// ── Overlay Schema ────────────────────────────────────────────────────────

export const OVERLAY_SCHEMA = `
interface HookOverlay {
  line1: string
  line2?: string
  line2Color?: string       // hex color for line2
  startSec: number          // typically 0
  endSec: number            // typically 2-3
  animation: 'pop' | 'fade' | 'slide'
  fontSize?: number         // default 52. Set higher (64-80) for bigger text, lower (32-40) for smaller
  fontWeight?: number       // default 800. Range 400 (normal) to 900 (black)
  position?: 'top' | 'center' | 'bottom'  // default 'top'. Where the hook appears vertically
}

interface CaptionOverlay {
  text: string              // short 2-4 word phrase (TikTok-style pacing)
  startSec: number
  endSec: number
  highlight?: boolean
  highlightWord?: string    // the single power/key word to highlight
  fontSize?: number         // default 36. Set higher (48-64) for bigger captions, lower (24-32) for smaller
  fontWeight?: number       // default 600. Range 400 (normal) to 900 (black)
  position?: 'top' | 'center' | 'bottom'  // default 'bottom'. Where captions appear vertically
}

interface CTAOverlay {
  buttonText: string        // e.g. "SHOP NOW", "LEARN MORE"
  brandName?: string
  url?: string
  buttonColor?: string      // hex color
  startSec: number          // typically last 2-3 seconds of video
  animation: 'pop' | 'fade' | 'slide'
  fontSize?: number         // default 32. Set higher (40-56) for bigger CTA text
}

interface GraphicOverlay {
  type: 'logo' | 'badge' | 'watermark' | 'lower_third'
  imageUrl?: string
  text?: string
  position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
  startSec: number
  endSec: number
  opacity?: number          // 0-1
}

type OverlayStyle = 'capcut' | 'minimal' | 'bold' | 'clean'

interface OverlayConfig {
  hook?: HookOverlay
  captions?: CaptionOverlay[]
  cta?: CTAOverlay
  graphics?: GraphicOverlay[]
  style: OverlayStyle
  brandColor?: string       // hex
  accentColor?: string      // hex
}
`

// ── System Prompt ─────────────────────────────────────────────────────────

export const OVERLAY_SYSTEM_PROMPT = `You are a video ad overlay editor. Given the user's instruction and video duration, generate a complete OverlayConfig JSON object.

Here is the exact TypeScript schema you must match:
${OVERLAY_SCHEMA}

Rules:
- Split subtitle/caption text into SHORT 2-4 word phrases for TikTok-style pacing (NOT long sentences)
- Each caption should last ~1.5-2.5 seconds
- Hook text should appear in the first 0-3 seconds
- CTA should appear in the last 2-3 seconds of the video
- ALWAYS set a highlightWord on each caption — pick the most impactful/power word
- Default style to "capcut" unless the user specifies otherwise
- Return ONLY valid JSON matching the OverlayConfig schema — no markdown, no explanation, no wrapping
- All time values must be within [0, videoDuration]
- If the user says "subtitles" or "captions", generate CaptionOverlay[] entries
- If the user mentions a CTA like "shop now" or "learn more", generate a CTAOverlay
- If the user mentions a hook, generate a HookOverlay

IMPORTANT — Audio transcript handling:
- When a transcript with word-level timestamps is provided, you MUST use the ACTUAL SPOKEN WORDS from the transcript for captions
- Use the timestamps from the transcript to time the captions accurately — group 2-4 consecutive words into each caption phrase
- The caption startSec should match the first word's start time, and endSec should match the last word's end time (with a small buffer)
- Do NOT make up caption text when a transcript is available — use the real words
- If no transcript is provided (silent video), then use the user's instruction text for captions and distribute evenly`

// ── Transcript Formatting ─────────────────────────────────────────────────

export function formatTranscript(transcript: { text: string; words: WhisperWord[] }): string {
  const wordLines = transcript.words
    .map(w => `[${w.start.toFixed(2)}-${w.end.toFixed(2)}] ${w.word}`)
    .join('\n')

  return `Full transcript: "${transcript.text}"\n\nWord-level timestamps:\n${wordLines}`
}

// ── Timeline Timestamp Remapping ──────────────────────────────────────────

/**
 * Remap a source-video timestamp to a timeline timestamp using clip edits.
 * Returns null if the source time falls outside all clips (i.e. was cut).
 */
export function sourceTimeToTimeline(
  sourceTime: number,
  clips: Array<{ timelineStart: number; sourceStart: number; sourceEnd: number; speed: number }>,
): number | null {
  for (const clip of clips) {
    if (sourceTime >= clip.sourceStart && sourceTime < clip.sourceEnd) {
      return clip.timelineStart + (sourceTime - clip.sourceStart) / clip.speed
    }
  }
  return null // word was in a cut section
}

// ── Caption Builder from Whisper ──────────────────────────────────────────

/**
 * Build caption entries directly from Whisper word-level timestamps.
 * If videoClips are provided, remaps source timestamps to the edited timeline
 * so captions sync with the video after trims/cuts/rearrangements.
 */
export function buildCaptionsFromWhisper(
  words: WhisperWord[],
  durationSec: number,
  videoClips?: VideoClipEdit[],
  fps: number = 30,
) {
  // Build clip mapping for timestamp remapping
  let mappedWords: WhisperWord[]

  if (videoClips && videoClips.length > 0) {
    const clips = videoClips.map(vc => ({
      timelineStart: vc.fromFrame / fps,
      sourceStart: vc.videoStartTime || 0,
      sourceEnd: (vc.videoStartTime || 0) + (vc.durationFrames / fps) * (vc.speed || 1),
      speed: vc.speed || 1,
    }))

    // Remap each word's timestamps through the clip edits
    mappedWords = []
    for (const w of words) {
      const mappedStart = sourceTimeToTimeline(w.start, clips)
      const mappedEnd = sourceTimeToTimeline(w.end, clips)
      if (mappedStart !== null && mappedEnd !== null) {
        mappedWords.push({ word: w.word, start: mappedStart, end: mappedEnd })
      }
    }
  } else {
    // No clip edits — use original timestamps directly
    mappedWords = words
  }

  if (mappedWords.length === 0) return []

  // Group mapped words into 2-4 word captions
  const captions: Array<{
    text: string; startSec: number; endSec: number;
    highlight: boolean; highlightWord: string; position: 'bottom';
  }> = []

  let i = 0
  while (i < mappedWords.length) {
    const remaining = mappedWords.length - i
    const groupSize = remaining <= 4 ? remaining : Math.min(3, remaining)
    const group = mappedWords.slice(i, i + groupSize)

    const text = group.map(w => w.word).join(' ')
    const startSec = Math.max(0, group[0].start)
    const endSec = Math.min(durationSec, group[group.length - 1].end)

    // Pick the longest word as the highlight word
    const highlightWord = group.reduce((best, w) =>
      w.word.replace(/[^a-zA-Z]/g, '').length > best.replace(/[^a-zA-Z]/g, '').length ? w.word : best
    , group[0].word)

    captions.push({ text, startSec, endSec, highlight: true, highlightWord, position: 'bottom' })
    i += groupSize
  }

  return captions
}
