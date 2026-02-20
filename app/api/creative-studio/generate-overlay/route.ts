import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { OverlayConfig } from '@/remotion/types'
import {
  OVERLAY_SYSTEM_PROMPT,
  buildCaptionsFromWhisper,
  formatTranscript,
  sourceTimeToTimeline,
  type WhisperWord,
  type VideoClipEdit,
} from '@/lib/prompts/video-overlays'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

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
      system: OVERLAY_SYSTEM_PROMPT,
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
