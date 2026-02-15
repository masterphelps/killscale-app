import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { OverlayConfig } from '@/remotion/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const OVERLAY_SCHEMA = `
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

const SYSTEM_PROMPT = `You are a video ad overlay editor. Given the user's instruction and video duration, generate a complete OverlayConfig JSON object.

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

interface WhisperWord {
  word: string
  start: number
  end: number
}

async function transcribeVideo(videoUrl: string): Promise<{ text: string; words: WhisperWord[] } | null> {
  try {
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) return null

    const buffer = Buffer.from(await videoRes.arrayBuffer())
    // Whisper has a 25MB limit — these are short AI-generated videos so should be fine
    if (buffer.length > 25 * 1024 * 1024) return null

    const file = await OpenAI.toFile(buffer, 'video.mp4', { type: 'video/mp4' })

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    })

    const words: WhisperWord[] = (transcription as any).words || []
    const text = transcription.text || ''

    // If transcript is essentially empty or just noise, skip it
    if (!text.trim() || words.length < 2) return null

    return { text, words }
  } catch (err) {
    console.error('Whisper transcription failed:', err)
    return null
  }
}

function formatTranscript(transcript: { text: string; words: WhisperWord[] }): string {
  const wordLines = transcript.words
    .map(w => `[${w.start.toFixed(2)}-${w.end.toFixed(2)}] ${w.word}`)
    .join('\n')

  return `Full transcript: "${transcript.text}"\n\nWord-level timestamps:\n${wordLines}`
}

interface VideoClipEdit {
  videoUrl: string
  fromFrame: number
  durationFrames: number
  videoStartTime?: number
  speed?: number
}

/**
 * Remap a source-video timestamp to a timeline timestamp using clip edits.
 * Returns null if the source time falls outside all clips (i.e. was cut).
 */
function sourceTimeToTimeline(
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

/**
 * Build caption entries directly from Whisper word-level timestamps.
 * If videoClips are provided, remaps source timestamps to the edited timeline
 * so captions sync with the video after trims/cuts/rearrangements.
 */
function buildCaptionsFromWhisper(
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

export async function POST(req: NextRequest) {
  try {
    const { instruction, durationSeconds, currentConfig, videoUrl, transcript, videoClips, fps: reqFps } = await req.json()

    if (!instruction || typeof instruction !== 'string') {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
    }

    const fps = reqFps || 30

    const duration = durationSeconds || 10

    // Transcribe video if URL provided and no cached transcript
    let resolvedTranscript: { text: string; words: WhisperWord[] } | null = transcript || null
    if (!resolvedTranscript && videoUrl) {
      resolvedTranscript = await transcribeVideo(videoUrl)
    }

    // Fast path: for "generate captions" with a transcript, build directly from
    // Whisper word timestamps instead of asking Claude to reproduce them.
    // When videoClips are provided, remaps timestamps to the edited timeline.
    const isCaptionRequest = /^generate\s+captions?\b/i.test(instruction.trim())
    console.log('[generate-overlay] instruction:', instruction, '| isCaptionRequest:', isCaptionRequest,
      '| hasTranscript:', !!resolvedTranscript, '| wordCount:', resolvedTranscript?.words?.length,
      '| hasVideoClips:', !!videoClips, '| clipCount:', videoClips?.length,
      '| duration:', duration, '| fps:', fps)
    if (isCaptionRequest && resolvedTranscript && resolvedTranscript.words.length > 0) {
      if (videoClips) {
        console.log('[generate-overlay] videoClips:', JSON.stringify(videoClips.map((vc: any) => ({
          fromFrame: vc.fromFrame, durationFrames: vc.durationFrames,
          videoStartTime: vc.videoStartTime, speed: vc.speed
        }))))
      }
      // Log first few Whisper word timestamps for debugging
      console.log('[generate-overlay] Whisper words (first 6):', resolvedTranscript.words.slice(0, 6).map(w => `"${w.word}" ${w.start.toFixed(2)}-${w.end.toFixed(2)}s`).join(', '))
      const captions = buildCaptionsFromWhisper(resolvedTranscript.words, duration, videoClips, fps)
      console.log('[generate-overlay] fast path: built', captions.length, 'captions')
      for (const c of captions.slice(0, 5)) {
        console.log(`  caption: "${c.text}" @ ${c.startSec.toFixed(2)}-${c.endSec.toFixed(2)}s`)
      }
      const overlayConfig: OverlayConfig = {
        ...(currentConfig || {}),
        captions,
        style: currentConfig?.style || 'capcut',
      }
      return NextResponse.json({ overlayConfig, transcript: resolvedTranscript })
    }

    let userMessage = `Video duration: ${duration} seconds\n\nInstruction: ${instruction}`

    if (resolvedTranscript) {
      userMessage += `\n\nAudio transcript (USE THESE EXACT WORDS for captions/subtitles):\n${formatTranscript(resolvedTranscript)}`
    } else {
      userMessage += `\n\n(No audio/speech detected in this video — if user wants captions, use their instruction text or create appropriate text)`
    }

    if (currentConfig) {
      userMessage += `\n\nCurrent overlay config (modify this based on the instruction, don't start from scratch):\n${JSON.stringify(currentConfig, null, 2)}`
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const wasTruncated = response.stop_reason === 'max_tokens'

    // Parse JSON — extract from markdown fences or find raw JSON object
    let cleaned = text.trim()
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim()
    } else {
      // Strip any leading/trailing non-JSON text — find first { to last }
      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1)
      }
    }
    // Fix trailing commas before ] or } (common LLM mistake)
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1')

    // If truncated, try to repair by closing open arrays/objects
    if (wasTruncated) {
      // Remove any trailing incomplete object (partial key-value)
      cleaned = cleaned.replace(/,?\s*\{[^}]*$/, '')
      // Count unclosed brackets and braces, then close them
      let openBraces = 0, openBrackets = 0
      for (const ch of cleaned) {
        if (ch === '{') openBraces++
        else if (ch === '}') openBraces--
        else if (ch === '[') openBrackets++
        else if (ch === ']') openBrackets--
      }
      cleaned += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
      // Clean trailing commas again after repair
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1')
    }

    const overlayConfig: OverlayConfig = JSON.parse(cleaned)

    // Clamp all time values to [0, duration]
    if (overlayConfig.hook) {
      overlayConfig.hook.startSec = Math.max(0, Math.min(overlayConfig.hook.startSec, duration))
      overlayConfig.hook.endSec = Math.max(0, Math.min(overlayConfig.hook.endSec, duration))
    }
    if (overlayConfig.captions) {
      for (const c of overlayConfig.captions) {
        c.startSec = Math.max(0, Math.min(c.startSec, duration))
        c.endSec = Math.max(0, Math.min(c.endSec, duration))
      }
    }
    if (overlayConfig.cta) {
      overlayConfig.cta.startSec = Math.max(0, Math.min(overlayConfig.cta.startSec, duration))
    }
    if (overlayConfig.graphics) {
      for (const g of overlayConfig.graphics) {
        g.startSec = Math.max(0, Math.min(g.startSec, duration))
        g.endSec = Math.max(0, Math.min(g.endSec, duration))
      }
    }

    // Return transcript so client can cache it for subsequent calls
    return NextResponse.json({ overlayConfig, transcript: resolvedTranscript })
  } catch (err: any) {
    console.error('generate-overlay error:', err)
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'AI returned invalid JSON. Try rephrasing your instruction.' }, { status: 422 })
    }
    return NextResponse.json({ error: err.message || 'Failed to generate overlay' }, { status: 500 })
  }
}
