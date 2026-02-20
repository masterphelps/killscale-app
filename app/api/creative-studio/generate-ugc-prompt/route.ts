import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'
import type { UGCSettings } from '@/lib/video-prompt-templates'
import { buildUGCPrompt, snapToVeoDuration, VEO_BASE_DURATION, VEO_EXTENSION_STEP } from '@/lib/prompts/video-ugc'
import { buildProductContextBlock } from '@/lib/prompts/video-concepts'

export async function POST(request: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const body = await request.json()
    const { product, ugcSettings } = body as {
      product: ProductKnowledge
      ugcSettings: UGCSettings
    }

    if (!product?.name) {
      return NextResponse.json(
        { error: 'Missing required field: product.name' },
        { status: 400 }
      )
    }

    if (!ugcSettings?.gender || !ugcSettings?.tone || !ugcSettings?.scene || !ugcSettings?.setting) {
      return NextResponse.json(
        { error: 'Missing required UGC settings' },
        { status: 400 }
      )
    }

    // Build product context block
    const productContext = buildProductContextBlock(product)

    // Map age range to natural description
    const ageDesc: Record<string, string> = {
      'young-adult': '18-25 years old',
      'adult': '25-40 years old',
      'middle-aged': '40-55 years old',
    }

    const prompt = buildUGCPrompt({
      productContext,
      gender: ugcSettings.gender,
      ageDesc: ageDesc[ugcSettings.ageRange] || ugcSettings.ageRange,
      tone: ugcSettings.tone,
      clothing: ugcSettings.clothing || 'Casual',
      features: ugcSettings.features,
      scene: ugcSettings.scene,
      setting: ugcSettings.setting,
      notes: ugcSettings.notes,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9,
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
        console.error('[UGCPrompt] Failed to parse response:', content)
        return NextResponse.json({ error: 'Failed to parse UGC prompt response' }, { status: 500 })
      }
    }

    if (!parsed.prompt || !parsed.dialogue) {
      console.error('[UGCPrompt] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid UGC prompt response' }, { status: 500 })
    }

    // Snap GPT's estimated duration to a valid Veo duration
    const rawEstimate = typeof parsed.estimatedSeconds === 'number' ? parsed.estimatedSeconds : 8
    const veoDuration = snapToVeoDuration(rawEstimate)
    const numExtensions = veoDuration > VEO_BASE_DURATION
      ? Math.round((veoDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
      : 0

    // Validate extension prompts
    const extensionPrompts: string[] | undefined = numExtensions > 0 && Array.isArray(parsed.extensionPrompts)
      ? parsed.extensionPrompts.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
      : undefined

    console.log(`[UGCPrompt] GPT estimated ${rawEstimate}s → snapped to ${veoDuration}s (${numExtensions} extension(s)), dialogue: ${parsed.dialogue.split(' ').length} words, ${extensionPrompts?.length || 0} extension prompt(s)`)

    // Extract overlay data (hook + CTA only — captions come from Whisper transcription in the RVE)
    const overlay = parsed.overlay && typeof parsed.overlay === 'object'
      ? {
          hook: typeof parsed.overlay.hook === 'string' ? parsed.overlay.hook : '',
          cta: typeof parsed.overlay.cta === 'string' ? parsed.overlay.cta : 'Shop Now',
        }
      : undefined

    // Extract ad copy for Meta ads
    const adCopy = parsed.adCopy && typeof parsed.adCopy === 'object'
      ? {
          primaryText: typeof parsed.adCopy.primaryText === 'string' ? parsed.adCopy.primaryText : '',
          headline: typeof parsed.adCopy.headline === 'string' ? parsed.adCopy.headline : '',
          description: typeof parsed.adCopy.description === 'string' ? parsed.adCopy.description : '',
        }
      : undefined

    return NextResponse.json({
      prompt: parsed.prompt,
      dialogue: parsed.dialogue,
      sceneSummary: parsed.sceneSummary || '',
      estimatedDuration: veoDuration,
      extensionPrompts,
      overlay,
      adCopy,
    })

  } catch (err) {
    console.error('[UGCPrompt] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'UGC prompt generation failed' },
      { status: 500 }
    )
  }
}
