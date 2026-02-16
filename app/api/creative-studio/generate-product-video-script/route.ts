import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'

// Veo constraints
const VEO_BASE_DURATION = 8
const VEO_EXTENSION_STEP = 7

/** Snap a raw duration to the nearest valid Veo duration (8, 15, 22, 29, ...) */
function snapToVeoDuration(rawSeconds: number): number {
  if (rawSeconds <= VEO_BASE_DURATION) return VEO_BASE_DURATION
  const extensions = Math.round((rawSeconds - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
  return VEO_BASE_DURATION + extensions * VEO_EXTENSION_STEP
}

export async function POST(request: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const body = await request.json()
    const { product, description, durationSeconds, hasProductImage } = body as {
      product: ProductKnowledge
      description: string
      durationSeconds: number
      hasProductImage: boolean
    }

    if (!product?.name) {
      return NextResponse.json(
        { error: 'Missing required field: product.name' },
        { status: 400 }
      )
    }

    if (!description?.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: description' },
        { status: 400 }
      )
    }

    // Build product context block
    const productContext = [
      `Name: ${product.name}`,
      product.description ? `Description: ${product.description}` : null,
      product.features?.length ? `Key Features:\n${product.features.map(f => `- ${f}`).join('\n')}` : null,
      product.benefits?.length ? `Customer Benefits:\n${product.benefits.map(b => `- ${b}`).join('\n')}` : null,
      product.painPoints?.length ? `Problems it Solves:\n${product.painPoints.map(p => `- ${p}`).join('\n')}` : null,
      product.keyMessages?.length ? `Key Ad Messages:\n${product.keyMessages.map(m => `- ${m}`).join('\n')}` : null,
      product.uniqueSellingPoint ? `Unique Selling Point: ${product.uniqueSellingPoint}` : null,
      product.targetAudience ? `Target Audience: ${product.targetAudience}` : null,
      product.category ? `Category: ${product.category}` : null,
    ].filter(Boolean).join('\n\n')

    // Snap user's requested duration to Veo increments
    const targetDuration = snapToVeoDuration(durationSeconds || 8)
    const numExtensions = targetDuration > VEO_BASE_DURATION
      ? Math.round((targetDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
      : 0

    const prompt = `You are a product video ad director. The user has described what they want their video to look like. Your job is to translate their vision into precise, production-ready Veo AI video generation prompts.

PRODUCT:
${productContext}

USER'S VISION:
"${description.trim()}"

TARGET DURATION: ${targetDuration} seconds (${numExtensions === 0 ? 'single 8s clip' : `8s base + ${numExtensions} x 7s extension${numExtensions > 1 ? 's' : ''}`})

${hasProductImage ? 'PRODUCT IMAGE: A reference product image will be provided as the starting frame. The first ~1 second shows the product as a still image before motion begins.' : 'NO PRODUCT IMAGE: The video will be generated from text only.'}

VEO AI RULES (you MUST follow these):
1. ONE subject per prompt — never ask for two things happening at once
2. ONE camera movement per prompt (orbit, dolly, crane, push-in, pull-back, etc.)
3. Atmospheric over narrative — Veo excels at mood, lighting, texture, and slow reveals
4. No cause-and-effect sequences (e.g. "pours water then drinks" will fail)
5. No text rendering — Veo cannot render text. Never include text in the video prompt. Text overlays are added in post-production.
6. No logos — Veo cannot render logos. The product image handles branding.
7. Describe in present continuous tense: "The camera slowly orbits..." not "The camera will orbit..."
8. Be extremely specific about lighting, atmosphere, and color temperature
9. Each prompt should be 300-800 characters

VIDEO SEGMENTATION:
- The "videoPrompt" covers the FIRST 8 seconds. The first ~1 second is the product image (still), so you have ~7 seconds of actual motion.
${numExtensions > 0 ? `- Include exactly ${numExtensions} extension prompt(s), each covering 7 seconds of continuation.
- Each extension prompt MUST start with "Continue from previous shot." and maintain visual continuity.
- Build a visual arc across segments — each extension should evolve the scene (new angle, new lighting, new detail reveal).` : '- No extension prompts needed for this duration.'}

OUTPUT FORMAT (respond with ONLY this JSON, no other text):
{
  "videoPrompt": "The main Veo prompt for the first 8 seconds. Uses block headers: [Scene], [Subject], [Action], [Product Preservation], [Mood & Atmosphere], [Technical]. Cinematic, detailed, specific.",
  ${numExtensions > 0 ? `"extensionPrompts": ["One prompt per 7-second extension. Each starts with 'Continue from previous shot.' and maintains visual continuity."],` : ''}
  "scene": "One-line summary of the environment/setting for the Director's Review UI",
  "mood": "One-line summary of the color/tone/feeling for the Director's Review UI",
  "estimatedDuration": ${targetDuration},
  "overlay": {
    "hook": "Short punchy hook text (MAX 6 words) for the first 2 seconds — e.g. 'See the Difference'",
    "cta": "Call-to-action button text — e.g. 'Shop Now'"
  }
}

PROMPT BLOCK GUIDELINES:
- [Scene]: Environment, lighting setup, atmosphere, background elements. Be specific about light direction, color temperature, and volumetric effects.
- [Subject]: The product — describe its physical form referencing the image if provided. No people unless the user specifically asked for them.
- [Action]: ONE camera movement + ONE product motion. Beat-by-beat within the segment. Describe timing relative to the segment.
${hasProductImage ? '- [Product Preservation]: "The product from the reference image must remain completely unchanged — same shape, colors, text, and proportions. Never alter, morph, or distort the product."' : ''}
- [Mood & Atmosphere]: Color grade, energy, sound design feel, emotional tone.
- [Technical]: "Vertical 9:16 portrait (1024x1792). Professional ad quality. Cinematic lighting." Include pacing note.

IMPORTANT: Translate the user's casual description into cinematic, specific Veo language. If they say "floating in space", describe the exact lighting, particle effects, camera movement, and atmosphere that would create that look. If they say "rotating", specify the rotation speed, direction, and what the light does as it rotates.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        console.error('[ProductVideoScript] Failed to parse response:', content)
        return NextResponse.json({ error: 'Failed to parse script response' }, { status: 500 })
      }
    }

    if (!parsed.videoPrompt) {
      console.error('[ProductVideoScript] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid script response — missing videoPrompt' }, { status: 500 })
    }

    // Validate extension prompts
    const extensionPrompts: string[] | undefined = numExtensions > 0 && Array.isArray(parsed.extensionPrompts)
      ? parsed.extensionPrompts.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
      : undefined

    console.log(`[ProductVideoScript] Target ${targetDuration}s, ${extensionPrompts?.length || 0} extension(s), videoPrompt: ${parsed.videoPrompt.length} chars`)

    // Extract overlay
    const overlay = parsed.overlay && typeof parsed.overlay === 'object'
      ? {
          hook: typeof parsed.overlay.hook === 'string' ? parsed.overlay.hook : '',
          cta: typeof parsed.overlay.cta === 'string' ? parsed.overlay.cta : 'Shop Now',
        }
      : undefined

    return NextResponse.json({
      videoPrompt: parsed.videoPrompt,
      extensionPrompts,
      scene: typeof parsed.scene === 'string' ? parsed.scene : '',
      mood: typeof parsed.mood === 'string' ? parsed.mood : '',
      estimatedDuration: targetDuration,
      overlay,
    })

  } catch (err) {
    console.error('[ProductVideoScript] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Product video script generation failed' },
      { status: 500 }
    )
  }
}
