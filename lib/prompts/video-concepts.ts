import type { ProductKnowledge } from '@/lib/video-prompt-templates'

// ---------------------------------------------------------------------------
// Style guides — one per video style the user can select
// ---------------------------------------------------------------------------

export const CONCEPT_STYLE_GUIDES: Record<
  'cinematic' | 'product' | 'macro' | 'conceptual' | 'documentary',
  { description: string; examples: string; tone: string }
> = {
  cinematic: {
    description:
      'Breathtaking nature cinematography and atmospheric landscapes. The kind of footage that stops a scroll because it is genuinely beautiful. Drone reveals, golden hour, slow-motion natural elements, volumetric fog, epic establishing shots.',
    examples: `Examples of GOOD cinematic visual worlds:
   - Aerial drone slowly revealing a vast mountain lake at sunrise, mist lifting off the water (clarity/revelation)
   - Ocean wave cresting in slow motion, sunlight refracting through the translucent curl (momentum/power)
   - Slow push through a fog-draped valley at dawn, volumetric light rays breaking through the canopy (breakthrough/possibility)
   - A single tree standing in an open field at golden hour, wind rippling through tall grass (resilience/calm)
   - Coastal cliff at dawn, waves crashing below, camera slowly pulling back to reveal the vast landscape (scale/ambition)`,
    tone: 'Majestic, awe-inspiring, premium. Rich cinematic color grading \u2014 warm golden tones or dramatically cool blues. The video should feel like a nature documentary opening shot.',
  },
  product: {
    description:
      'The product in its natural habitat \u2014 being used by a real person in a real environment. Morning routines, workspaces, kitchens, gyms, commutes. The product is the star but it\u2019s shown IN USE, not on a pedestal. Think Apple\u2019s "Shot on iPhone" energy \u2014 real life, beautifully captured.',
    examples: `Examples of GOOD product-in-use visual worlds:
   - Person running a beard brush through their beard in a warm bathroom mirror, morning light from a window, steam from a shower in the background (routine/ease)
   - Hands squeezing skincare serum onto fingertips at a vanity, applying to face, satisfied expression in the mirror (ritual/self-care)
   - Someone sliding wireless earbuds in while walking out the door, camera follows them into the street, city morning energy (seamless/lifestyle)
   - Close-up of someone pouring from a premium coffee bag into a pour-over, steam rising, kitchen counter, morning light (ritual/warmth)
   - Person pulling a cordless tool from a travel bag in a hotel room, using it confidently, checking the result in a mirror (convenience/confidence)`,
    tone: 'Warm, natural, aspirational but attainable. Real environments with beautiful natural or practical lighting. The product looks like it belongs in this person\u2019s life \u2014 not a prop, not a studio hero shot. Cinematic quality but documentary feel.',
  },
  macro: {
    description:
      'Extreme close-up detail shots with shallow depth of field. Textures, surfaces, materials, pours, and tactile moments. ASMR energy \u2014 the viewer watches because they can almost FEEL the texture. Think material studies and satisfying micro-moments.',
    examples: `Examples of GOOD macro visual worlds:
   - Espresso pouring into a white cup in slow motion, crema forming a golden layer on the surface (ritual/precision)
   - Water beading and rolling off a hydrophobic surface in slow motion, each droplet catching light (effortless/protection)
   - Honey spiraling off a dipper in golden backlight, thick and slow, landing in a pool below (flow/smoothness)
   - Rain droplets hitting the surface of a still pond, concentric ripples expanding outward in perfect circles (impact/reach)
   - Macro of frost crystals forming on a leaf, backlit by warm golden light, shallow depth of field (precision/transformation)`,
    tone: 'Mesmerizing, tactile, intimate. Extreme close-up framing, shallow depth of field, crisp detail. Slow deliberate movement. Warm or neutral lighting that makes materials look premium. The viewer should almost feel the texture.',
  },
  conceptual: {
    description:
      'Visual metaphors using natural physics \u2014 fluid dynamics, light, fire, fog. The viewer sees something symbolic happen, reads the overlay text, and gets the connection instantly. Ink in water, light through prism, flame in darkness.',
    examples: `Examples of GOOD conceptual visual worlds:
   - Ink slowly blooming in clear water in a glass vessel, tendrils branching outward following real fluid physics (growth/expansion)
   - White light passing through a glass prism, splitting into a rainbow spectrum on a dark surface (clarity/understanding)
   - A match being struck in complete darkness, the flame illuminating a single object (discovery/insight)
   - Fog lifting off a still lake at sunrise, the water surface becoming mirror-clear underneath (clarity/revealing truth)
   - A single drop of dye hitting still water, the impact creating a perfect crown splash in slow motion (impact/moment of change)`,
    tone: 'Clean, intentional, deliberate. Every element serves the metaphor. Neutral or minimal backgrounds so the symbolic action is the focus. The "aha" moment when paired with overlay text is what makes this style work.',
  },
  documentary: {
    description:
      'Authentic, atmospheric footage from real environments. Workshop details, morning light through windows, city energy at night, craft close-ups. Feels captured, not produced. The product\'s world, not the product itself.',
    examples: `Examples of GOOD documentary visual worlds:
   - Morning light streaming through a workshop window, sawdust floating in the air, tools neatly arranged on a bench (craft/expertise)
   - Rain hitting a city street at night, neon reflections stretching across wet pavement, car headlights passing (urban/dynamic)
   - Steam rising from a coffee cup on a sunlit kitchen counter, warm morning light from a window (ritual/warmth)
   - Close-up of weathered hands turning the pages of a well-used notebook, natural window light (experience/knowledge)
   - A vineyard at dawn, morning mist between the rows, first light catching the leaves (origin/authenticity)`,
    tone: 'Raw, authentic, warm. Natural lighting, stable but organic camera feel. Earth tones, natural grain. The "Instagram documentary" aesthetic \u2014 the video should feel like a real moment captured, not staged.',
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
  style?: 'cinematic' | 'product' | 'macro' | 'conceptual' | 'documentary'
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
1. Find the emotional core (customer frustration before \u2192 relief after) and pick a SINGLE VISUAL WORLD in the ${style.toUpperCase()} style.
2. Plan the visual journey as segments. 8s base + 7s extensions.

VIDEO PROMPT WRITING STYLE — THIS IS CRITICAL:
Write videoPrompt and extensionPrompts as DIRECT, CASUAL descriptions. Like you're telling a friend what the video looks like. NOT like a film school essay.

GOOD videoPrompt: "A paper llama stands blinking at the camera in a world made of paper. Clouds hang from strings. Scissors come in and cut the llama's head off. Camera zooms in on the headless llama."
GOOD videoPrompt: "Espresso pouring into a white cup in slow motion, crema forming a perfect golden layer. Camera slowly pushes in."
GOOD videoPrompt: "Drone shot slowly revealing a mountain lake at sunrise, mist lifting off the water."

BAD videoPrompt (DO NOT DO THIS): "In a whimsical paper-craft universe, delicate cotton clouds are suspended from gossamer threads against a warm cream sky. A charming origami llama stands center frame, its oversized eyes blinking with endearing innocence as warm diffused golden-hour lighting bathes the scene in soft amber tones..."
That kills the energy and confuses Veo. Be direct.

SEGMENT PACING:
- Each segment: ONE camera move, ONE angle
- 8s = 1 segment. 15s = 2 segments. 22s = 3 segments.

CAPTION RULES (~2.5 words/second):
- Each caption = 2-4 words, lasts ~1.5-2s on screen
- Scale count: 3-4 for 8s, 6-8 for 15s, 10-12 for 22s
- Narrative arc: hook \u2192 tension \u2192 solution \u2192 CTA payoff

${productRule}

DIVERSITY RULES — across all ${count} concepts:
- Each concept: DIFFERENT environment, DIFFERENT advertising angle, DIFFERENT emotion/mood.

CONTENT SAFETY:
- No violence, weapons, people in distress, nudity, real brand names/logos.

VEO LIMITATIONS (work around silently):
- Veo CANNOT render text or words in the video — never put text in videoPrompt. Move text to overlay.
- Veo CANNOT render logos.
- No cause-and-effect in a single segment — split across segments.
- Describe things happening, not what NOT to include.

DURATION & SEGMENTATION — THIS IS CRITICAL:
Veo generates each segment as a SEPARATE video clip. The extension API takes the previous clip and continues from its final frame. This means:
- Whatever is in videoPrompt gets rendered COMPLETELY in the first 8 seconds
- Whatever is in an extension prompt gets rendered COMPLETELY in that 7-second extension
- If you put too many actions in videoPrompt, they ALL happen in 8 seconds and the extension has nothing left to show

Valid durations: 8, 15, 22, 29 seconds. Estimate naturally → "estimatedSeconds".
- If ≤8s: "videoPrompt" covers full video. No extensionPrompts.
- If >8s: "videoPrompt" covers the first 8s (2-3 beats). Include "extensionPrompts" array (one per 7s extension). Each extension starts with "Continue from previous shot." then describes what CHANGES or HAPPENS NEXT — also 2-3 beats per extension, enough to fill the time.
- Distribute actions EVENLY across segments. Each segment should feel full and engaging — not crammed, not sparse. Split at natural scene breaks or transitions.

Return JSON:
{ "concepts": [
  {
    "title": "2-4 word concept name",
    "angle": "Advertising angle (Problem→Solution, Emotional Benefit, Feature Spotlight, Social Proof, Curiosity Hook, Transformation, etc.)",
    "logline": "1 sentence — what tension does this visualize and how does it sell?",
    "visualMetaphor": "Customer problem/desire → physical phenomenon mapping.",
    "whyItWorks": "Why this stops the scroll AND sells.",
    "estimatedSeconds": 15,
    "script": {
      "scene": "Environment and setting — direct, not flowery.",
      "subject": "Who/what is in the shot.",
      "action": "What happens, beat by beat. Direct language.",
      "mood": "Color and energy feel."
    },
    "overlay": {
      "hook": "Opening text (first 2s) — short, punchy.",
      "captions": ["2-4 word caption per beat"],
      "cta": "Call-to-action button text"
    },
    "videoPrompt": "150-350 chars. FIRST 8 SECONDS ONLY. Direct, casual description. What the viewer sees, what the camera does. No flowery prose. End with 'Vertical 9:16 portrait format.' if not mentioned.",
    "extensionPrompts": ["Only if estimatedSeconds > 8. 100-250 chars. Start with 'Continue from previous shot.' then describe directly."],
    "adCopy": {
      "primaryText": "Facebook post body (2-3 sentences). Pain point → benefit.",
      "headline": "Ad headline (5-8 words).",
      "description": "Link description (1 sentence)."
    }
  }
]}

Respond ONLY with the JSON object, no other text.`
}
