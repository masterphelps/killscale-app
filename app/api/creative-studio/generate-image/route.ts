import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY || '' })

// Always use Gemini 3 Pro - it's the only model that works reliably
const MODEL_NAME = 'gemini-3-pro-image-preview'

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
    imageBase64?: string
    imageMimeType?: string
  }
  referenceAd?: {
    imageBase64: string
    imageMimeType: string
  }
  style?: 'clone' | 'lifestyle' | 'product' | 'minimal' | 'bold'
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9'
  imagePrompt?: string // User's custom prompt for Create mode (no reference ad)
}

// Common text requirements added to all prompts
const TEXT_REQUIREMENTS = `
- Make sure all text fits in the image section where it's placed
- Ensure no cutoff sentences or words
- Any text must be spelled correctly`

// Prompt when we have BOTH product image AND reference ad image
function buildDualImagePrompt(req: GenerateImageRequest): string {
  const { adCopy, product, style = 'clone' } = req

  // Clone style (default) - pure format matching, no creative interpretation
  if (style === 'clone') {
    return `I'm providing TWO images:
1. FIRST IMAGE: My product photo (${product.name}) - use this exact product in the ad
2. SECOND IMAGE: A reference ad - CLONE this exact visual format and style

Create an advertisement that is a FAITHFUL CLONE of the reference ad's format:
- Use MY PRODUCT from the first image (not the product in the reference ad)
- EXACTLY match the reference ad's layout, composition, and visual approach
- Copy the same camera angle, lighting style, background treatment, and framing
- If the reference has text, include text in the same style and positioning
- If the reference is minimal, keep it minimal
- If the reference has bold graphics, match that graphic style

Headline for text (if reference has text): "${adCopy.headline}"
Supporting copy: "${adCopy.primaryText.slice(0, 80)}"

Requirements:
- The output should look like it came from the same ad campaign as the reference
- Feature MY product from the first image
- Match the reference ad's format EXACTLY - this is a clone, not an interpretation
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate an ad that clones the reference ad's visual format using my product.`
  }

  // Bold style with reference ad
  if (style === 'bold') {
    return `I'm providing TWO images:
1. FIRST IMAGE: My product photo (${product.name}) - use this exact product in the ad
2. SECOND IMAGE: A reference ad - use as inspiration for a BOLD style

Create a BOLD, scroll-stopping, pattern-interrupting advertisement that:
- Features MY PRODUCT from the first image (not the product in the reference ad)
- Takes inspiration from the reference but makes it MORE bold and attention-grabbing
- Uses vibrant colors, high contrast, and dynamic composition

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 100)}"

Requirements:
- Make it impossible to scroll past
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Keep text minimal - only the headline and brief supporting copy
- Feature MY product from the first image prominently
- Professional quality suitable for Facebook/Instagram ads${TEXT_REQUIREMENTS}

Ad concept: ${adCopy.angle}

Generate a bold, attention-grabbing ad using my product photo.`
  }

  // Other styles (lifestyle, product, minimal) with reference ad
  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography, natural setting, warm and authentic feel',
    product: 'clean product photography, studio lighting, professional presentation',
    minimal: 'minimalist design, clean background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  return `I'm providing TWO images:
1. FIRST IMAGE: My product photo (${product.name}) - use this exact product in the ad
2. SECOND IMAGE: A reference ad - use for general inspiration

Create an advertisement with this style: ${styleGuide}

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 100)}"

The ad should:
- Feature MY PRODUCT from the first image (not the product in the reference ad)
- Use the ${style} visual style
- Take general inspiration from the reference ad's approach

Ad concept: ${adCopy.angle}

Requirements:
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Feature MY product from the first image prominently
- Apply the ${style} style to the image
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate a ${style} style ad with text overlay using my product photo.`
}

// Prompt when we only have product image (no reference ad)
function buildImagePrompt(req: GenerateImageRequest): string {
  const { adCopy, product, style = 'lifestyle' } = req

  // Bold style gets a completely different prompt
  if (style === 'bold') {
    return `Create a BOLD, scroll-stopping, pattern-interrupting advertisement image featuring this exact product: ${product.name}

Use the provided product image as reference - the generated image MUST feature this same product accurately.

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 100)}"

Requirements:
- Make it impossible to scroll past - use vibrant colors, high contrast, dynamic angles
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Keep text minimal - only the headline and brief supporting copy, no extra words
- Feature the product from the reference image prominently
- Professional quality suitable for Facebook/Instagram ads
- Eye-catching graphic design style, not just photography
- Bold typography that demands attention${TEXT_REQUIREMENTS}

Ad concept: ${adCopy.angle}

Generate a scroll-stopping advertisement that makes people stop and look.`
  }

  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography setting, warm lighting, authentic feel, social media ad style',
    product: 'clean product photography, white or gradient background, professional studio lighting',
    minimal: 'minimalist design, solid color background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  const prompt = `Create a high-quality advertisement image featuring this exact product: ${product.name}

Use the provided product image as reference - the generated image MUST feature this same product accurately.

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 100)}"

Ad concept: ${adCopy.angle}
Visual style: ${styleGuide}

Requirements:
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Feature the product from the reference image prominently
- Professional quality suitable for Facebook/Instagram ads
- ${style === 'lifestyle' ? 'Show the product being used or in an appealing lifestyle context' : 'Focus on the product itself'}
- Photorealistic, high resolution${TEXT_REQUIREMENTS}

Generate an advertisement image with text overlay for this product.`

  return prompt
}

// Prompt when user provides custom image direction (Create mode)
function buildCustomPrompt(req: GenerateImageRequest): string {
  const { adCopy, product, imagePrompt } = req

  return `Create an advertisement image for this product: ${product.name}

Use the provided product image as reference - the generated image MUST feature this same product accurately.

USER'S CREATIVE DIRECTION:
"${imagePrompt}"

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 150)}"

Ad concept: ${adCopy.angle}

Requirements:
- Follow the user's creative direction above
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Feature the product from the reference image prominently
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate an advertisement image with text overlay.`
}

function buildTextOnlyPrompt(req: GenerateImageRequest): string {
  const { adCopy, product, style = 'lifestyle' } = req

  // Bold style gets a completely different prompt with text included
  if (style === 'bold') {
    return `Create a BOLD, scroll-stopping, pattern-interrupting advertisement image for: ${product.name}

Product details:
- Category: ${product.category || 'consumer product'}
- Brand: ${product.brand || product.name}
${product.description ? `- Description: ${product.description}` : ''}

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 100)}"

Requirements:
- Make it impossible to scroll past - use vibrant colors, high contrast, dynamic angles
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Keep text minimal - only the headline and brief supporting copy, no extra words
- Feature or represent the product prominently
- Professional quality suitable for Facebook/Instagram ads
- Eye-catching graphic design style, not just photography
- Bold typography that demands attention${TEXT_REQUIREMENTS}

Ad concept: ${adCopy.angle}

Generate a scroll-stopping advertisement that makes people stop and look.`
  }

  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography, person using the product naturally, warm lighting, authentic feel',
    product: 'clean product photography, white or gradient background, professional studio lighting',
    minimal: 'minimalist design, solid color background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  const prompt = `Create a high-quality advertisement image for: ${product.name}

Product details:
- Category: ${product.category || 'consumer product'}
- Brand: ${product.brand || product.name}
${product.description ? `- Description: ${product.description}` : ''}

IMPORTANT: This ad MUST include text overlaid on the image:
- Headline: "${adCopy.headline}"
- Supporting copy: "${adCopy.primaryText.slice(0, 100)}"

Ad concept: ${adCopy.angle}
Visual style: ${styleGuide}

Requirements:
- Include the headline text prominently - spell it EXACTLY as provided, no typos
- Professional quality suitable for Facebook/Instagram ads
- Photorealistic, high resolution${TEXT_REQUIREMENTS}

Generate an advertisement image with text overlay.`

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

    const hasProductImage = body.product.imageBase64 && body.product.imageMimeType
    const hasReferenceAd = body.referenceAd?.imageBase64 && body.referenceAd?.imageMimeType

    console.log('[Imagen] Has product image:', hasProductImage, 'imageBase64 length:', body.product.imageBase64?.length || 0)
    console.log('[Imagen] Has reference ad:', hasReferenceAd, 'referenceAd length:', body.referenceAd?.imageBase64?.length || 0)

    if (hasProductImage) {
      // Build the parts array - product image first, then optionally reference ad
      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
        {
          inlineData: {
            mimeType: body.product.imageMimeType!,
            data: body.product.imageBase64!,
          }
        }
      ]

      // If we have a reference ad, add it as the second image
      if (hasReferenceAd) {
        console.log('[Imagen] Adding reference ad image to request')
        parts.push({
          inlineData: {
            mimeType: body.referenceAd!.imageMimeType,
            data: body.referenceAd!.imageBase64,
          }
        })
      }

      // Select prompt based on what we have:
      // 1. Reference ad (Clone mode) -> dual-image prompt
      // 2. Custom imagePrompt (Create mode) -> custom prompt with user's direction
      // 3. Neither -> default single-image prompt
      const prompt = hasReferenceAd
        ? buildDualImagePrompt(body)
        : body.imagePrompt
          ? buildCustomPrompt(body)
          : buildImagePrompt(body)
      parts.push({ text: prompt })

      console.log('[Imagen] Using model:', MODEL_NAME)

      try {
        const response = await genAI.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: 'user',
              parts: parts
            }
          ],
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
          }
        })

        // Extract the generated image from response
        const responseParts = response.candidates?.[0]?.content?.parts || []
        console.log('[Imagen] Response parts count:', responseParts.length)

        for (const part of responseParts) {
          if (part.inlineData) {
            console.log('[Imagen] Image generated successfully', hasReferenceAd ? 'with reference ad style' : 'with product reference')

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
              prompt: prompt.slice(0, 500),
            })
          }
        }

        console.log('[Imagen] No image in Gemini response, falling back to Imagen')
      } catch (geminiError) {
        console.error('[Imagen] Gemini image generation failed:', geminiError)
        console.log('[Imagen] Falling back to Imagen text-to-image')
      }
    }

    // Fallback: Use Imagen (text-to-image) without reference image
    console.log('[Imagen] Generating with Imagen text-only...')

    const prompt = buildTextOnlyPrompt(body)

    const response = await genAI.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: body.aspectRatio || '1:1',
      },
    })

    if (!response.generatedImages || response.generatedImages.length === 0) {
      console.error('[Imagen] No images generated from Imagen')
      return NextResponse.json(
        { error: 'Failed to generate image' },
        { status: 500 }
      )
    }

    const generatedImage = response.generatedImages[0]
    const imageBytes = generatedImage.image?.imageBytes

    if (!imageBytes) {
      console.error('[Imagen] No image bytes in Imagen response')
      return NextResponse.json(
        { error: 'Failed to generate image' },
        { status: 500 }
      )
    }

    console.log('[Imagen] Image generated successfully with Imagen (text-only)')

    return NextResponse.json({
      image: {
        base64: imageBytes,
        mimeType: 'image/png',
      },
      prompt: prompt.slice(0, 500),
    })

  } catch (err) {
    console.error('[Imagen] Generation error:', err)

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
