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

/**
 * Transcribe ALL unique source videos in a multi-clip timeline.
 *
 * Each clip comes from a different source video, so Whisper timestamps are
 * relative to each source video (starting at 0). We can't rely on
 * `buildCaptionsFromWhisper`'s generic `videoClips` remapping because
 * `sourceTimeToTimeline` matches words to clips by source timestamp range —
 * words from clip 2 (at 0-8s) would collide with clip 1 (also at 0-8s).
 *
 * Instead, we remap each clip's words to their TIMELINE position here,
 * producing words with absolute timeline timestamps. The caller should
 * then call `buildCaptionsFromWhisper` WITHOUT `videoClips` so it uses
 * the pre-remapped timestamps directly.
 */
async function transcribeMultiClipTimeline(
  videoClips: VideoClipEdit[],
  fps: number,
): Promise<{ text: string; words: WhisperWord[] } | null> {
  // Group clips by source video URL
  const urlToClips = new Map<string, VideoClipEdit[]>()
  for (const vc of videoClips) {
    if (!vc.videoUrl) continue
    const existing = urlToClips.get(vc.videoUrl) || []
    existing.push(vc)
    urlToClips.set(vc.videoUrl, existing)
  }

  if (urlToClips.size === 0) return null

  // Transcribe each unique source video in parallel
  const entries = Array.from(urlToClips.entries())
  console.log(`[generate-overlay] Transcribing ${entries.length} unique source videos for ${videoClips.length} clips`)
  const results = await Promise.all(
    entries.map(async ([url]) => {
      const result = await transcribeVideo(url)
      return { url, result }
    }),
  )

  // Build a map of URL → Whisper words
  const urlToWords = new Map<string, WhisperWord[]>()
  const allTexts: string[] = []
  for (const { url, result } of results) {
    if (result) {
      urlToWords.set(url, result.words)
      allTexts.push(result.text)
    }
  }

  if (urlToWords.size === 0) return null

  // Combine all words from all clips in timeline order.
  // Remap each word to its ABSOLUTE timeline position so that
  // buildCaptionsFromWhisper can use the timestamps directly.
  const allWords: WhisperWord[] = []
  // Sort clips by timeline position (fromFrame)
  const sortedClips = [...videoClips].sort((a, b) => a.fromFrame - b.fromFrame)
  for (const vc of sortedClips) {
    const words = urlToWords.get(vc.videoUrl)
    if (!words) continue
    // Clip's source range
    const sourceStart = vc.videoStartTime || 0
    const speed = vc.speed || 1
    const sourceEnd = sourceStart + (vc.durationFrames / fps) * speed
    // Clip's timeline start position
    const timelineStart = vc.fromFrame / fps
    for (const w of words) {
      if (w.start >= sourceStart - 0.05 && w.end <= sourceEnd + 0.1) {
        // Remap from source time to absolute timeline time
        allWords.push({
          word: w.word,
          start: timelineStart + (w.start - sourceStart) / speed,
          end: timelineStart + (w.end - sourceStart) / speed,
        })
      }
    }
  }

  if (allWords.length < 2) return null

  return {
    text: allTexts.join(' '),
    words: allWords,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { instruction, durationSeconds, currentConfig, videoUrl, transcript, videoClips, fps: reqFps } = await req.json()

    if (!instruction || typeof instruction !== 'string') {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
    }

    const fps = reqFps || 30

    // Calculate actual timeline duration from videoClips if available.
    // The DB's duration_seconds often only reflects the first clip and isn't
    // updated when clips are added via the timeline editor.
    let duration = durationSeconds || 10
    if (videoClips && videoClips.length > 0) {
      const clipsDuration = Math.max(
        ...videoClips.map((vc: VideoClipEdit) => (vc.fromFrame + vc.durationFrames) / fps),
      )
      if (clipsDuration > duration) {
        console.log(`[generate-overlay] Correcting duration from ${duration}s to ${clipsDuration.toFixed(1)}s (from videoClips)`)
        duration = clipsDuration
      }
    }

    // Transcribe video(s) if URL provided and no cached transcript.
    // For multi-clip timelines, transcribe all unique source videos.
    let resolvedTranscript: { text: string; words: WhisperWord[] } | null = transcript || null
    // When true, word timestamps are already in absolute timeline time (multi-clip)
    // and should NOT be re-remapped by buildCaptionsFromWhisper's videoClips logic.
    let transcriptPreMapped = false

    // Debug: log what we received
    console.log('[generate-overlay] videoUrl:', videoUrl?.slice(-40))
    console.log('[generate-overlay] hasCurrentConfig:', !!currentConfig, '| currentConfig.videoClips count:', currentConfig?.videoClips?.length)
    if (currentConfig?.videoClips) {
      for (const vc of currentConfig.videoClips) {
        console.log(`  clip: url=${vc.videoUrl?.slice(-40)} fromFrame=${vc.fromFrame} dur=${vc.durationFrames} startTime=${vc.videoStartTime}`)
      }
    }

    if (!resolvedTranscript) {
      // Check if we have multiple clips with different source videos
      const uniqueUrls = videoClips
        ? new Set((videoClips as VideoClipEdit[]).map((vc: VideoClipEdit) => vc.videoUrl).filter(Boolean))
        : new Set<string>()
      console.log('[generate-overlay] uniqueUrls:', uniqueUrls.size, '| hasCachedTranscript:', !!transcript)

      if (uniqueUrls.size > 1) {
        // Multi-clip timeline — transcribe each source video, pre-map to timeline
        resolvedTranscript = await transcribeMultiClipTimeline(videoClips, fps)
        transcriptPreMapped = true
      } else if (videoUrl) {
        // Single video or single-source clips — transcribe the primary URL
        resolvedTranscript = await transcribeVideo(videoUrl)
      }
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
      console.log('[generate-overlay] transcriptPreMapped:', transcriptPreMapped)
      // When transcript is pre-mapped (multi-clip), words already have absolute timeline
      // timestamps — skip videoClips remapping to avoid double-mapping.
      const captions = buildCaptionsFromWhisper(
        resolvedTranscript.words,
        duration,
        transcriptPreMapped ? undefined : videoClips,
        fps,
      )
      console.log('[generate-overlay] fast path: built', captions.length, 'captions | duration:', duration)
      for (const c of captions.slice(0, 3)) {
        console.log(`  first: "${c.text}" @ ${c.startSec.toFixed(2)}-${c.endSec.toFixed(2)}s`)
      }
      for (const c of captions.slice(-3)) {
        console.log(`  last: "${c.text}" @ ${c.startSec.toFixed(2)}-${c.endSec.toFixed(2)}s`)
      }
      console.log('[generate-overlay] response config has videoClips:', !!(currentConfig?.videoClips?.length))
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
