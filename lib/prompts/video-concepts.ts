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
      'Breathtaking nature cinematography and atmospheric landscapes. The kind of footage that stops a scroll because it is genuinely beautiful. Think drone reveals, golden hour, macro nature, slow-motion elements of the natural world.',
    examples: `Examples of GOOD cinematic visual worlds:
   - Aerial drone slowly revealing a vast mountain lake at sunrise, mist lifting off the water (clarity/revelation)
   - Macro of frost crystals forming on a leaf, backlit by golden hour light (precision/transformation)
   - Ocean wave cresting in slow motion, sunlight refracting through the translucent curl (momentum/power)
   - Time-lapse of clouds parting over a valley, shafts of light sweeping across the landscape (breakthrough/possibility)
   - A single tree standing in an open field, wind rippling through tall grass at golden hour (resilience/calm)`,
    tone: 'Majestic, awe-inspiring, premium. Color grading should feel cinematic — rich, warm, or dramatically cool. The video should feel like a nature documentary opening shot.',
  },
  playful: {
    description:
      'Funny, unexpected, whimsical scenarios that stop the scroll because "wait, what?" Think animals doing human things, absurd scale, surprising juxtapositions, cartoonish physics. The viewer watches because it is entertaining and shareable.',
    examples: `Examples of GOOD playful visual worlds:
   - An elephant trying to use a tiny umbrella in the rain, struggling adorably (protection/coverage)
   - A cat sitting at a desk with tiny glasses, staring at a laptop screen looking confused (overwhelm/simplicity)
   - A goldfish in a bowl watching a massive ocean wave on a tiny TV (ambition/scale)
   - A row of rubber ducks on a conveyor belt, one duck wearing sunglasses going the wrong direction (standing out/individuality)
   - A dog in a chef hat carefully placing a single kibble on a fancy plate (premium/quality)`,
    tone: 'Lighthearted, surprising, smile-inducing. Warm color palette, slightly whimsical lighting. The video should make someone smile and want to share it. Lean into the absurdity — the funnier and more unexpected, the better the ad performs.',
  },
  conceptual: {
    description:
      'Visual metaphors with a satisfying "aha" moment. The viewer sees something symbolic happen, reads the overlay text, and gets it instantly. Think transformation, before/after, symbolic actions that map to a customer problem or benefit.',
    examples: `Examples of GOOD conceptual visual worlds:
   - Pressure washing slowly revealing clean concrete underneath layers of grime, words or shapes emerging (clarity/revealing truth)
   - A single domino falling and setting off a perfectly arranged chain reaction (momentum/compound effect)
   - Ice melting in reverse — water droplets flying upward and freezing into a crystal structure (building/growth)
   - A knot slowly untying itself in silk rope, the rope falling smooth and straight (simplicity/untangling)
   - Sand in an hourglass flowing upward instead of down (time saved/reversal)`,
    tone: 'Clean, intentional, satisfying. The visual should feel deliberate — every element serves the metaphor. Neutral or minimal backgrounds so the symbolic action is the focus. The "aha" moment when paired with overlay text is what makes this style work.',
  },
  satisfying: {
    description:
      'Oddly satisfying, ASMR-energy footage that people physically cannot scroll past. Think perfect fits, smooth textures, precise processes, symmetry, cleaning, peeling, pouring. The viewer watches because it FEELS good.',
    examples: `Examples of GOOD satisfying visual worlds:
   - Thick paint being poured and slowly spreading into a perfect circle on a flat surface (coverage/completeness)
   - A laser cutting through material with perfect precision, smooth edges glowing (precision/accuracy)
   - Kinetic sand being sliced with a knife, the cross-section revealing layered colors (depth/layers)
   - Water beading and rolling off a hydrophobic surface in slow motion (effortless/protection)
   - A perfectly symmetrical pour of honey spiraling off a dipper in golden light (flow/smoothness)`,
    tone: 'Mesmerizing, tactile, ASMR. Close-up framing, macro lenses, crisp audio-visual detail. Slow, deliberate movement. The viewer should almost feel the texture. Warm or neutral lighting that makes materials look premium.',
  },
  broll: {
    description:
      "Authentic, documentary-style footage from the product's world. Real environments, real textures, real moments that feel like behind-the-scenes content. Think workshop hands, morning routines, city energy, craft close-ups. Feels real, not produced.",
    examples: `Examples of GOOD b-roll visual worlds:
   - Morning light streaming through a workshop window, sawdust floating in the air, tools neatly arranged (craft/expertise)
   - A busy coffee shop counter from above — hands reaching, cups sliding, steam rising (energy/momentum)
   - Close-up of weathered hands turning the pages of a well-used notebook (experience/knowledge)
   - Rain hitting a city street at night, neon reflections stretching across wet pavement (urban/dynamic)
   - A farmer's market at golden hour — textures of fruit, hands exchanging produce, dappled light (authentic/natural)`,
    tone: 'Raw, authentic, warm. Natural lighting, handheld feel (but stable — AI generates stable footage). Earth tones, grain, the "Instagram documentary" aesthetic. The video should feel like a real moment captured, not staged.',
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
}): string {
  const {
    product,
    count = 4,
    existingConcepts = [],
    directionPrompt,
    style = 'cinematic',
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
    existingBlock = `\nANTI-REPETITION — these angles and visual domains are already used. You MUST NOT reuse them or anything similar:
  Angles used: ${usedAngles.join(', ') || 'none'}
  Environments used: ${usedDomains.join(' | ') || 'none'}
  If the existing concepts used organic/nature imagery, the new ones must use engineered/human-made systems or vice versa. Force cross-domain jumps.`
  }

  const directionBlock = directionPrompt
    ? `CREATIVE DIRECTION (from the user — this is your PRIMARY constraint):\n"${directionPrompt}"\nBuild the concept around this direction. The visual metaphor, scene, and mood should all serve this specific creative vision.`
    : ''

  const styleGuide = CONCEPT_STYLE_GUIDES[style] || CONCEPT_STYLE_GUIDES.cinematic

  return `You are a performance creative strategist making PAID ADS for Meta. Every concept must stop the scroll AND make people want to buy. Creative for the sake of creative doesn't sell. Every concept must serve the sale.

We need ${count} short-form video ad concept${count === 1 ? '' : 's'} for this product.

Each concept should be AS LONG AS THE STORY NEEDS — don't force everything into 8 seconds. A well-paced 15 or 22 second concept with room to breathe will outperform a rushed 8 second one.

PRODUCT:
${productContext}
${existingBlock}
${directionBlock}

VIDEO STYLE: ${style.toUpperCase()}
${styleGuide.description}

${styleGuide.examples}

TONE & AESTHETIC: ${styleGuide.tone}

HOW TO GENERATE EACH CONCEPT:

1. IDENTIFY THE EMOTIONAL CORE — what does the customer feel before using the product (frustration, anxiety, wasting time)? What do they feel after (relief, confidence, control)?

2. FIND A SINGLE VISUAL WORLD in the ${style.toUpperCase()} style that captures that emotion. Every concept must fit the style described above. Use the examples as a starting point but create original ideas specific to THIS product.

3. BUILD A VISUAL JOURNEY WITH SEGMENTS — the video engine generates 8 seconds as the base clip, then extends in separate 7-second segments. Each segment is rendered independently, so the seams between segments naturally create visual "cuts." Plan each segment as ONE continuous camera move from a DISTINCTLY DIFFERENT angle or framing than the previous segment. Same environment, different perspective — this creates the edited commercial feel.

4. THE OVERLAY DOES THE SELLING — the video creates the emotion, the text overlay connects it to the product and drives the sale. The video should feel like premium content, not a literal product demo.

SEGMENT PACING RULES (each segment = one continuous shot, cuts happen between segments):
- Each segment must be ONE fluid camera move (dolly, orbit, crane, push-in, pull-back, etc.)
- Each segment must show a DIFFERENT angle or framing than the one before it (wide → macro, orbit → static, above → eye-level)
- 8s video (1 segment): one beautiful establishing shot with camera movement
- 15s video (2 segments): wide establishing shot → then a closer/different angle of the same scene
- 22s video (3 segments): wide → medium/detail → reveal or pull-back
- 29s+ video (4+ segments): vary between wide, medium, macro, and dramatic angles
- The progression of angles should feel like an edited commercial — each "cut" reveals something new about the same world

CAPTION RULES (TikTok-style pacing, synced to ~150 WPM / 2.5 words per second):
- Each caption = 2-4 words. Short, punchy, one thought per card.
- Each caption lasts ~1.5-2 seconds on screen (based on word count)
- Scale caption count to video length:
  * 8s video → 3-4 captions
  * 15s video → 6-8 captions
  * 22s video → 10-12 captions
  * 29s+ video → 14-16 captions
- Captions tell a NARRATIVE ARC: hook the problem → build tension → reveal solution → CTA payoff
- Words should read naturally at speech speed — a viewer should be able to read aloud comfortably
- Do NOT stretch 3 captions across a 30-second video. More beats = more engagement.

THE PRODUCT RULE:
- The product NEVER appears on screen. The video IS the visual metaphor. Text overlays (added in post) connect the visual to the product and close the sale.

DIVERSITY RULES — across all ${count} concepts:
- Each concept must be set in a DIFFERENT environment. No two concepts in similar settings.
- Each concept must use a DIFFERENT advertising angle. Vary between problem/solution, emotional benefit, feature spotlight, social proof, transformation, curiosity, etc.
- Each concept must evoke a DIFFERENT emotion or mood. Vary color temperatures, energy levels, and visual tone.

WHAT MAKES A CONCEPT WORK AS AN AD:
- RELATABLE: The viewer sees themselves or their problem in the visual. Abstract art doesn't sell.
- GROUNDED: Set in real-world environments people recognize. Specific beats generic.
- CLEAR: The benefit clicks instantly when paired with overlay text. No decoding required.
- WATCHABLE: It looks like content someone would choose to watch, not skip. People can appear. Real human moments are powerful.
- COMMERCIAL: Every beat should build toward making the viewer curious about the product. This is an ad, not a short film.

CONTENT SAFETY (AI video generation rejects these):
- No violence, weapons, aggression, sharp objects near faces/bodies
- No people in distress, pain, or vulnerable states
- No dramatic physical transformations of PEOPLE (objects/nature transforming is fine)
- No nudity, suggestive content, real brand names/logos

VEO VIDEO AI RULES (your concepts MUST respect these — violations produce unusable videos):
- ONE subject doing ONE thing per segment. A person standing still, an object rotating, liquid flowing. Never two objects interacting with spatial precision.
- NO cause-and-effect. "Water pours into a glass" works. "Watering can waters a plant and it grows" does NOT — the AI misplaces objects and creates artifacts. If your concept requires Object A to do something TO Object B, it WILL fail.
- NO precise manipulation. Hands holding something static = fine. Hands performing a task (pouring, writing, assembling, opening) = broken results.
- SIMPLE PHYSICS ONLY. Gravity, light, air movement, water flowing downward = reliable. Mechanical systems, chain reactions, precision placement = unreliable.
- ATMOSPHERIC > NARRATIVE. Describe what it LOOKS like, not what HAPPENS. "Slow orbit around a weathered compass on a map table, warm amber light" beats "person picks up compass, reads map, then walks outside."
- EACH EXTENSION SEGMENT must describe a single continuous shot from a DIFFERENT camera angle than the previous segment. Same environment, different perspective. No "then" or "next" within a segment — describe what the camera sees for 7 unbroken seconds.

DURATION & SEGMENTATION:
The video engine generates an 8-second base clip, then extends in 7-second increments. Valid durations: 8, 15, 22, 29, 36 seconds.

For EACH concept:
1. Write the action beats as long as they need to be. Don't rush. Let the visual breathe.
2. Estimate how many seconds the full action would take to play out naturally.
3. Return this estimate as "estimatedSeconds".

If your estimate is 8 seconds or less:
- The "videoPrompt" covers the full video. No extensionPrompts needed.

If your estimate is more than 8 seconds:
- The "videoPrompt" must cover ONLY the first 8 seconds (the opening hook + first beats).
- Include an "extensionPrompts" array with one prompt per 7-second extension.
- Each extension prompt describes a DIFFERENT camera angle or framing of the same scene — the cut happens naturally between segments. Describe one continuous camera move for 7 seconds.
- Each extension must maintain visual continuity (same environment, lighting, subjects, color grade).
- Number of extensions = ceil((estimatedSeconds - 8) / 7).

Return JSON:
{ "concepts": [
  {
    "title": "2-4 word concept name",
    "angle": "The advertising angle (e.g. Problem\u2192Solution, Emotional Benefit, Feature Spotlight, Social Proof, Curiosity Hook, Transformation, etc.)",
    "logline": "1 sentence \u2014 what tension does this visualize and how does it sell the product?",
    "visualMetaphor": "The tension \u2192 physical phenomenon mapping. What customer problem or desire does this represent, and what real-world physics or process makes it visible?",
    "whyItWorks": "Why this stops the scroll AND makes the viewer curious about the product. Not just 'it looks cool' \u2014 how does it sell?",
    "estimatedSeconds": 15,
    "script": {
      "scene": "Environment, lighting, atmosphere \u2014 specific and grounded. A place the audience recognizes or aspires to.",
      "subject": "Who/what is in the shot \u2014 physical description, textures, colors. People are welcome.",
      "action": "Describe the full visual arc across ALL segments. Each segment = one continuous camera move from a distinct angle. Example for 15s (2 segments): 'Segment 1: Slow aerial drone reveal of a misty mountain lake at sunrise, camera pushing forward over the water. Segment 2: Macro-level shot of water droplets on a lakeside leaf, golden hour backlight, slow dolly left.' Same world, different perspectives — the cuts happen naturally between segments.",
      "mood": "Color grade, energy, sound design, emotional tone"
    },
    "overlay": {
      "hook": "Opening text (first 2 seconds) \u2014 short, punchy, makes you keep watching. Relates to the viewer's problem or desire.",
      "captions": ["2-4 word caption per beat — scale count to duration: 3-4 for 8s, 6-8 for 15s, 10-12 for 22s, 14-16 for 29s+. Each tells one thought in the narrative arc. Last caption lands the product connection."],
      "cta": "Call-to-action button text"
    },
    "videoPrompt": "Prompt for the FIRST 8 SECONDS — ONE continuous camera move showing ONE subject in ONE environment. Use camera terms (slow dolly, orbit, rack focus, crane, macro push-in). Describe textures, lighting direction, color temperature. Keep it simple — atmospheric beauty with one clear visual anchor. Describe only what SHOULD appear (never 'no X' or 'avoid Y'). No text, logos, or UI elements. 300-800 chars — shorter is better for Veo.",
    "extensionPrompts": ["Only include if estimatedSeconds > 8. One prompt per 7-second extension. Each describes ONE continuous camera move from a DIFFERENT angle/framing than the previous segment — the cut happens naturally at the seam. Same environment, different perspective (e.g. if segment 1 was wide aerial, segment 2 should be macro or eye-level). Never introduce new objects or complex interactions. 200-500 chars each."],
    "adCopy": {
      "primaryText": "Facebook post body text (2-3 sentences). Speak to the target audience's pain point or desire. End with a clear benefit statement.",
      "headline": "Short punchy ad headline (5-8 words). Benefit-driven, creates curiosity.",
      "description": "Link description (1 sentence). Reinforces the offer or social proof."
    }
  }
]}

Respond ONLY with the JSON object, no other text.`
}
