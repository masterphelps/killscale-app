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

  return `You are a video segmentation assistant for Google Veo. The user has a concept idea for a vertical (9:16) video ad. Your job is to:
1. Determine duration and split into time segments
2. Generate overlay text, ad copy, and scene/mood summaries

CRITICAL RULE — PRESERVE THE USER'S WORDS:
Do NOT rewrite, embellish, or "improve" the user's concept. Veo works best with direct, casual prompts.
Keep the user's exact words, tone, and pacing. If they said "camera spins around product" keep "camera spins around product" — do NOT change it to "elegant 360-degree orbit revealing the product's contour as rim light traces its silhouette."

PRODUCT:
${productContext}

USER'S CONCEPT:
"${conceptPrompt.trim()}"

STYLE CONTEXT: ${style.toUpperCase()} — ${styleGuide.tone.split('.')[0]}.

DURATION ESTIMATION:
- Single action → 8 seconds
- Two-part scene → 15 seconds
- Three beats → 22 seconds
- Complex narrative → 29 seconds
Pick the SHORTEST duration. Valid: 8, 15, 22, 29.

SEGMENTATION RULES — THIS IS THE MOST IMPORTANT PART:
Veo generates each segment as a SEPARATE video clip. The extension API takes the previous clip and continues from its final frame. This means:
- Whatever is in videoPrompt gets rendered COMPLETELY in the first 8 seconds
- Whatever is in an extension prompt gets rendered COMPLETELY in that 7-second extension
- If you put too many actions in videoPrompt, they ALL happen in 8 seconds and the extension has nothing left to show

SO: Distribute the user's actions EVENLY across segments. Each segment should have enough action to fill its time — not too much crammed in, not too little leaving dead air.
- 8 seconds can fit 2-3 beats comfortably
- 7-second extensions can also fit 2-3 beats
- Split at NATURAL SCENE BREAKS or transitions

- "videoPrompt" = the first 8 seconds of action, in the user's words — should feel complete and engaging on its own
- Extension prompts each continue the story for the NEXT 7 seconds — should also feel substantial
- Each extension MUST start with "Continue from previous shot." then describe what CHANGES or HAPPENS NEXT
- Each extension MUST have enough content to fill 7 seconds — don't leave segments sparse
- Split at natural scene breaks
- Do NOT add cinematic flourishes the user didn't ask for
- Only addition: "Vertical 9:16 portrait format." if not mentioned

VEO LIMITATIONS (silently work around):
- Cannot render text — move any requested text to overlay
- Cannot render logos
- Cause-and-effect in one segment fails — split across segments

CAPTION RULES:
- 2-3 short caption beats (3-6 words each) connecting visual to product benefit
- Punchy benefit statements, not narration

OUTPUT FORMAT (respond with ONLY this JSON):
{
  "videoPrompt": "The user's concept for the first 8 seconds — their words, their style. Minimal edits.",
  "extensionPrompts": ["Continue from previous shot. [user's words for next 7s]"],
  "scene": "One-line setting summary",
  "subject": "One-line summary of who/what appears",
  "action": "Beat-by-beat key movements from the user's description",
  "mood": "One-line tone summary",
  "estimatedDuration": 8,
  "overlay": {
    "hook": "Short punchy hook (MAX 6 words)",
    "captions": ["2-4 word caption beats"],
    "cta": "CTA button text"
  },
  "adCopy": {
    "primaryText": "Facebook ad primary text (2-3 sentences, benefit-led)",
    "headline": "Short punchy headline (5-8 words)",
    "description": "Link description (1 sentence)"
  }
}

Respond ONLY with the JSON object.`
}
