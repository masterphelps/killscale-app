import type { ProductKnowledge } from '@/lib/video-prompt-templates'

// ---------------------------------------------------------------------------
// Style guides — one per video style the user can select
// ---------------------------------------------------------------------------

export const CONCEPT_STYLE_GUIDES: Record<
  'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll',
  { description: string; examples: string; tone: string }
> = {
  cinematic: {
    description:
      'Breathtaking nature cinematography and atmospheric landscapes. The kind of footage that stops a scroll because it is genuinely beautiful. Think drone reveals, golden hour, macro nature, slow-motion natural elements.',
    examples: `Examples of GOOD cinematic visual worlds:
   - Aerial drone slowly revealing a vast mountain lake at sunrise, mist lifting off the water (clarity/revelation)
   - Macro of frost crystals on a leaf, backlit by golden hour light (precision/transformation)
   - Ocean wave cresting in slow motion, sunlight refracting through the translucent curl (momentum/power)
   - Slow push through a fog-draped valley at dawn, shafts of light breaking through the canopy (breakthrough/possibility)
   - A single tree standing in an open field, wind rippling through tall grass at golden hour (resilience/calm)`,
    tone: 'Majestic, awe-inspiring, premium. Color grading should feel cinematic \u2014 rich, warm, or dramatically cool. The video should feel like a nature documentary opening shot.',
  },
  playful: {
    description:
      'Colorful, eye-catching scenarios that stop the scroll because they pop. Think bright objects on clean surfaces, food and drink in motion, confetti and balloons, saturated color contrasts. The viewer watches because it is visually fun and shareable.',
    examples: `Examples of GOOD playful visual worlds:
   - A bright orange being squeezed in slow motion, juice droplets splashing on a clean white surface (freshness/energy)
   - Colorful balloons drifting against a deep blue sky, sunlight catching the translucent surfaces (lightness/joy)
   - A row of gumballs rolling down a curved track one by one, each a different vibrant color (variety/choice)
   - Confetti bursting upward in slow motion against a black background, catching golden light (celebration/reward)
   - A stack of macarons on a marble surface, camera slowly orbiting, pastel colors glowing (premium/delight)`,
    tone: 'Lighthearted, vibrant, smile-inducing. Saturated color palette, bright clean lighting. The video should make someone pause and want to share it. Bold colors and simple compositions \u2014 one subject, one surface, maximum visual pop.',
  },
  conceptual: {
    description:
      'Visual metaphors with a satisfying "aha" moment. The viewer sees something symbolic happen, reads the overlay text, and gets it instantly. Think natural transformations, light and shadow, ink and water \u2014 processes that map to a customer benefit.',
    examples: `Examples of GOOD conceptual visual worlds:
   - Ink slowly blooming in clear water, tendrils of color spreading outward (growth/expansion)
   - White light passing through a glass prism, splitting into a rainbow spectrum on a dark surface (clarity/understanding)
   - A match being struck in complete darkness, the flame illuminating a single object (discovery/insight)
   - Fog lifting off a still lake at sunrise, the water surface becoming mirror-clear (clarity/revealing truth)
   - A compass needle slowly settling to point north on a wooden map table (direction/finding your way)`,
    tone: 'Clean, intentional, satisfying. The visual should feel deliberate \u2014 every element serves the metaphor. Neutral or minimal backgrounds so the symbolic action is the focus. The "aha" moment when paired with overlay text is what makes this style work.',
  },
  satisfying: {
    description:
      'Oddly satisfying, ASMR-energy footage that people physically cannot scroll past. Think smooth textures, pouring, dripping, spreading, symmetry. The viewer watches because it FEELS good.',
    examples: `Examples of GOOD satisfying visual worlds:
   - Thick paint being poured and slowly spreading into a perfect circle on a flat surface (coverage/completeness)
   - Espresso pouring into a white cup in slow motion, crema forming a perfect golden layer (ritual/precision)
   - Water beading and rolling off a hydrophobic surface in slow motion (effortless/protection)
   - A perfectly symmetrical pour of honey spiraling off a dipper in golden light (flow/smoothness)
   - Rain droplets hitting the surface of a still pond, concentric ripples expanding outward (impact/reach)`,
    tone: 'Mesmerizing, tactile, ASMR. Close-up framing, macro lenses, crisp audio-visual detail. Slow, deliberate movement. The viewer should almost feel the texture. Warm or neutral lighting that makes materials look premium.',
  },
  broll: {
    description:
      "Authentic, documentary-style footage from the product's world. Real environments, real textures, real moments that feel like behind-the-scenes content. Think workshop hands, morning routines, city energy, craft close-ups. Feels real, not produced.",
    examples: `Examples of GOOD b-roll visual worlds:
   - Morning light streaming through a workshop window, sawdust floating in the air, tools neatly arranged (craft/expertise)
   - A busy coffee shop counter from above \u2014 hands reaching, cups sliding, steam rising (energy/momentum)
   - Close-up of weathered hands turning the pages of a well-used notebook (experience/knowledge)
   - Rain hitting a city street at night, neon reflections stretching across wet pavement (urban/dynamic)
   - A farmer's market at golden hour \u2014 textures of fruit, hands exchanging produce, dappled light (authentic/natural)`,
    tone: 'Raw, authentic, warm. Natural lighting, handheld feel (but stable \u2014 AI generates stable footage). Earth tones, grain, the "Instagram documentary" aesthetic. The video should feel like a real moment captured, not staged.',
  },
}

// ---------------------------------------------------------------------------
// Shared helper — builds the product context block from ProductKnowledge
// ---------------------------------------------------------------------------

export function buildProductContextBlock(product: ProductKnowledge): string {
  return [
    `Name: ${product.name}`,
    product.description ? `Description: ${product.description}` : null,
    product.features?.length
      ? `Key Features:\n${product.features.map((f) => `- ${f}`).join('\n')}`
      : null,
    product.benefits?.length
      ? `Customer Benefits:\n${product.benefits.map((b) => `- ${b}`).join('\n')}`
      : null,
    product.painPoints?.length
      ? `Problems it Solves:\n${product.painPoints.map((p) => `- ${p}`).join('\n')}`
      : null,
    product.testimonialPoints?.length
      ? `What Customers Say:\n${product.testimonialPoints.map((t) => `- "${t}"`).join('\n')}`
      : null,
    product.keyMessages?.length
      ? `Key Ad Messages:\n${product.keyMessages.map((m) => `- ${m}`).join('\n')}`
      : null,
    product.motionOpportunities?.length
      ? `Motion Opportunities:\n${product.motionOpportunities.map((m) => `- ${m}`).join('\n')}`
      : null,
    product.sensoryDetails?.length
      ? `Sensory Details:\n${product.sensoryDetails.map((s) => `- ${s}`).join('\n')}`
      : null,
    product.visualHooks?.length
      ? `Visual Hooks:\n${product.visualHooks.map((v) => `- ${v}`).join('\n')}`
      : null,
    product.targetAudience ? `Target Audience: ${product.targetAudience}` : null,
    product.category ? `Category: ${product.category}` : null,
    product.uniqueSellingPoint ? `Unique Selling Point: ${product.uniqueSellingPoint}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// Main prompt builder
// ---------------------------------------------------------------------------

export function buildConceptGenerationPrompt(params: {
  product: ProductKnowledge
  count?: number
  existingConcepts?: Array<{ angle?: string; script?: { scene?: string } }>
  directionPrompt?: string
  style?: 'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll'
  includeProductImage?: boolean
}): string {
  const {
    product,
    count = 4,
    existingConcepts = [],
    directionPrompt,
    style = 'cinematic',
    includeProductImage = true,
  } = params

  const productContext = buildProductContextBlock(product)

  // Anti-repetition block for incremental generation ("Add Concept" -> "AI Generate")
  let existingBlock = ''
  if (existingConcepts.length > 0) {
    const usedAngles: string[] = []
    const usedDomains: string[] = []
    for (const ec of existingConcepts) {
      if (ec.angle) usedAngles.push(ec.angle)
      if (ec.script?.scene) usedDomains.push(ec.script.scene.substring(0, 100))
    }
    existingBlock = `\nANTI-REPETITION \u2014 these angles and visual domains are already used. You MUST NOT reuse them or anything similar:
  Angles used: ${usedAngles.join(', ') || 'none'}
  Environments used: ${usedDomains.join(' | ') || 'none'}
  If the existing concepts used organic/nature imagery, the new ones must use engineered/human-made systems or vice versa. Force cross-domain jumps.`
  }

  const directionBlock = directionPrompt
    ? `CREATIVE DIRECTION (from the user \u2014 this is your PRIMARY constraint):\n"${directionPrompt}"\nBuild the concept around this direction. The visual metaphor, scene, and mood should all serve this specific creative vision.`
    : ''

  const styleGuide = CONCEPT_STYLE_GUIDES[style] || CONCEPT_STYLE_GUIDES.cinematic

  const productRule = includeProductImage
    ? `THE PRODUCT RULE:\n- The product CAN appear naturally in the scene (held by a person, on a surface, in context). It should feel organic, not forced. The video still leads with visual storytelling \u2014 the product enhances the scene, it doesn't dominate it.`
    : `THE PRODUCT RULE:\n- The product NEVER appears on screen. The video IS the visual metaphor. Text overlays (added in post) connect the visual to the product and close the sale.`

  return `You are a performance creative strategist making PAID ADS for Meta. Every concept must stop the scroll AND make people want to buy.

We need ${count} short-form video ad concept${count === 1 ? '' : 's'} for this product.

PRODUCT:
${productContext}
${existingBlock}
${directionBlock}

VIDEO STYLE: ${style.toUpperCase()}
${styleGuide.description}

${styleGuide.examples}

TONE & AESTHETIC: ${styleGuide.tone}

HOW TO GENERATE EACH CONCEPT:
1. Find the emotional core (customer frustration before \u2192 relief after) and pick a SINGLE VISUAL WORLD in the ${style.toUpperCase()} style that captures it. Use the examples above as inspiration but create original ideas for THIS product.
2. Plan the visual journey as segments. The video engine generates 8s base + 7s extensions. Each segment = ONE continuous camera move from a DIFFERENT angle. Same environment, different perspective \u2014 the seams create natural cuts. The overlay text does the selling; the video creates the emotion.

SEGMENT PACING (each segment = one continuous shot):
- Each segment: ONE fluid camera move (dolly, orbit, crane, push-in, pull-back)
- Each segment: a DIFFERENT angle/framing than the one before (wide \u2192 macro, orbit \u2192 static, above \u2192 eye-level)
- 8s = 1 segment. 15s = 2 segments. 22s = 3 segments.

CAPTION RULES (~2.5 words/second):
- Each caption = 2-4 words, lasts ~1.5-2s on screen
- Scale count: 3-4 for 8s, 6-8 for 15s, 10-12 for 22s, 14-16 for 29s+
- Narrative arc: hook \u2192 tension \u2192 solution \u2192 CTA payoff

${productRule}

DIVERSITY RULES \u2014 across all ${count} concepts:
- Each concept: DIFFERENT environment, DIFFERENT advertising angle, DIFFERENT emotion/mood.

CONTENT SAFETY:
- No violence, weapons, people in distress, nudity, real brand names/logos.

DURATION & SEGMENTATION:
Valid durations: 8, 15, 22, 29, 36 seconds. Estimate naturally and return as "estimatedSeconds".
- If \u22648s: "videoPrompt" covers full video. No extensionPrompts.
- If >8s: "videoPrompt" covers FIRST 8s only. Include "extensionPrompts" array (one per 7s extension). Each extension = different camera angle, same environment. Extensions = ceil((estimatedSeconds - 8) / 7).

Return JSON:
{ "concepts": [
  {
    "title": "2-4 word concept name",
    "angle": "Advertising angle (Problem\u2192Solution, Emotional Benefit, Feature Spotlight, Social Proof, Curiosity Hook, Transformation, etc.)",
    "logline": "1 sentence \u2014 what tension does this visualize and how does it sell?",
    "visualMetaphor": "Customer problem/desire \u2192 physical phenomenon mapping.",
    "whyItWorks": "Why this stops the scroll AND sells. Not 'it looks cool' \u2014 how does it drive purchase?",
    "estimatedSeconds": 15,
    "script": {
      "scene": "Environment, lighting, atmosphere \u2014 specific and grounded.",
      "subject": "Who/what is in the shot \u2014 physical description, textures, colors.",
      "action": "Full visual arc across ALL segments. Each segment = one camera move from a distinct angle.",
      "mood": "Color grade, energy, sound design, emotional tone"
    },
    "overlay": {
      "hook": "Opening text (first 2s) \u2014 short, punchy, makes you keep watching.",
      "captions": ["2-4 word caption per beat, scaled to duration"],
      "cta": "Call-to-action button text"
    },
    "videoPrompt": "150-350 chars. FIRST 8 SECONDS ONLY. One subject, one environment, one camera move. Use camera terms (dolly, orbit, crane, rack focus). Describe textures, light direction, color temperature. Positive descriptions only (never 'no X'). No text or logos.",
    "extensionPrompts": ["Only if estimatedSeconds > 8. 100-250 chars each. One camera move per extension, different angle than previous segment. Same environment, visual continuity."],
    "adCopy": {
      "primaryText": "Facebook post body (2-3 sentences). Pain point \u2192 benefit.",
      "headline": "Ad headline (5-8 words). Benefit-driven, curiosity.",
      "description": "Link description (1 sentence). Offer or social proof."
    }
  }
]}

Respond ONLY with the JSON object, no other text.`
}
