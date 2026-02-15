import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAI } from '@/lib/google-ai'

const MODEL_NAME = 'gemini-3-pro-image-preview'

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, imageMimeType } = await request.json()

    if (!imageBase64 || !imageMimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64, imageMimeType' },
        { status: 400 }
      )
    }

    const client = getGoogleAI()
    if (!client) {
      return NextResponse.json(
        { error: 'Image processing not configured' },
        { status: 503 }
      )
    }

    console.log('[RemoveBG] Starting background removal...')

    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: imageMimeType,
                data: imageBase64,
              }
            },
            {
              text: `Remove the background from this product image completely. Output ONLY the product itself on a pure white (#FFFFFF) background.

Rules:
- Keep the product EXACTLY as it appears — same shape, colors, text, branding, proportions, and details
- Do NOT alter, resize, crop, or modify the product in any way
- Remove ALL background elements — furniture, surfaces, shadows, reflections, other objects
- The product should be cleanly isolated with crisp edges
- Fill the removed background with solid pure white
- Maintain the original image resolution and quality
- Output as a clean product shot suitable for video generation`
            }
          ]
        }
      ],
      config: {
        responseModalities: ['IMAGE'],
      }
    })

    const parts = response.candidates?.[0]?.content?.parts || []

    for (const part of parts) {
      if (part.inlineData) {
        console.log('[RemoveBG] Background removed successfully')

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
          base64: base64Data,
          mimeType: part.inlineData.mimeType || 'image/png',
        })
      }
    }

    console.log('[RemoveBG] No image in Gemini response')
    return NextResponse.json(
      { error: 'Background removal failed — no output generated' },
      { status: 500 }
    )
  } catch (err) {
    console.error('[RemoveBG] Error:', err)

    const errorMessage = err instanceof Error ? err.message : 'Background removal failed'
    if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
      return NextResponse.json(
        { error: 'Image could not be processed due to content policies.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
