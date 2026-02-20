import type { VideoStyle } from '@/remotion/types'

export const STYLE_DESCRIPTIONS: Record<VideoStyle, string> = {
  talking_head: 'Selfie-POV direct-to-camera address. Warm bathroom or apartment setting, shallow DOF, vanity lighting from above. Subtle handheld sway — authentic, not stabilized. Chest-up framing, direct eye contact throughout. Person holds product up near face at key moment. Beat-by-beat pacing with natural pauses. UGC energy with cinematic lighting.',
  lifestyle: 'Golden hour outdoor or sunlit apartment. Slow dolly-in establishing shot, rack focus from environment to product during natural use. Warm backlight with soft rim glow. Aspirational but attainable. No dialogue — the visuals and music carry the story. Every frame should feel like a photo you would save.',
  product_showcase: 'Dark studio, single dramatic beam through atmospheric haze. Product emerges from darkness via rim light. Slow orbit reveals form, dolly to extreme macro for texture detail, pull back to hero shot with key light bloom. No people, no dialogue — pure product worship. Luxury commercial energy.',
  interview: 'Living room or home office with warm bokeh practicals in background. Side window key light, shallow DOF. Static medium shot with subtle reframe. Person looks off-camera answering questions, then turns to camera for the key statement — a deliberate, powerful shift. Documentary authenticity with slight grain.',
  unboxing: 'Clean desk, warm directional light from upper-left. Top-down opening shot transitions to 45-degree angle at reveal. Deliberate ASMR-adjacent pacing — every movement is satisfying. Product emerges and catches the light. Push-in to hero shot. No dialogue, pure tactile sensory experience.',
  before_after: 'Same location, two states. Before: desaturated, flat, cool lighting. Whip-pan or dissolve transition. After: vibrant, warm, beautifully lit. Static matching frames in both halves. Product appears at the pivot moment. The contrast is visceral — you feel the difference before you process it.',
  testimonial: 'Real-world location (kitchen, bathroom, car). Handheld selfie with camera wobble and auto-focus shifts — feels like a real phone recording. Raw UGC energy. Person is enthusiastic and imperfect, natural stumbles and self-corrections. The authenticity IS the production value.',
  b_roll: 'Cinematic multi-angle product film. Slow dolly establishing shot, crane to product, rack focus from foreground element to sharp detail. Macro insert for texture and material. Gentle orbit with rim light tracing edges. Atmospheric elements (steam, dust motes, water). Music-driven, no dialogue. Every frame is a photograph.',
}

// Style-specific example outputs for the most common styles
// These give Claude a concrete quality target
export const STYLE_EXAMPLES: Partial<Record<VideoStyle, string>> = {
  talking_head: `EXAMPLE of excellent talking_head output:
{
  "scene": "Clean modern bathroom. Warm vanity lighting from above casting soft golden shadows on marble tile. Shallow depth of field — fixtures dissolve into creamy bokeh. Slightly steamy atmosphere, morning light feel.",
  "subject": "Man in his 30s with well-groomed stubble. Filming himself in selfie mode, chest-up framing. Direct eye contact with camera lens. Casual henley shirt, natural and approachable.",
  "action": "Beat 1: Looks into camera with a knowing expression, begins speaking with natural energy. Subtle handheld sway. Says \\"Alright — this stuff? The real deal.\\" Beat 2: Holds up product near his face so label is visible, tilts it to catch the vanity light. Says \\"Smells incredible and it actually works.\\" Beat 3: Runs free hand along his jawline confidently. Points at camera with a knowing nod. Says \\"You need to try this.\\"",
  "product": "Product held up near face at beat 2 — label and branding clearly visible. Glass and texture catch the warm vanity light. Product feels like a natural extension, not a prop.",
  "mood": "Warm amber tones, authentic UGC energy. Selfie POV slightly above eye level. Conversational pacing with brief natural pauses between beats. No background music — just natural voice and ambient bathroom reverb."
}`,
  product_showcase: `EXAMPLE of excellent product_showcase output:
{
  "scene": "Dark studio environment. Single dramatic beam of light cutting through atmospheric haze from upper-right. Deep black background. Product floats in a pool of sculpted light.",
  "subject": "",
  "action": "Opening: Product silhouette emerges from total darkness, rim light slowly traces the contour from left to right. Slow 180-degree orbit begins. Mid: Dolly in to extreme macro — surface texture fills the frame, light rakes across at a low angle emphasizing every detail. Closing: Pull back to hero shot, dramatic key light blooms across the product face. Two-second hold on the final beauty frame.",
  "product": "Product shot like a luxury watch commercial — every surface detail, texture, and material visible. Rim light separates from background. Hero lighting at the finale makes it look premium.",
  "mood": "Dramatic, high-end commercial energy. Strong contrast, razor-sharp focus. Atmospheric haze adds depth. Deep shadows, bright highlights, no middle ground. No dialogue, no music — pure visual impact."
}`,
  testimonial: `EXAMPLE of excellent testimonial output:
{
  "scene": "Real kitchen — morning light from window over the sink. Unpolished background with coffee mug, fruit bowl, everyday clutter. Nothing staged.",
  "subject": "Woman in her 30s, hair pulled back casually. Slightly nervous energy that reads as genuine. Not an actor — that is the entire appeal.",
  "action": "Opening: Handheld selfie framing, auto-focus shift as she starts talking with raw energy. Slight camera wobble. Says \\"OK I have to tell you about this.\\" Mid: Grabs product from counter, holds it up enthusiastically. Says \\"I've been using this for two weeks and honestly? Game changer.\\" Closing: Genuine smile, emphatic nod. Says \\"Just get it. Trust me.\\" Points at camera.",
  "product": "Product grabbed from kitchen counter mid-sentence — not perfectly lit, not perfectly framed. The casual handling IS the credibility.",
  "mood": "Raw, unfiltered UGC. Phone-quality feel with natural compression. Slightly blown highlights from the window. Enthusiastic, genuine — the kind of video a friend texts you. Natural voice only."
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
  return `You are an expert video ad creative director specializing in social media ads generated by AI video models (like Sora). Your scripts include cinematic camera directions, specific lighting setups, and beat-by-beat temporal pacing — never vague or generic descriptions.

PRODUCT:
${productContext}

VIDEO STYLE: ${videoStyle.replace(/_/g, ' ')} — ${styleDesc}

Generate 3 unique video script concepts, each with a DIFFERENT creative angle/hook. The scripts should be 8-12 seconds of content (2-3 tight beats for 8s, 3-4 beats with room to breathe for 12s).

For each concept, provide:
1. "title": 2-4 word concept name (e.g., "Morning Ritual", "The Reveal")
2. "summary": 1-2 sentence description of the creative direction
3. "whyItWorks": 1 sentence on why this angle resonates with the target audience
4. "script": An object with 5 sections. HERE IS WHAT GOES IN EACH:

   - "scene": The physical environment AND lighting setup. Include: location details, light source direction and color temperature, depth of field, atmospheric elements (haze, steam, dust motes). Think cinematographer, not set decorator.

   - "subject": Person description if applicable. Include: age range, appearance, wardrobe, framing (chest-up, full body, hands only). Leave empty string "" for product_showcase and b_roll styles.

   - "action": Beat-by-beat visual sequence WITH camera movements. Structure as "Beat 1: ... Beat 2: ... Beat 3: ..." or "Opening: ... Mid: ... Closing: ...". Include specific camera directions (dolly, rack focus, orbit, push-in, crane, handheld sway). ${hasDialogue ? 'Include SPECIFIC dialogue the person says — drawn from the product\'s actual benefits and customer talking points. Write the exact words in double quotes. Example: Says "This changed everything for me." NOT "person talks about the product".' : 'Describe specific camera movements, transitions, and visual moments. No dialogue for this style.'}

   - "product": How the product appears visually. Include: when it enters frame, how it catches the light, what details are visible (branding, texture, material). The product should feel intentionally lit and composed.

   - "mood": Overall feel including: color grade direction (warm amber, cool blue, desaturated-to-vibrant), energy level, sound design (ambient, music style, natural audio), and the emotional takeaway for the viewer.

CRITICAL RULES:
- EVERY "action" section must include camera movement language (dolly, rack focus, push-in, orbit, crane, handheld, static with reframe, etc.)
- EVERY "scene" section must specify lighting direction and quality (not just "good lighting" — say where the light comes from and what it does)
- The "action" section must be product-SPECIFIC. Reference actual features, benefits, and use cases from the product info above.
- ALL dialogue MUST use double quotes ("), never single quotes ('). Example: Says "I love this" — NOT 'I love this'. Critical for downstream processing.
- Keep language positive and professional. Avoid aggressive or negative words. Use positive alternatives: create, build, discover, analyze, optimize, win, grow, succeed.
- Each concept must have a genuinely different angle (not just different wording of the same idea).
- Stay true to the ${videoStyle.replace(/_/g, ' ')} format — don't drift into a different style.
- Keep scripts tight — these are 8-12 second ads, not documentaries.
${styleExample ? `\n${styleExample}\n\nMatch this quality level. Your output should be equally specific and cinematic.` : ''}
Return a JSON object: { "concepts": [...] }
Each concept: { "title": string, "summary": string, "whyItWorks": string, "script": { "scene": string, "subject": string, "action": string, "product": string, "mood": string } }

Respond ONLY with the JSON object, no other text.`
}
