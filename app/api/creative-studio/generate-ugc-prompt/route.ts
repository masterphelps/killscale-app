import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'
import type { UGCSettings } from '@/lib/video-prompt-templates'

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
    const productContext = [
      `Name: ${product.name}`,
      product.description ? `Description: ${product.description}` : null,
      product.features?.length ? `Key Features:\n${product.features.map(f => `- ${f}`).join('\n')}` : null,
      product.benefits?.length ? `Customer Benefits:\n${product.benefits.map(b => `- ${b}`).join('\n')}` : null,
      product.painPoints?.length ? `Problems it Solves:\n${product.painPoints.map(p => `- ${p}`).join('\n')}` : null,
      product.testimonialPoints?.length ? `What Customers Say:\n${product.testimonialPoints.map(t => `- "${t}"`).join('\n')}` : null,
      product.keyMessages?.length ? `Key Ad Messages:\n${product.keyMessages.map(m => `- ${m}`).join('\n')}` : null,
      product.targetAudience ? `Target Audience: ${product.targetAudience}` : null,
      product.category ? `Category: ${product.category}` : null,
      product.uniqueSellingPoint ? `Unique Selling Point: ${product.uniqueSellingPoint}` : null,
    ].filter(Boolean).join('\n\n')

    // Map age range to natural description
    const ageDesc: Record<string, string> = {
      'young-adult': '18-25 years old',
      'adult': '25-40 years old',
      'middle-aged': '40-55 years old',
    }

    const prompt = `You are a UGC video ad director. Create a detailed video generation prompt for a vertical (9:16) product testimonial video.

PRODUCT:
${productContext}

PRESENTER:
- Gender: ${ugcSettings.gender}
- Age: ${ageDesc[ugcSettings.ageRange] || ugcSettings.ageRange}
- Delivery tone: ${ugcSettings.tone}
- Clothing style: ${ugcSettings.clothing || 'Casual'}${ugcSettings.features?.length ? `\n- Appearance features: ${ugcSettings.features.join(', ')}` : ''}

SCENE:
- ${ugcSettings.scene}: ${ugcSettings.setting}
${ugcSettings.notes ? `- Additional direction: ${ugcSettings.notes}` : ''}

RULES:
1. The product shown in the reference image is the HERO. It must NOT be altered, distorted, resized, or changed in ANY way.
2. The presenter holds, uses, or gestures toward the product naturally.
3. Write the dialogue AS LONG AS IT NEEDS TO BE to tell a compelling, natural-feeling testimonial. Don't rush it. A real person wouldn't cram everything into 8 seconds.
4. The dialogue must weave in real product benefits/features naturally — NOT read like an ad script. It should feel like a real person sharing their genuine experience.
5. Camera: Front-facing, slight movement (not static), natural selfie-style framing.
6. Lighting should match the ${ugcSettings.scene} ${ugcSettings.setting} environment realistically.
7. The person should look directly at the camera with ${ugcSettings.tone} energy.

DURATION ESTIMATION:
After writing the dialogue, estimate how many seconds it would take to speak it naturally (roughly 2.5 words per second, plus pauses for product demos, gestures, and reactions). Return this as "estimatedSeconds".

VIDEO SEGMENTATION:
The video engine generates an 8-second base clip, but the FIRST ~1 SECOND is a still product image (no presenter, no speech) and the LAST ~1 SECOND fades/transitions out. So the first segment only has ~6 USABLE SECONDS for dialogue and action. Extensions are 7 seconds each but only ~6 seconds are usable for speech (transitions eat ~1 second). Valid total durations are 8, 15, 22, 29, 36 seconds.

IMPORTANT: Budget your dialogue so the first segment's speech fits in ~6 seconds (not 7 or 8). Leave breathing room — it is MUCH better to have the speaker finish 0.5s early than to have the last word cut off. The presenter appears after the product intro shot.

If your estimated duration is 8 seconds or less:
- Write a single prompt covering the full video.
- Do NOT include "extensionPrompts".
- Remember: only ~6 seconds of actual dialogue time in this segment. That means ~15 words MAX.

If your estimated duration is more than 8 seconds:
- The "prompt" field must cover ONLY the first 8 seconds (but only ~6s of dialogue since the first second is the product image and last second transitions).
- Include an "extensionPrompts" array with one prompt per 7-second extension segment.
- Each extension prompt MUST start with "Continue from previous shot." and lock the visual context (same presenter, wardrobe, lighting, setting).
- Each extension describes ONLY what happens in that 7-second segment (~6s usable for speech, ~15 words max per extension).
- The number of extension prompts should match: ceil((estimatedSeconds - 8) / 7).

PRODUCT VISIBILITY RULE (CRITICAL — prevents AI video mutation):
- The product may ONLY appear on screen during the FIRST segment (the base 8s clip).
- From the 1ST EXTENSION ONWARD, the product must NOT be in the shot at all. The presenter should have set it down, put it aside, or naturally moved on. These segments show ONLY the presenter talking to camera — no product in hands, on table in foreground, or visible in frame.
- Script the dialogue so product demos/holding happen in the first 8 seconds only, and all extension segments are the presenter speaking about results, reactions, or recommendations without needing the physical product.
- Extension prompts for segment 2+ must explicitly state: "The product is no longer visible in frame. The presenter speaks directly to camera."

OUTPUT FORMAT (JSON):
{
  "prompt": "Veo video prompt using block headers: [Scene], [Subject], [Action], [Product Preservation], [Mood & Atmosphere], [Technical], [Dialogue]. Detailed and specific.",
  "dialogue": "The FULL dialogue for the entire video (all segments combined)",
  "sceneSummary": "One-line description for UI display",
  "estimatedSeconds": 15,
  "overlay": {
    "hook": "Short punchy hook text for first 2 seconds — MAX 6 words. e.g. 'This Changed Everything'",
    "cta": "Call-to-action button text (e.g. 'Shop Now')"
  },
  "adCopy": {
    "primaryText": "Facebook ad primary text (2-3 sentences, benefit-led, conversational tone matching the testimonial)",
    "headline": "Short punchy headline (5-8 words)",
    "description": "Link description (1 sentence)"
  },
  "extensionPrompts": ["Only if estimatedSeconds > 8. One prompt per 7-second extension."]
}

PROMPT BLOCK GUIDELINES:
- [Scene]: Describe the ${ugcSettings.setting} environment in detail — lighting, time of day, atmosphere, background.
- [Subject]: Describe the ${ugcSettings.gender} presenter — age (${ageDesc[ugcSettings.ageRange]}), wearing ${ugcSettings.clothing || 'casual'} clothing${ugcSettings.features?.length ? `, with ${ugcSettings.features.join(', ').toLowerCase()}` : ''}. Energy and demeanor.
- [Action]: Beat-by-beat description of what happens in this segment.
- [Product Preservation]: "The product from the reference image must remain completely unchanged — same shape, colors, text, and proportions."
- [Mood & Atmosphere]: ${ugcSettings.tone} tone — lighting, color grade, energy feel.
- [Technical]: "Vertical 9:16 portrait. Natural UGC aesthetic. Selfie-style camera with subtle movement."
- [Dialogue]: Format as Speaker: "line" for each sentence. Only include dialogue for THIS segment.

Respond ONLY with the JSON object, no other text.`

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
