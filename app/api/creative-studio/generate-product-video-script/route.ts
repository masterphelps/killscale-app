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

    const prompt = `You are a video segmentation assistant for Google Veo. The user described how they want their product video to look. Your ONLY job is:
1. Split their description into time segments (first 8 seconds + 7-second extensions)
2. Generate overlay text and scene/mood summaries

CRITICAL RULE — PRESERVE THE USER'S WORDS:
Do NOT rewrite, embellish, or "improve" the user's description. Veo works best with direct, casual prompts.
Your job is ONLY to split the description into time segments. Keep the user's exact words, tone, and style.
If it fits in 8 seconds, pass it through UNCHANGED as the videoPrompt.
If it needs extensions, split at natural breakpoints.

PRODUCT:
${productContext}

USER'S VISION:
"${description.trim()}"

TARGET DURATION: ${targetDuration} seconds (${numExtensions === 0 ? 'single 8s clip' : `8s base + ${numExtensions} x 7s extension${numExtensions > 1 ? 's' : ''}`})

${hasProductImage ? 'PRODUCT IMAGE: A reference product image will be provided as the starting frame. The first ~1 second shows the image as a still before motion begins.' : 'NO PRODUCT IMAGE: The video will be generated from text only.'}

SEGMENTATION RULES:
- "videoPrompt" = user's description for the FIRST 8 seconds${hasProductImage ? ' (first ~1s is product image still)' : ''}
${numExtensions > 0 ? `- Split remaining description into exactly ${numExtensions} extension prompt(s) (7s each)
- Each extension starts with "Continue from previous shot." then the user's words for that segment
- Split at natural scene breaks` : '- No extension prompts needed for this duration.'}
- Do NOT add cinematic flourishes, lighting descriptions, or camera directions the user didn't ask for
- Do NOT remove anything the user wrote
- Only addition allowed: "Vertical 9:16 portrait format." at the end of videoPrompt if not mentioned
${hasProductImage ? '- The product from the reference image must remain unchanged throughout' : ''}

VEO LIMITATIONS (silently work around these):
- Veo cannot render text/words in video — move any requested text to overlay.hook
- Veo cannot render logos
- If user describes cause-and-effect in one segment, split across segments

OUTPUT FORMAT (respond with ONLY this JSON):
{
  "videoPrompt": "The user's description for the first 8 seconds — their words, their style.",
  ${numExtensions > 0 ? `"extensionPrompts": ["Continue from previous shot. [user's words for next 7s]"],` : ''}
  "scene": "One-line setting summary",
  "mood": "One-line tone summary",
  "estimatedDuration": ${targetDuration},
  "overlay": {
    "hook": "Short hook text (MAX 6 words)",
    "cta": "CTA button text — e.g. 'Shop Now'"
  }
}`

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
