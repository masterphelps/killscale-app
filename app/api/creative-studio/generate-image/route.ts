import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, PersonGeneration } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY || '' })

interface GenerateImageRequest {
  adCopy: {
    headline: string
    primaryText: string
    description?: string
    angle: string
  }
  product: {
    name: string
    description?: string
    category?: string
    brand?: string
  }
  style?: 'lifestyle' | 'product' | 'minimal' | 'bold'
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9'
}

function buildImagePrompt(req: GenerateImageRequest): string {
  const { adCopy, product, style = 'lifestyle' } = req

  // Build a descriptive prompt for ad-style imagery
  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography, person using the product naturally, warm lighting, authentic feel, social media ad style',
    product: 'clean product photography, white or gradient background, professional studio lighting, e-commerce style',
    minimal: 'minimalist design, clean typography space, solid color background, modern aesthetic, text overlay space',
    bold: 'vibrant colors, dynamic composition, attention-grabbing, high contrast, social media scroll-stopper',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  // Create the image prompt
  const prompt = `Create a high-quality advertisement image for: ${product.name}

Product details:
- Category: ${product.category || 'consumer product'}
- Brand: ${product.brand || product.name}
${product.description ? `- Description: ${product.description}` : ''}

Ad concept: ${adCopy.angle}
Headline: ${adCopy.headline}

Visual style: ${styleGuide}

Requirements:
- Professional quality suitable for Facebook/Instagram ads
- Leave space for text overlay if needed
- No text or words in the image itself
- Focus on evoking the feeling of: ${adCopy.angle.toLowerCase()}
- The image should support and enhance the ad message
- Photorealistic, high resolution

Do NOT include any text, logos, or watermarks in the image.`

  return prompt
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateImageRequest = await request.json()

    if (!body.adCopy || !body.product?.name) {
      return NextResponse.json(
        { error: 'Missing required fields: adCopy, product.name' },
        { status: 400 }
      )
    }

    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Image generation not configured' },
        { status: 503 }
      )
    }

    const prompt = buildImagePrompt(body)
    console.log('[Imagen] Generating image with prompt:', prompt.slice(0, 200) + '...')

    // Generate image using Imagen 4
    const response = await genAI.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: body.aspectRatio || '1:1',
        // Don't allow person generation for commercial use compliance
        personGeneration: PersonGeneration.DONT_ALLOW,
      },
    })

    if (!response.generatedImages || response.generatedImages.length === 0) {
      console.error('[Imagen] No images generated')
      return NextResponse.json(
        { error: 'Failed to generate image' },
        { status: 500 }
      )
    }

    const generatedImage = response.generatedImages[0]
    const imageBytes = generatedImage.image?.imageBytes

    if (!imageBytes) {
      console.error('[Imagen] No image bytes in response')
      return NextResponse.json(
        { error: 'Failed to generate image' },
        { status: 500 }
      )
    }

    console.log('[Imagen] Image generated successfully')

    // Return base64 image data
    return NextResponse.json({
      image: {
        base64: imageBytes,
        mimeType: 'image/png',
      },
      prompt: prompt.slice(0, 500), // Return truncated prompt for reference
    })

  } catch (err) {
    console.error('[Imagen] Generation error:', err)

    // Handle specific API errors
    const errorMessage = err instanceof Error ? err.message : 'Image generation failed'

    if (errorMessage.includes('quota') || errorMessage.includes('rate')) {
      return NextResponse.json(
        { error: 'Image generation quota exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
      return NextResponse.json(
        { error: 'Image could not be generated due to content policies. Try adjusting the ad copy.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
