import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAI } from '@/lib/google-ai'

// Use Flash for text extraction — fast, reliable for OCR/vision tasks
const MODEL_NAME = 'gemini-2.5-flash'

interface DetectTextRequest {
  imageBase64: string
  imageMimeType: string
}

interface DetectedTextBlock {
  text: string
  role: 'headline' | 'subtext' | 'cta' | 'other'
}

export async function POST(request: NextRequest) {
  try {
    const body: DetectTextRequest = await request.json()

    if (!body.imageBase64 || !body.imageMimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64, imageMimeType' },
        { status: 400 }
      )
    }

    const client = getGoogleAI()
    if (!client) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    console.log('[DetectText] Calling', MODEL_NAME, 'for text extraction')

    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: body.imageMimeType,
                data: body.imageBase64,
              }
            },
            {
              text: `Analyze this advertisement image and extract ALL visible text.

Return a JSON array where each element has:
- "text": the exact text as it appears in the image
- "role": one of "headline" (large/prominent text), "subtext" (smaller supporting text), "cta" (call-to-action buttons/text), or "other" (any other text like disclaimers, logos)

Rules:
- Extract EVERY text block visible in the image
- Preserve exact spelling, capitalization, and punctuation
- Order from most prominent (largest/boldest) to least prominent
- If no text is found, return an empty array []

Return ONLY the JSON array, no explanation or markdown formatting.`
            }
          ]
        }
      ],
    })

    const textContent = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    console.log('[DetectText] Raw response:', textContent.slice(0, 300))

    // Parse the JSON response, handling potential markdown wrapping
    let textBlocks: DetectedTextBlock[] = []
    try {
      const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      textBlocks = JSON.parse(cleaned)
    } catch {
      console.error('[DetectText] Failed to parse Gemini response:', textContent)
      textBlocks = []
    }

    console.log('[DetectText] Extracted', textBlocks.length, 'text blocks')

    return NextResponse.json({ textBlocks })
  } catch (err) {
    console.error('[DetectText] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Text detection failed' },
      { status: 500 }
    )
  }
}
