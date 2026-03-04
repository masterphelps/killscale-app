import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 30

interface AnalyzeImageRequest {
  imageBase64: string
  imageMimeType: string
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, imageMimeType }: AnalyzeImageRequest = await request.json()

    if (!imageBase64 || !imageMimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64, imageMimeType' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Image analysis not configured' },
        { status: 503 }
      )
    }

    console.log('[AnalyzeImage] Starting image analysis with Claude Sonnet...')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `Analyze this image as an expert creative strategist for advertising. Return a JSON object with this exact structure:

{
  "composition": "Describe the layout, framing, focal point, and visual hierarchy (1-2 sentences)",
  "subjects": ["List the main subjects/objects visible"],
  "colors": ["List the dominant colors as descriptive names, e.g. 'deep navy blue', 'warm gold'"],
  "mood": "Overall mood/feeling (e.g. 'energetic and bold', 'calm and luxurious')",
  "style": "Visual style category (e.g. 'product photography', 'lifestyle', 'flat lay', 'UGC-style', 'graphic design', 'illustration')",
  "textContent": [{"text": "exact text visible", "role": "headline|subtext|cta|logo|other"}],
  "adPotential": "1-2 sentences on how this image could be used or improved as an ad — what's working, what's missing",
  "suggestedEdits": ["2-3 specific, actionable edit suggestions to make this a stronger ad image"]
}

Respond with ONLY the JSON object, no markdown or explanation.`
          }
        ]
      }]
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    let analysis: Record<string, unknown>
    try {
      const cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim()
      analysis = JSON.parse(cleaned)
    } catch {
      // Fallback: try bracket-counting
      const start = rawText.indexOf('{')
      if (start !== -1) {
        let depth = 0
        let inString = false
        let escape = false
        let end = -1
        for (let i = start; i < rawText.length; i++) {
          const ch = rawText[i]
          if (escape) { escape = false; continue }
          if (ch === '\\' && inString) { escape = true; continue }
          if (ch === '"' && !escape) { inString = !inString; continue }
          if (inString) continue
          if (ch === '{') depth++
          else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
        }
        if (end !== -1) {
          analysis = JSON.parse(rawText.slice(start, end + 1))
        } else {
          analysis = { raw: rawText }
        }
      } else {
        analysis = { raw: rawText }
      }
    }

    console.log('[AnalyzeImage] Analysis complete — style:', analysis.style, ', subjects:', (analysis.subjects as string[])?.length || 0)

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('[AnalyzeImage] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Image analysis failed' },
      { status: 500 }
    )
  }
}
