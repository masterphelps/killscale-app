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

export async function POST(req: NextRequest) {
  try {
    const { instruction, durationSeconds, currentConfig, videoUrl, transcript } = await req.json()

    if (!instruction || typeof instruction !== 'string') {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
    }

    const duration = durationSeconds || 10

    // Transcribe video if URL provided and no cached transcript
    let resolvedTranscript: { text: string; words: WhisperWord[] } | null = transcript || null
    if (!resolvedTranscript && videoUrl) {
      resolvedTranscript = await transcribeVideo(videoUrl)
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
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON — strip markdown fences if Claude wraps them
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
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
