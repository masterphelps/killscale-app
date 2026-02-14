import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product, count = 4, existingConcepts = [] } = body as {
      product: ProductKnowledge
      count?: number
      existingConcepts?: Array<{ angle?: string; script?: { scene?: string } }>
    }

    if (!product?.name) {
      return NextResponse.json(
        { error: 'Missing required field: product.name' },
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
      product.motionOpportunities?.length ? `Motion Opportunities:\n${product.motionOpportunities.map(m => `- ${m}`).join('\n')}` : null,
      product.sensoryDetails?.length ? `Sensory Details:\n${product.sensoryDetails.map(s => `- ${s}`).join('\n')}` : null,
      product.visualHooks?.length ? `Visual Hooks:\n${product.visualHooks.map(v => `- ${v}`).join('\n')}` : null,
      product.targetAudience ? `Target Audience: ${product.targetAudience}` : null,
      product.category ? `Category: ${product.category}` : null,
      product.uniqueSellingPoint ? `Unique Selling Point: ${product.uniqueSellingPoint}` : null,
    ].filter(Boolean).join('\n\n')

    // For incremental generation ("Add Concept" → "AI Generate"), summarize existing concepts
    const existingConceptSummaries: string[] = []
    if (existingConcepts.length > 0) {
      for (const ec of existingConcepts) {
        const parts = [ec.angle, ec.script?.scene?.substring(0, 80)].filter(Boolean)
        if (parts.length) existingConceptSummaries.push(parts.join(' — '))
      }
    }

    // Random creative direction seed — forces the model into different territory each generation
    const directionSeeds = [
      'Start from subcultures and niche hobbies nobody expects in an ad.',
      'Start from oddly satisfying phenomena — textures, processes, transformations.',
      'Start from specific professions and the private moments nobody sees.',
      'Start from childhood memories and playground physics.',
      'Start from food, cooking, and kitchen chaos.',
      'Start from urban environments at unusual hours.',
      'Start from nature at microscopic or cosmic scale.',
      'Start from sports, competition, and physical momentum.',
      'Start from craftsmanship, workshops, and making things by hand.',
      'Start from weather, seasons, and atmospheric phenomena.',
      'Start from music, rhythm, and sound made visible.',
      'Start from architecture, geometry, and impossible spaces.',
      'Start from gaming culture, speedruns, and glitch aesthetics.',
      'Start from vintage technology, analog processes, and retro machines.',
      'Start from water — pressure, flow, surface tension, underwater worlds.',
      'Start from nightlife, neon, and after-hours energy.',
    ]
    const seed = directionSeeds[Math.floor(Math.random() * directionSeeds.length)]

    const prompt = `We need ${count} scroll-stopping short-form video ad concept${count === 1 ? '' : 's'} (8-15 seconds each) for this product.

PRODUCT:
${productContext}
${existingConceptSummaries.length > 0 ? `\nALREADY GENERATED CONCEPTS — do NOT repeat similar visuals, worlds, or angles:\n${existingConceptSummaries.map(s => `  - ${s}`).join('\n')}` : ''}

CREATIVE DIRECTION SEED: ${seed}
Use this as your starting point for brainstorming, then go deeper and weirder. Each concept should explore a completely different visual world from the others.

THE APPROACH:
- The product NEVER appears on screen. Each ad is a pure visual metaphor. Text overlays (added in post) connect the metaphor to the product.
- You decide the best angles organically — problem/solution, emotional benefit, feature spotlight, social proof, transformation, curiosity, whatever serves each concept best.
- Every concept must feel like it came from a different creative team. Different environment, subject, mood, color palette, energy.

WHAT MAKES A GREAT CONCEPT:
- SPECIFICITY over beauty. "A 3am kitchen where someone is rage-baking a cake" beats "a beautiful landscape." Specific = memorable. Pretty = forgettable.
- INTERNET-NATIVE energy. These compete with memes, fails, and drama on the feed. Pattern-interrupt or die.
- The metaphor must CLICK INSTANTLY when paired with the overlay text. No explanation needed.
- Think TikTok creator with a $50K budget, not luxury brand strategist.

CONTENT SAFETY (AI video generation rejects these):
- No violence, weapons, aggression, sharp objects near faces/bodies
- No people in distress, pain, or vulnerable states
- No dramatic physical transformations of PEOPLE (objects/nature transforming is fine)
- No nudity, suggestive content, real brand names/logos

Return JSON:
{ "concepts": [
  {
    "title": "2-4 word concept name",
    "angle": "What advertising angle this concept uses (e.g. Problem→Solution, Emotional Benefit, Feature Spotlight, Social Proof, Curiosity Hook, Transformation, etc.)",
    "logline": "1 sentence creative pitch",
    "visualMetaphor": "What product benefit this represents and WHY the visual communicates it",
    "whyItWorks": "Why someone would stop scrolling — what makes this unexpected?",
    "script": {
      "scene": "Environment, lighting, atmosphere — hyper-specific. Time of day, temperature, what the air looks like.",
      "subject": "Who/what is in the shot — physical description, textures, colors",
      "action": "Beat-by-beat with CUTS (3-5 quick beats). Beat 1 (hook, 0-2s): ... Cut to Beat 2: ... Jump cut Beat 3: ... Cut to Beat 4 (payoff): ...",
      "mood": "Color grade, energy, sound design, emotional tone"
    },
    "overlay": {
      "hook": "Opening text (first 2 seconds) — short, punchy, makes you keep watching",
      "captions": ["caption for beat 1", "caption for beat 2", "caption for beat 3 — land the product connection"],
      "cta": "Call-to-action button text"
    },
    "videoPrompt": "Detailed prompt for AI video generation (500-1500 chars). Motion-first: describe forces, physics, momentum. Use camera terms (dolly, rack focus, orbit, crane, whip pan, macro). Structure as first→then→finally with 2-3 beats. Sensory language — texture, weight, temperature. Describe only what SHOULD happen (never 'no X' or 'avoid Y'). Specific lighting (direction, color temp). No product, no text overlays, no faces — visual metaphor only.",
    "adCopy": {
      "primaryText": "Facebook post body text (2-3 sentences). Speak to the target audience's pain point or desire. End with a clear benefit statement.",
      "headline": "Short punchy ad headline (5-8 words). Benefit-driven, creates curiosity.",
      "description": "Link description (1 sentence). Reinforces the offer or social proof."
    }
  }
]}

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
      temperature: 1.0,
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

    // Validate each concept has required fields
    const validConcepts = parsed.concepts.filter((c: Record<string, unknown>) =>
      c.title && c.logline && c.script && c.overlay
    )

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
