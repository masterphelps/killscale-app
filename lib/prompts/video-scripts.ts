import type { VideoStyle } from '@/remotion/types'

export const STYLE_DESCRIPTIONS: Record<VideoStyle, string> = {
  talking_head: 'Selfie-POV, direct to camera. Bathroom or apartment. Person holds product up at key moment. Handheld feel, chest-up framing, eye contact. UGC energy.',
  lifestyle: 'Golden hour outdoor or sunlit room. Product in natural use. Aspirational but real. No dialogue — visuals carry the story.',
  product_showcase: 'Dark studio, single light beam. Product on display. Slow orbit or push-in. No people, no dialogue — just the product.',
  interview: 'Living room or office. Person looks off-camera answering questions, then turns to camera for the key line. Documentary feel.',
  unboxing: 'Clean desk, warm light. Top-down opening shot. Hands open the package, product emerges. Satisfying pacing. No dialogue.',
  before_after: 'Same location, two states. Before: dull and flat. Transition. After: vibrant and alive. Product appears at the pivot moment.',
  testimonial: 'Real location (kitchen, bathroom, car). Handheld selfie feel. Person is enthusiastic and imperfect. Raw UGC energy.',
  b_roll: 'Multi-angle product footage. Different angles and close-ups. No people, no dialogue. Music-driven.',
}

// Style-specific example outputs — direct, not over-polished
export const STYLE_EXAMPLES: Partial<Record<VideoStyle, string>> = {
  talking_head: `EXAMPLE of good talking_head output:
{
  "scene": "Clean bathroom, warm light from above.",
  "subject": "Guy in his 30s, stubble, casual shirt. Selfie mode, chest-up.",
  "action": "Looks into camera, starts talking. Says \\"Alright — this stuff? The real deal.\\" Holds product up near face, tilts to show label. Says \\"Smells incredible and it actually works.\\" Points at camera. Says \\"You need to try this.\\"",
  "product": "Product held up near face — label visible.",
  "mood": "Warm, authentic UGC energy. Conversational."
}`,
  product_showcase: `EXAMPLE of good product_showcase output:
{
  "scene": "Dark studio, single light beam from upper-right. Black background.",
  "subject": "",
  "action": "Product sits in darkness, light slowly reveals it from left to right. Camera slowly orbits 180 degrees. Push in to close-up showing texture detail. Pull back to final hero shot.",
  "product": "Product lit dramatically, every detail visible.",
  "mood": "Dark, premium, high-contrast. No dialogue."
}`,
  testimonial: `EXAMPLE of good testimonial output:
{
  "scene": "Real kitchen, morning light from window. Coffee mug and clutter in background.",
  "subject": "Woman in her 30s, hair pulled back. Not an actor.",
  "action": "Handheld selfie, slight wobble. Says \\"OK I have to tell you about this.\\" Grabs product from counter, holds it up. Says \\"I've been using this for two weeks and honestly? Game changer.\\" Smiles, nods. Says \\"Just get it. Trust me.\\" Points at camera.",
  "product": "Product grabbed casually from counter mid-sentence.",
  "mood": "Raw UGC, phone-quality feel. Genuine enthusiasm."
}`,
}

interface BuildVideoScriptPromptParams {
  productContext: string
  videoStyle: VideoStyle
  styleDesc: string
  styleExample: string
  hasDialogue: boolean
}

export function buildVideoScriptPrompt({
  productContext,
  videoStyle,
  styleDesc,
  styleExample,
  hasDialogue,
}: BuildVideoScriptPromptParams): string {
  return `You are a video ad creative director. Generate 3 video script concepts for an AI video model (Veo/Sora).

IMPORTANT — WRITE DIRECT, NOT CINEMATIC:
Write all descriptions in direct, casual language. Like you're telling someone what happens in the video.
Do NOT over-polish with flowery prose. Veo works best with straightforward descriptions.

GOOD action: "Camera slowly orbits the product on a dark surface. Push in to close-up showing texture. Pull back to hero shot."
BAD action: "The camera embarks on an elegant 180-degree orbit, its movement deliberate and measured, as rim light traces the product's silhouette with exquisite precision, revealing every nuanced contour..."

PRODUCT:
${productContext}

VIDEO STYLE: ${videoStyle.replace(/_/g, ' ')} — ${styleDesc}

Generate 3 unique concepts, each with a DIFFERENT creative angle. 8-12 seconds each.

For each concept:
1. "title": 2-4 word concept name
2. "summary": 1-2 sentence creative direction
3. "whyItWorks": 1 sentence on why this works
4. "script": Object with these sections (keep each section SHORT and DIRECT):

   - "scene": Where it happens and what the lighting looks like. 1-2 sentences max.

   - "subject": Person description if applicable. Leave "" for product_showcase and b_roll.

   - "action": What happens, beat by beat. Camera movements included naturally. ${hasDialogue ? 'Include exact dialogue in double quotes. Example: Says "This changed everything for me."' : 'No dialogue for this style.'}

   - "product": When and how the product appears. 1-2 sentences.

   - "mood": Color feel, energy level, sound. 1 sentence.

RULES:
- Include camera directions naturally in action (dolly, orbit, push-in, etc.) — don't over-describe them
- ${hasDialogue ? 'Dialogue MUST use double quotes ("), never single quotes' : 'No dialogue for this style'}
- Each concept: genuinely different angle
- Keep scripts tight — 8-12 second ads, not documentaries
- Stay true to the ${videoStyle.replace(/_/g, ' ')} style
${styleExample ? `\n${styleExample}` : ''}
Return JSON: { "concepts": [...] }
Each concept: { "title": string, "summary": string, "whyItWorks": string, "script": { "scene": string, "subject": string, "action": string, "product": string, "mood": string } }

Respond ONLY with the JSON object.`
}
