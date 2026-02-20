/**
 * Direct Video Prompt Generation
 *
 * Builds the "Direct" video concept prompt sent to GPT 5.2 for structuring
 * a user's freeform concept idea into a production-ready Veo video script
 * with overlay, ad copy, and extension segmentation.
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

import type { ProductKnowledge } from '@/lib/video-prompt-templates'
import { buildProductContextBlock, CONCEPT_STYLE_GUIDES } from './video-concepts'
import { snapToVeoDuration, VEO_BASE_DURATION, VEO_EXTENSION_STEP } from './video-ugc'

export { snapToVeoDuration, VEO_BASE_DURATION, VEO_EXTENSION_STEP }

export interface BuildDirectConceptParams {
  product: ProductKnowledge
  conceptPrompt: string
  style?: 'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll'
}

export function buildDirectConceptPrompt(params: BuildDirectConceptParams): string {
  const { product, conceptPrompt, style = 'cinematic' } = params
  const productContext = buildProductContextBlock(product)
  const styleGuide = CONCEPT_STYLE_GUIDES[style]

  return `You are a video ad director. The user has a concept idea for a vertical (9:16) video ad. Your job is to flesh it out into a production-ready Veo AI video script with precise camera direction, overlay text, and ad copy.

PRODUCT:
${productContext}

USER'S CONCEPT:
"${conceptPrompt.trim()}"

STYLE: ${style.toUpperCase()}
${styleGuide.description}
${styleGuide.tone}

VEO AI RULES (you MUST follow these):
1. ONE subject per prompt — never ask for two things happening at once
2. ONE camera movement per prompt (orbit, dolly, crane, push-in, pull-back, etc.)
3. Atmospheric over narrative — Veo excels at mood, lighting, texture, and slow reveals
4. No cause-and-effect sequences (e.g. "pours water then drinks" will fail)
5. No text rendering — Veo cannot render text. Never include text in the video prompt. Text overlays are added in post-production.
6. No logos — Veo cannot render logos.
7. Describe in present continuous tense: "The camera slowly orbits..." not "The camera will orbit..."
8. Be extremely specific about lighting, atmosphere, and color temperature
9. Each prompt should be 300-800 characters

DURATION ESTIMATION:
Based on the user's concept complexity, estimate a natural duration. Valid Veo durations are 8, 15, 22, 29, 36 seconds (8s base + 7s extensions). Pick the shortest duration that does the concept justice — most concepts work best at 8 or 15 seconds.

VIDEO SEGMENTATION:
- The "videoPrompt" covers the FIRST 8 seconds.
- If estimatedDuration > 8, include an "extensionPrompts" array with one prompt per 7-second extension.
- Each extension prompt MUST start with "Continue from previous shot." and maintain visual continuity.
- Build a visual arc across segments — each extension should evolve the scene (new angle, new lighting, new detail reveal).
- Number of extensions = (estimatedDuration - 8) / 7

CAPTION RULES:
- 2-3 short caption beats (3-6 words each) that connect the visual metaphor to the product benefit
- Captions should feel like a reveal — the viewer sees the visual, reads the caption, and "gets it"
- Captions are NOT narration — they are punchy benefit statements

OUTPUT FORMAT (respond with ONLY this JSON, no other text):
{
  "videoPrompt": "The Veo prompt for the first 8 seconds. Uses block headers: [Scene], [Subject], [Action], [Mood & Atmosphere], [Technical]. Cinematic, detailed, specific.",
  "extensionPrompts": ["Only if estimatedDuration > 8. One prompt per 7-second extension."],
  "scene": "One-line summary of the environment/setting",
  "subject": "One-line summary of who/what appears",
  "action": "Beat-by-beat description of the key movements",
  "mood": "One-line summary of the color/tone/feeling",
  "estimatedDuration": 8,
  "overlay": {
    "hook": "Short punchy hook text (MAX 6 words) for the first 2 seconds",
    "captions": ["2-3 caption beats", "that reveal the benefit", "through the visual"],
    "cta": "Call-to-action button text (e.g. 'Shop Now')"
  },
  "adCopy": {
    "primaryText": "Facebook ad primary text (2-3 sentences, benefit-led)",
    "headline": "Short punchy headline (5-8 words)",
    "description": "Link description (1 sentence)"
  }
}

PROMPT BLOCK GUIDELINES:
- [Scene]: Environment, lighting setup, atmosphere, background elements. Be specific about light direction, color temperature, and volumetric effects.
- [Subject]: The main subject — describe precisely. If it's the product, reference its physical form.
- [Action]: ONE camera movement + ONE subject motion. Beat-by-beat within the segment.
- [Mood & Atmosphere]: Color grade, energy, sound design feel, emotional tone.
- [Technical]: "Vertical 9:16 portrait (1024x1792). Professional ad quality. ${styleGuide.tone.split('.')[0]}." Include pacing note.

IMPORTANT: Translate the user's casual concept into cinematic, specific Veo language. Add the production details they didn't think of — lighting, particle effects, camera movement, atmosphere. Make it feel like a real director interpreted their idea.

Respond ONLY with the JSON object, no other text.`
}
