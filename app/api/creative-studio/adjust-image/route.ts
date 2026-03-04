import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAI, withModelFallback, withGeminiRetry, IMAGE_MODEL_PRIMARY, IMAGE_MODEL_FALLBACK } from '@/lib/google-ai'
import { buildAdjustImagePrompt } from '@/lib/prompts/adjust-image'

export const maxDuration = 60

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

    const client = getGoogleAI()
    if (!client) {
      return NextResponse.json(
        { error: 'Image generation not configured' },
        { status: 503 }
      )
    }

    console.log('[Adjust Image] Adjusting image with prompt:', body.adjustmentPrompt.slice(0, 100))

    const prompt = buildAdjustImagePrompt(body.adjustmentPrompt)

    const makeRequest = (model: string) =>
      withGeminiRetry(() => client.models.generateContent({
        model,
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
      }), 1, `Adjust Image (${model})`)

    try {
      const response = await withModelFallback(
        () => makeRequest(IMAGE_MODEL_PRIMARY),
        () => makeRequest(IMAGE_MODEL_FALLBACK),
        'Adjust Image',
      )

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
