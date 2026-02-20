import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'
import { buildDirectConceptPrompt } from '@/lib/prompts/video-direct'
import { snapToVeoDuration, VEO_BASE_DURATION, VEO_EXTENSION_STEP } from '@/lib/prompts/video-direct'

export async function POST(request: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const body = await request.json()
    const { product, conceptPrompt, style } = body as {
      product: ProductKnowledge
      conceptPrompt: string
      style?: 'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll'
    }

    if (!product?.name) {
      return NextResponse.json(
        { error: 'Missing required field: product.name' },
        { status: 400 }
      )
    }

    if (!conceptPrompt?.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: conceptPrompt' },
        { status: 400 }
      )
    }

    const prompt = buildDirectConceptPrompt({ product, conceptPrompt, style })

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
        console.error('[DirectConcept] Failed to parse response:', content)
        return NextResponse.json({ error: 'Failed to parse concept response' }, { status: 500 })
      }
    }

    if (!parsed.videoPrompt) {
      console.error('[DirectConcept] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid concept response — missing videoPrompt' }, { status: 500 })
    }

    // Snap duration to valid Veo increments
    const estimatedDuration = snapToVeoDuration(parsed.estimatedDuration || VEO_BASE_DURATION)
    const numExtensions = estimatedDuration > VEO_BASE_DURATION
      ? Math.round((estimatedDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
      : 0

    // Validate extension prompts
    const extensionPrompts: string[] | undefined = numExtensions > 0 && Array.isArray(parsed.extensionPrompts)
      ? parsed.extensionPrompts.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
      : undefined

    console.log(`[DirectConcept] Duration ${estimatedDuration}s, ${extensionPrompts?.length || 0} extension(s), videoPrompt: ${parsed.videoPrompt.length} chars`)

    // Extract overlay
    const overlay = parsed.overlay && typeof parsed.overlay === 'object'
      ? {
          hook: typeof parsed.overlay.hook === 'string' ? parsed.overlay.hook : '',
          captions: Array.isArray(parsed.overlay.captions)
            ? parsed.overlay.captions.filter((c: unknown): c is string => typeof c === 'string')
            : [],
          cta: typeof parsed.overlay.cta === 'string' ? parsed.overlay.cta : 'Shop Now',
        }
      : { hook: '', captions: [], cta: 'Shop Now' }

    // Extract ad copy
    const adCopy = parsed.adCopy && typeof parsed.adCopy === 'object'
      ? {
          primaryText: typeof parsed.adCopy.primaryText === 'string' ? parsed.adCopy.primaryText : '',
          headline: typeof parsed.adCopy.headline === 'string' ? parsed.adCopy.headline : '',
          description: typeof parsed.adCopy.description === 'string' ? parsed.adCopy.description : '',
        }
      : undefined

    return NextResponse.json({
      videoPrompt: parsed.videoPrompt,
      extensionPrompts,
      scene: typeof parsed.scene === 'string' ? parsed.scene : '',
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      action: typeof parsed.action === 'string' ? parsed.action : '',
      mood: typeof parsed.mood === 'string' ? parsed.mood : '',
      estimatedDuration,
      overlay,
      adCopy,
    })

  } catch (err) {
    console.error('[DirectConcept] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Direct concept generation failed' },
      { status: 500 }
    )
  }
}
