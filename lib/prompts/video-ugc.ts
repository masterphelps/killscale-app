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
After writing the dialogue, estimate the VIDEO duration needed. The video engine renders speech MUCH FASTER than natural pace — roughly 5 words per second (NOT real-time speaking pace). Count the total words in your dialogue and divide by 5 to get the video duration. Return this as "estimatedSeconds". CRITICAL: Most UGC ads should be 8-15 seconds (1-2 segments). Only go to 22+ seconds if the product genuinely requires extended explanation.

VIDEO SEGMENTATION:
The video engine generates an 8-second base clip. The FIRST ~1 SECOND is a still product image (no presenter) and the LAST ~1 SECOND transitions out. So the first segment has ~6 USABLE SECONDS. Extensions are 7 seconds each with ~6 usable. Valid total durations: 8, 15, 22, 29 seconds.

IMPORTANT: Budget dialogue so the first segment fits ~30 words (6 usable seconds × 5 words/sec). Leave breathing room — better to finish 0.5s early than have the last word cut off.

If your estimated duration is 8 seconds or less:
- Write a single prompt covering the full video.
- Do NOT include "extensionPrompts".
- First segment: ~30 words MAX of dialogue.

If your estimated duration is more than 8 seconds:
- The "prompt" field must cover ONLY the first 8 seconds (~30 words of dialogue).
- Include an "extensionPrompts" array with one prompt per 7-second extension segment.
- Each extension prompt MUST start with "Continue from previous shot." and lock the visual context (same presenter, wardrobe, lighting, setting).
- Each extension describes ONLY what happens in that 7-second segment (~30 words of dialogue per extension).
- The number of extension prompts should match: ceil((estimatedSeconds - 8) / 7).
- AIM FOR FEWER EXTENSIONS. A tight 15-second UGC ad (1 extension) is almost always better than a rambling 29-second one.

PRODUCT VISIBILITY RULE:
- The product from the reference image must NEVER be altered, distorted, or morphed by the AI. Same shape, colors, text, proportions at all times.
- If the product is a WEARABLE (glasses, clothing, jewelry, watch, headphones, hat, etc.) or something the presenter KEEPS ON THEIR BODY, the presenter should CONTINUE wearing/using it through ALL segments — do NOT remove it.
- If the product is a HOLDABLE item (bottle, package, device, tube, etc.), the presenter should naturally set it down or move past it after the first segment. Extension segments focus on the presenter talking to camera about results and recommendations.
- Follow the user's additional direction notes above all else — if they say "keep holding the product" or "leave the glasses on," respect that through every segment.

OUTPUT FORMAT (JSON):
{
  "prompt": "Flowing prose Veo video prompt. NO block headers like [Scene] or [Subject] — Veo performs better with natural descriptive paragraphs. Weave together the scene, subject, action, mood, technical details, and dialogue into one cohesive paragraph. Be detailed and specific.",
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
  "extensionPrompts": ["Only if estimatedSeconds > 8. One prompt per 7-second extension. Each must be flowing prose, no block headers."]
}

PROMPT WRITING GUIDELINES:
Write the "prompt" field as flowing natural prose. Describe the ${setting} environment in detail — lighting, time of day, atmosphere, background. Describe the ${gender} presenter — age (${ageDesc}), wearing ${clothing} clothing${features?.length ? `, with ${features.join(', ').toLowerCase()}` : ''}. Include beat-by-beat action, ${tone} mood and energy, and specify "Vertical 9:16 portrait. Natural UGC aesthetic. Selfie-style camera with subtle movement." Include the dialogue inline as the presenter speaking: Speaker: "line". The product from the reference image must remain completely unchanged — same shape, colors, text, and proportions. Weave all these details into one flowing paragraph — do NOT use block headers like [Scene], [Subject], etc.

Respond ONLY with the JSON object, no other text.`
}
