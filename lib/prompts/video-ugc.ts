/**
 * UGC Video Prompt Generation
 *
 * Builds the UGC (user-generated content) video ad prompt sent to GPT
 * for generating Veo-compatible video scripts with dialogue, overlay,
 * ad copy, and extension segmentation.
 *
 * Extracted from: app/api/creative-studio/generate-ugc-prompt/route.ts
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

// ── Veo Duration Constants ────────────────────────────────────────────────

/** Base duration for Veo 3.1 initial generation (seconds) */
export const VEO_BASE_DURATION = 8

/** Duration of each Veo 3.1 extension segment (seconds) */
export const VEO_EXTENSION_STEP = 7

/** Snap a raw duration to the nearest valid Veo duration (8, 15, 22, 29, ...) */
export function snapToVeoDuration(rawSeconds: number): number {
  if (rawSeconds <= VEO_BASE_DURATION) return VEO_BASE_DURATION
  const extensions = Math.round((rawSeconds - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
  return VEO_BASE_DURATION + extensions * VEO_EXTENSION_STEP
}

// ── UGC Prompt Builder ────────────────────────────────────────────────────

export interface BuildUGCPromptParams {
  productContext: string
  gender: string
  ageDesc: string
  tone: string
  clothing: string
  features: string[] | undefined
  scene: string
  setting: string
  notes: string | undefined
}

export function buildUGCPrompt(params: BuildUGCPromptParams): string {
  const {
    productContext,
    gender,
    ageDesc,
    tone,
    clothing,
    features,
    scene,
    setting,
    notes,
  } = params

  return `You are a UGC video ad director. Create a detailed video generation prompt for a vertical (9:16) product testimonial video.

PRODUCT:
${productContext}

PRESENTER:
- Gender: ${gender}
- Age: ${ageDesc}
- Delivery tone: ${tone}
- Clothing style: ${clothing}${features?.length ? `\n- Appearance features: ${features.join(', ')}` : ''}

SCENE:
- ${scene}: ${setting}
${notes ? `- Additional direction: ${notes}` : ''}

RULES:
1. The product shown in the reference image is the HERO. It must NOT be altered, distorted, resized, or changed in ANY way.
2. The presenter holds, uses, or gestures toward the product naturally.
3. Write the dialogue AS LONG AS IT NEEDS TO BE to tell a compelling, natural-feeling testimonial. Don't rush it. A real person wouldn't cram everything into 8 seconds.
4. The dialogue must weave in real product benefits/features naturally — NOT read like an ad script. It should feel like a real person sharing their genuine experience.
5. Camera: Front-facing, slight movement (not static), natural selfie-style framing.
6. Lighting should match the ${scene} ${setting} environment realistically.
7. The person should look directly at the camera with ${tone} energy.

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
- [Scene]: Describe the ${setting} environment in detail — lighting, time of day, atmosphere, background.
- [Subject]: Describe the ${gender} presenter — age (${ageDesc}), wearing ${clothing} clothing${features?.length ? `, with ${features.join(', ').toLowerCase()}` : ''}. Energy and demeanor.
- [Action]: Beat-by-beat description of what happens in this segment.
- [Product Preservation]: "The product from the reference image must remain completely unchanged — same shape, colors, text, and proportions."
- [Mood & Atmosphere]: ${tone} tone — lighting, color grade, energy feel.
- [Technical]: "Vertical 9:16 portrait. Natural UGC aesthetic. Selfie-style camera with subtle movement."
- [Dialogue]: Format as Speaker: "line" for each sentence. Only include dialogue for THIS segment.

Respond ONLY with the JSON object, no other text.`
}
