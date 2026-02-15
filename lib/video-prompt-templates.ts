import type { PromptSections, VideoStyle } from '@/remotion/types'

export interface ProductKnowledge {
  name: string
  description?: string
  features?: string[]
  benefits?: string[]
  painPoints?: string[]
  testimonialPoints?: string[]
  keyMessages?: string[]
  targetAudience?: string
  category?: string
  uniqueSellingPoint?: string
  motionOpportunities?: string[]   // "Pour from bottle creates satisfying cascade"
  sensoryDetails?: string[]        // "Matte black finish, weight of quality materials"
  visualHooks?: string[]           // "Before/after transformation", "Unboxing reveal"
}

export interface ProductImage {
  base64: string
  mimeType: string
  description: string
  type: string
}

export interface ScriptConcept {
  title: string
  summary: string
  whyItWorks: string
  script: PromptSections
}

// ─── Concept-First Ad Types ─────────────────────────────────────────────────

export interface AdConceptOverlay {
  hook: string          // Opening text overlay (first 2 seconds)
  captions: string[]    // 2-3 caption beats throughout the video
  cta: string           // Call-to-action button text
}

export interface AdConcept {
  title: string               // 2-4 word concept name
  angle: string               // e.g. "Problem → Solution", "Feature Spotlight"
  logline: string             // 1 sentence creative pitch
  visualMetaphor: string      // What value prop this represents and how
  whyItWorks: string          // Why this stops scrolling
  script: {
    scene: string             // Environment, lighting, atmosphere
    subject: string           // Who/what is in the shot
    action: string            // Beat-by-beat with camera movements
    mood: string              // Color grade, energy, sound design
  }
  overlay: AdConceptOverlay   // Text overlays that connect metaphor to product
  videoPrompt?: string        // Veo-native prompt with block headers
  estimatedDuration?: number  // Veo-snapped duration in seconds (8, 15, 22, 29...)
  extensionPrompts?: string[] // Per-segment continuation prompts for Veo extensions
  adCopy?: {                  // Meta post copy (NOT video overlay text)
    primaryText: string       // Facebook post body text
    headline: string          // Ad headline
    description: string       // Ad description / link description
  }
}

// ─── UGC Video Types ────────────────────────────────────────────────────────

export type UGCSettings = {
  gender: 'male' | 'female'
  ageRange: 'young-adult' | 'adult' | 'middle-aged'
  tone: 'authentic' | 'excited' | 'humorous' | 'serious' | 'empathetic'
  features: string[]   // Multi-select: "Glasses", "Full Beard", etc.
  clothing: string     // "Casual", "Formal", "Athletic", "Streetwear"
  scene: 'indoors' | 'outdoors'
  setting: string  // "Living Room", "Park", etc.
  notes: string    // Free text
}

export type UGCPromptResult = {
  prompt: string
  dialogue: string
  sceneSummary: string
  estimatedDuration?: number   // Veo-snapped duration in seconds (8, 15, 22, 29...)
  extensionPrompts?: string[]  // Per-segment continuation prompts for Veo extensions
  overlay?: {
    hook: string        // Opening text overlay (first 2 seconds)
    cta: string         // Call-to-action button text
  }
  adCopy?: {
    primaryText: string   // Facebook post body text
    headline: string      // Ad headline
    description: string   // Ad description / link description
  }
}

// ─── UGC Veo Prompt Builder ─────────────────────────────────────────────────
// Takes GPT 5.2's output and formats it into Veo-compatible structured blocks
// with image preservation rules for image-to-video generation.

export function buildUGCVeoPrompt(
  ugcResult: UGCPromptResult,
  durationSeconds: number,
): string {
  // The GPT 5.2 prompt is already structured — just add the product preservation
  // and technical blocks that Veo needs
  const blocks: string[] = []

  // The main prompt from GPT 5.2 already contains [Scene], [Subject], [Action], etc.
  blocks.push(ugcResult.prompt)

  // Ensure product preservation block exists
  if (!ugcResult.prompt.includes('[Product Preservation]')) {
    blocks.push(`[Product Preservation]\nThe product from the reference image must remain completely unchanged — same shape, colors, text, and proportions. Never alter, morph, or distort the product.`)
  }

  // Ensure technical block exists
  if (!ugcResult.prompt.includes('[Technical]')) {
    const pacingNote = durationSeconds <= 8
      ? 'Pacing: Tight and immediate. Natural speech cadence with direct-to-camera energy.'
      : durationSeconds <= 15
        ? 'Pacing: Conversational flow. Opening hook, product demonstration, closing endorsement.'
        : 'Pacing: Full testimonial arc. Hook, problem/context, product showcase, genuine recommendation, confident close.'

    blocks.push(`[Technical]\nVertical 9:16 portrait. Natural UGC aesthetic — slightly imperfect, relatable, not overly polished. Selfie-style camera with subtle movement. ${durationSeconds}s.\n${pacingNote}`)
  }

  return blocks.join('\n\n')
}

// Prompt templates for each video style
// Each template generates structured sections the user can edit
// Modeled after the POC prompt quality — cinematic language, camera directions, temporal pacing
export function generatePromptSections(
  style: VideoStyle,
  productName?: string,
  productDescription?: string,
): PromptSections {
  const product = productName || 'the product'
  const desc = productDescription || ''
  const descSuffix = desc ? `. ${desc}` : ''

  const templates: Record<VideoStyle, PromptSections> = {
    talking_head: {
      scene: 'Clean modern bathroom or apartment. Warm vanity lighting from above casting soft golden shadows. Shallow depth of field — background tiles and fixtures dissolve into creamy bokeh. Slightly steamy atmosphere. Morning light feel, not clinical.',
      subject: 'Confident, relatable person filming themselves in selfie mode. Natural makeup, casual but put-together. Direct eye contact with the camera lens throughout. Chest-up framing, filling most of the frame.',
      action: `Beat 1: Person looks into camera with a knowing expression, begins speaking directly to viewer with natural energy. Subtle handheld sway — authentic, not stabilized. Beat 2: Holds up ${product} near their face so branding is visible, tilts it slightly to catch the light. Animated hand gestures, genuine enthusiasm. Beat 3: Runs hand along product or demonstrates a quick use, nods with conviction. Points at camera on the closing line.`,
      product: `${product} held up near face at key moment — label and branding clearly visible to camera${descSuffix}. Glass, texture, and details catch the warm vanity light. Product is a natural extension of the person, not a prop.`,
      mood: 'Warm amber tones, authentic UGC energy. Selfie POV slightly above eye level. Conversational pacing — each beat lands with a brief natural pause. The viewer feels like they are getting advice from a trusted friend. No background music, just natural voice and ambient room tone.',
    },
    lifestyle: {
      scene: 'Golden hour outdoor setting — sunlight filtering through trees casting long warm shadows, or sunlit apartment with floor-to-ceiling windows. Natural lens flare kisses the edge of frame. Environment feels aspirational but attainable.',
      subject: 'Person naturally integrated into the environment. Relaxed body language, genuine smile, unhurried movements. Wearing casual clothes that match the warm color palette. Represents the target audience effortlessly.',
      action: `Opening: Slow dolly-in from wide establishing shot, golden light wrapping the scene. Mid: Person casually uses ${product} as part of their natural routine — no posed feeling. Camera racks focus from environment to product in their hands. Closing: Gentle push-in to a medium close-up, product catching the warm backlight with a soft rim glow.`,
      product: `${product} featured during natural use — catches golden hour light beautifully${descSuffix}. Rack focus pulls attention to the product at the key moment. Branding visible but organic, never forced.`,
      mood: 'Warm golden tones, cinematic color grade with lifted shadows. Slow, dreamy pacing. Feeling of "this could be my life." Soft ambient music with gentle acoustic texture. Every frame feels like a still you would save.',
    },
    product_showcase: {
      scene: 'Dark studio environment. Single dramatic beam of light cutting through atmospheric haze from upper-right. Deep black or dark gradient background. The product floats in a pool of sculpted light — nothing else competes for attention.',
      subject: '',
      action: `Opening: Product emerges from darkness, lit by a single rim light that traces its silhouette. Slow 180-degree orbit revealing form and contour. Mid: Dolly in to extreme macro — surface texture, material quality, fine details fill the frame. Light rakes across at a low angle emphasizing depth. Closing: Pull back to hero shot, dramatic key light blooms across the product face. Brief pause on the final beauty frame.`,
      product: `${product} is the absolute star — shot like a luxury commercial${descSuffix}. Every surface detail, texture, and material quality is visible. Rim light separates product from background. Hero lighting makes it look worth twice the price.`,
      mood: 'Dramatic, premium, high-end commercial energy. Strong contrast, razor-sharp focus. Atmospheric haze adds depth and dimension. Deep shadows, bright highlights, no middle ground. The kind of shot that stops mid-scroll. No dialogue, no music — just visual impact.',
    },
    interview: {
      scene: 'Comfortable living room or home office. Warm practical lights in the background create soft bokeh orbs — a table lamp, string lights, or candles. Natural window light from the side provides the key. Shallow depth of field softens the environment into a warm, inviting blur.',
      subject: 'Real person seated comfortably, natural posture. Relatable, genuine facial expressions. Speaking with conviction and warmth. Dressed casually, not styled — the authenticity is the appeal.',
      action: `Opening: Static medium shot, person looks slightly off-camera as if answering an interviewer's question. Subtle reframe as they lean in. Mid: Person describes their experience with ${product} — nodding, natural hand gestures. Camera holds steady with minor breathing movement. Beat: They turn to look directly into the camera for the key statement — a deliberate, powerful shift. Closing: Slight push-in on their face as they deliver the final line with genuine emotion.`,
      product: `${product} visible on the table beside them or held naturally during key moments${descSuffix}. Not forced into frame — it appears when it is relevant. The person's relationship with the product feels real.`,
      mood: 'Documentary authenticity with warm, intimate color grade. Side key light, soft fill. Slight grain for organic texture. Feels like a real conversation captured, not a scripted ad. Subtle ambient music underneath, if any.',
    },
    unboxing: {
      scene: 'Clean desk or table surface, warm directional light from upper-left creating defined shadows. Neutral background — white, light wood, or marble. Everything in frame is intentional and minimal. Surface texture is visible.',
      subject: 'Hands visible — clean, steady, moving with anticipation and care. Fingers trace edges, peel seals, lift lids with satisfying precision.',
      action: `Opening: Top-down shot of sealed package on clean surface. Hands enter frame, begin opening with deliberate, satisfying movements. Mid: Camera transitions from top-down to 45-degree angle as the box opens. Beat — pause on the reveal moment. Hands lift ${product} out slowly, turning it in the light. Closing: Push-in to product hero shot, warm light catching the surface details. Brief hold on the beauty frame.`,
      product: `${product} in premium packaging — the reveal is the hero moment${descSuffix}. Product emerges from box and catches the directional light. Every unboxing detail — tissue paper, inserts, the product itself — is shot with intention.`,
      mood: 'ASMR-adjacent, deeply satisfying. Crisp tactile sounds — paper rustling, seals peeling, box opening. Warm, clean tones. Deliberate pacing that builds anticipation to the reveal beat. Quiet, meditative energy. No dialogue, no music — pure sensory experience.',
    },
    before_after: {
      scene: 'Same location captured in two states. Before: slightly desaturated, flat lighting, cooler color temperature. After: vibrant, warm, beautifully lit. The environment transforms alongside the subject.',
      subject: 'Same person in both states — the transformation is visible in their energy, posture, and confidence. Before: slouched, dull, struggling. After: upright, glowing, genuinely happy.',
      action: `Before (first half): Static matching frame, desaturated grade. Person demonstrates the problem ${product} solves — frustration visible in their expression and body language. Camera holds steady to establish the baseline. Transition: Quick whip-pan or dissolve — the world shifts. Color blooms, light warms, energy transforms. After (second half): Same framing, vibrant grade. Person shows the dramatic improvement — confident, relieved, genuinely happy. Brief product flash during the transition beat.`,
      product: `${product} is the catalyst for the transformation${descSuffix}. Appears at the pivot moment between before and after. Brief but unmistakable — the viewer connects the product to the change.`,
      mood: 'Dramatic contrast drives the entire piece. Before: cool, flat, slightly underexposed. After: warm, saturated, lifted. The transformation is immediately visceral — you feel the difference before you process it. Music swells at the transition point.',
    },
    testimonial: {
      scene: 'Real-world location — kitchen counter, bathroom mirror, car dashboard, or backyard patio. Natural ambient light from a window or overhead. Unpolished background with real-life clutter. Nothing staged, nothing perfect.',
      subject: 'Real customer type, relatable and imperfect. Speaking with genuine emotion and enthusiasm. Slightly nervous energy that reads as authentic. This is not an actor — that is the entire appeal.',
      action: `Opening: Handheld selfie framing, person looks into camera and starts talking with raw energy. Slight camera wobble, auto-focus shifts — feels like a real phone recording. Mid: Person holds up ${product} enthusiastically, gets excited about their favorite feature. Natural stumbles and self-corrections. Closing: Genuine smile, emphatic recommendation delivered with conviction. Points at camera or gives a thumbs up.`,
      product: `${product} shown casually — grabbed from counter, pulled out of bag, held up to camera${descSuffix}. Not perfectly lit, not perfectly framed. The authenticity of the presentation IS the credibility.`,
      mood: 'Raw, unfiltered UGC energy. Phone-quality feel with natural compression artifacts. Slightly blown highlights, auto-exposure shifts. The imperfection is the production value. Enthusiastic, genuine, the kind of video a friend sends you. Natural voice only, no music.',
    },
    b_roll: {
      scene: 'Cinematic multi-environment composition — the product\'s world. Rich atmospheric elements: steam, dust motes in light beams, water droplets, fabric movement. Each frame is a photograph.',
      subject: '',
      action: `Opening: Slow dolly across a wide establishing shot of the product's environment — atmospheric, moody, cinematic. Mid: Crane down to the product, rack focus from foreground element to sharp product detail. Macro insert — extreme close-up of surface texture, material grain, fine details. Closing: Gentle orbit around the product in its hero position, rim light tracing the edges. Final frame holds as a beauty shot.`,
      product: `${product} shown across multiple cinematic angles${descSuffix}. Wide contextual shot, medium detail shot, extreme macro. Each angle reveals something new. Product integrated into a larger visual world, not isolated.`,
      mood: 'Cinematic, contemplative, visually stunning. Rich color grade with deep shadows and controlled highlights. Slow, deliberate camera movements. Atmospheric haze and environmental elements add depth. Magazine-cover composition in every frame. Music-driven — no dialogue needed. Every second is a visual experience.',
    },
  }

  return templates[style] || templates.lifestyle
}

// Combine sections into a single Sora-ready prompt
// Uses newline-separated block headers for clear structure
// Sora 2 notes:
//   - Dialogue in a dedicated [Dialogue] block at the end
//   - SDK with OpenAI.toFile() handles long prompts + input_reference fine
//   - When hasImage: adds reference image instructions to product focus
export function buildSoraPrompt(sections: PromptSections, hasImage = false, durationSeconds: 8 | 12 = 8): string {
  // ── Extract dialogue from action section ──────────────────────────────────
  const dialogueLines: string[] = []
  let visualAction = sections.action || ''

  // Match quoted speech (5+ chars) in double quotes or curly double quotes
  // NOT straight single quotes — too ambiguous with contractions
  const quotePattern = /[""\u201C\u201D]([^""\u201C\u201D]{5,})[""\u201C\u201D]|[\u2018]([^\u2018\u2019]{5,})[\u2019]/g
  let match: RegExpExecArray | null
  while ((match = quotePattern.exec(visualAction)) !== null) {
    dialogueLines.push((match[1] || match[2]).trim())
  }

  if (dialogueLines.length > 0) {
    // Remove quoted text from visual action
    visualAction = visualAction.replace(quotePattern, '')
    // Clean orphaned speech verbs only at the boundaries where quotes were removed
    // Use word boundary + optional colon/space pattern to avoid mangling non-speech uses
    visualAction = visualAction.replace(/\b(?:says?|explains?|explaining|asks?|asking|mentions?|mentioning|tells?|telling|shares?|sharing|speaks?|speaking)\b\s*:?\s*(?=[,.\s]|$)/gi, '')
    visualAction = visualAction.replace(/[:.]\s*[:.]/g, '.') // collapse ":." patterns
    visualAction = visualAction.replace(/\band\s*\./g, '.') // "and." → "."
    visualAction = visualAction.replace(/,\s*,/g, ',') // ",," → ","
    visualAction = visualAction.replace(/\.\s*,/g, '.') // ".," → "."
    visualAction = visualAction.replace(/\s{2,}/g, ' ').trim()
    visualAction = visualAction.replace(/^[,.:;\s]+|[,.:;\s]+$/g, '').trim()
  }

  // ── Build prompt blocks ────────────────────────────────────────────────────
  const blocks: string[] = []

  if (sections.scene) {
    blocks.push(`[Scene]\n${sections.scene}`)
  }

  if (sections.subject) {
    blocks.push(`[Subject]\n${sections.subject}`)
  }

  if (visualAction) {
    blocks.push(`[Action]\n${visualAction}`)
  }

  // Product block — reinforce reference image when hasImage
  if (sections.product) {
    if (hasImage) {
      blocks.push(`[Product]\nMatch the product's colors, shape, branding, and proportions precisely from the reference image. ${sections.product}`)
    } else {
      blocks.push(`[Product]\n${sections.product}`)
    }
  } else if (hasImage) {
    blocks.push(`[Product]\nThe exact product from the reference image is featured prominently throughout. Match its colors, shape, branding, and proportions precisely.`)
  }

  if (sections.mood) {
    blocks.push(`[Mood & Atmosphere]\n${sections.mood}`)
  }

  // Technical block with duration-aware pacing
  const pacingNote = durationSeconds === 12
    ? 'Pacing: Opening beat (2-3s) to establish, development (5-7s) for the core action, closing beat (2-3s) to land the message. Room to breathe between beats.'
    : 'Pacing: Tight and immediate. 2-3 fast beats with no wasted frames. Hook in the first second, payoff by the last.'

  blocks.push(`[Technical]\nVertical 9:16 portrait (1024x1792). Professional ad quality. Cinematic lighting.\n${pacingNote}`)

  // Dialogue block at the end (Sora 2 required format)
  if (dialogueLines.length > 0) {
    const formattedLines = dialogueLines.map(line => `Speaker: "${line}"`).join('\n')
    blocks.push(`[Dialogue]\n${formattedLines}`)
  }

  return blocks.join('\n\n')
}

// ─── Concept-First Sora Prompt Builder ──────────────────────────────────────
// Converts an AdConcept script into a Sora-ready prompt.
// No product reference image — the video IS the metaphor, overlays do the selling.

export function buildConceptSoraPrompt(
  concept: AdConcept,
  durationSeconds: number = 10,
): string {
  const { script } = concept

  // Extract dialogue from action (same pattern as buildSoraPrompt)
  const dialogueLines: string[] = []
  let visualAction = script.action || ''

  const quotePattern = /[""\u201C\u201D]([^""\u201C\u201D]{5,})[""\u201C\u201D]|[\u2018]([^\u2018\u2019]{5,})[\u2019]/g
  let match: RegExpExecArray | null
  while ((match = quotePattern.exec(visualAction)) !== null) {
    dialogueLines.push((match[1] || match[2]).trim())
  }

  if (dialogueLines.length > 0) {
    visualAction = visualAction.replace(quotePattern, '')
    visualAction = visualAction.replace(/\b(?:says?|explains?|explaining|asks?|asking|mentions?|mentioning|tells?|telling|shares?|sharing|speaks?|speaking)\b\s*:?\s*(?=[,.\s]|$)/gi, '')
    visualAction = visualAction.replace(/[:.]\s*[:.]/g, '.')
    visualAction = visualAction.replace(/\band\s*\./g, '.')
    visualAction = visualAction.replace(/,\s*,/g, ',')
    visualAction = visualAction.replace(/\.\s*,/g, '.')
    visualAction = visualAction.replace(/\s{2,}/g, ' ').trim()
    visualAction = visualAction.replace(/^[,.:;\s]+|[,.:;\s]+$/g, '').trim()
  }

  const blocks: string[] = []

  if (script.scene) {
    blocks.push(`[Scene]\n${script.scene}`)
  }

  if (script.subject) {
    blocks.push(`[Subject]\n${script.subject}`)
  }

  if (visualAction) {
    blocks.push(`[Action]\n${visualAction}`)
  }

  if (script.mood) {
    blocks.push(`[Mood & Atmosphere]\n${script.mood}`)
  }

  const pacingNote = durationSeconds === 12
    ? 'Pacing: Opening beat (2-3s) to establish, development (5-7s) for the core action, closing beat (2-3s) to land the message. Room to breathe between beats.'
    : 'Pacing: Tight and immediate. 2-3 fast beats with no wasted frames. Hook in the first second, payoff by the last.'

  blocks.push(`[Technical]\nVertical 9:16 portrait (1024x1792). Professional ad quality. Cinematic lighting. No text, logos, or UI elements in the video — overlays are added in post.\n${pacingNote}`)

  if (dialogueLines.length > 0) {
    const formattedLines = dialogueLines.map(line => `Speaker: "${line}"`).join('\n')
    blocks.push(`[Dialogue]\n${formattedLines}`)
  }

  return blocks.join('\n\n')
}
