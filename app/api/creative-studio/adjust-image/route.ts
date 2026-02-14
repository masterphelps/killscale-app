import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAI } from '@/lib/google-ai'

// Use shared Vertex AI / AI Studio client
const getGenAI = getGoogleAI

// Always use Gemini 3 Pro - it's the only model that works reliably
const MODEL_NAME = 'gemini-3-pro-image-preview'

interface AdjustImageRequest {
  imageBase64: string
  imageMimeType: string
  adjustmentPrompt: string
  productName?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: AdjustImageRequest = await request.json()

    if (!body.imageBase64 || !body.imageMimeType || !body.adjustmentPrompt) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64, imageMimeType, adjustmentPrompt' },
        { status: 400 }
      )
    }

    if (!getGenAI()) {
      return NextResponse.json(
        { error: 'Image generation not configured' },
        { status: 503 }
      )
    }

    console.log('[Adjust Image] Using model:', MODEL_NAME)
    console.log('[Adjust Image] Adjusting image with prompt:', body.adjustmentPrompt.slice(0, 100))

    const prompt = `Here is an advertisement image. Please modify it according to these instructions:

"${body.adjustmentPrompt}"

Requirements:
- Keep the same product/subject from the original image
- Maintain professional ad quality
- Apply the requested changes accurately
- Keep any text that was in the original (unless asked to change it)
- Output a high-resolution image
- Make sure all text fits in the image section where it's placed
- Ensure no cutoff sentences or words
- Any text must be spelled correctly

Generate the modified advertisement image.`

    const client = getGenAI()
    if (!client) {
      return NextResponse.json({ error: 'Image generation not configured' }, { status: 503 })
    }

    try {
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
                text: prompt
              }
            ]
          }
        ],
        config: {
          responseModalities: ['IMAGE'],
        }
      })

      // Extract the generated image from response
      const parts = response.candidates?.[0]?.content?.parts || []
      console.log('[Adjust Image] Response parts count:', parts.length)

      for (const part of parts) {
        if (part.inlineData) {
          console.log('[Adjust Image] Image adjusted successfully')

          // Convert raw bytes to base64 if needed
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawData: any = part.inlineData.data
          let base64Data: string
          if (typeof rawData === 'string') {
            base64Data = rawData
          } else if (Buffer.isBuffer(rawData)) {
            base64Data = rawData.toString('base64')
          } else if (rawData instanceof Uint8Array) {
            base64Data = Buffer.from(rawData).toString('base64')
          } else {
            base64Data = Buffer.from(rawData as ArrayBuffer).toString('base64')
          }

          return NextResponse.json({
            image: {
              base64: base64Data,
              mimeType: part.inlineData.mimeType || 'image/png',
            },
            adjustmentPrompt: body.adjustmentPrompt,
          })
        }
      }

      console.log('[Adjust Image] No image in Gemini response')
      return NextResponse.json(
        { error: 'Failed to adjust image - no output generated' },
        { status: 500 }
      )
    } catch (geminiError) {
      console.error('[Adjust Image] Gemini error:', geminiError)

      const errorMessage = geminiError instanceof Error ? geminiError.message : 'Image adjustment failed'

      if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
        return NextResponse.json(
          { error: 'Image could not be adjusted due to content policies. Try a different request.' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }
  } catch (err) {
    console.error('[Adjust Image] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Adjustment failed' },
      { status: 500 }
    )
  }
}
