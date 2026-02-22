import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'
import { buildConceptGenerationPrompt } from '@/lib/prompts/video-concepts'
import { snapToVeoDuration, VEO_BASE_DURATION, VEO_EXTENSION_STEP } from '@/lib/prompts/video-ugc'

export async function POST(request: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const body = await request.json()
    const { product, count = 4, existingConcepts = [], directionPrompt, style = 'cinematic', includeProductImage = true } = body as {
      product: ProductKnowledge
      count?: number
      existingConcepts?: Array<{ angle?: string; script?: { scene?: string } }>
      directionPrompt?: string
      style?: 'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll'
      includeProductImage?: boolean
    }

    if (!product?.name) {
      return NextResponse.json(
        { error: 'Missing required field: product.name' },
        { status: 400 }
      )
    }

    const prompt = buildConceptGenerationPrompt({ product, count, existingConcepts, directionPrompt, style, includeProductImage })

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      // Fallback: try extracting JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        console.error('[AdConcepts] Failed to parse response:', content)
        return NextResponse.json({ error: 'Failed to parse concept response' }, { status: 500 })
      }
    }

    // Validate structure
    if (!parsed.concepts || !Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
      console.error('[AdConcepts] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid concept response structure' }, { status: 500 })
    }

    // Validate each concept has required fields + snap durations
    const validConcepts = parsed.concepts
      .filter((c: Record<string, unknown>) => c.title && c.logline && c.script && c.overlay)
      .map((c: any) => {
        // Snap estimated duration to valid Veo increment
        const rawEstimate = typeof c.estimatedSeconds === 'number' ? c.estimatedSeconds : 8
        const veoDuration = snapToVeoDuration(rawEstimate)
        const numExtensions = veoDuration > VEO_BASE_DURATION
          ? Math.round((veoDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
          : 0

        // Validate extension prompts
        const extensionPrompts: string[] | undefined = numExtensions > 0 && Array.isArray(c.extensionPrompts)
          ? c.extensionPrompts.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
          : undefined

        console.log(`[AdConcepts] "${c.title}" — GPT estimated ${rawEstimate}s → snapped to ${veoDuration}s (${numExtensions} ext, ${extensionPrompts?.length || 0} prompts)`)

        return {
          ...c,
          estimatedDuration: veoDuration,
          extensionPrompts,
          estimatedSeconds: undefined, // Clean up raw field
        }
      })

    if (validConcepts.length === 0) {
      return NextResponse.json({ error: 'No valid concepts generated' }, { status: 500 })
    }

    return NextResponse.json({ concepts: validConcepts })

  } catch (err) {
    console.error('[AdConcepts] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Concept generation failed' },
      { status: 500 }
    )
  }
}
