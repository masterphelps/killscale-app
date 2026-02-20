/**
 * Image Generation Prompts
 *
 * All prompt-building logic for AI ad image generation via Gemini.
 * Includes: dual-image (product + reference), reference-only, product-only,
 * custom direction, text-only, bold, refresh, and clone modes.
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ImagePromptRequest {
  adCopy: {
    headline: string
    primaryText: string
    description?: string
    angle: string
  }
  product: {
    name: string
    description?: string
    category?: string
    brand?: string
    imageBase64?: string
    imageMimeType?: string
  }
  referenceAd?: {
    imageBase64: string
    imageMimeType: string
  }
  style?: 'clone' | 'lifestyle' | 'product' | 'minimal' | 'bold' | 'refresh'
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9'
  imagePrompt?: string
  isRefresh?: boolean
}

export interface CuratedAdText {
  headline: string
  supportingLine: string
}

// ── Constants ──────────────────────────────────────────────────────────────

export const TEXT_REQUIREMENTS = `
- Make sure all text fits in the image section where it's placed
- Ensure no cutoff sentences or words
- Any text must be spelled correctly
- Do NOT include any labels like "Headline:", "Head:", "Supporting Line:", etc. — render ONLY the actual text itself`

// ── Reference Ad Analysis ──────────────────────────────────────────────────

export const ANALYZE_REFERENCE_AD_PROMPT = `Describe this ad's VISUAL FORMAT in one concise paragraph. Focus on:
- Is it photography, graphic design, illustration, or mixed?
- Color palette (specific colors like "deep purple", "neon green")
- Layout (text placement, product placement, composition)
- Typography style (bold/thin, serif/sans, size hierarchy)
- Background treatment (solid color, gradient, photo, pattern)
- Overall mood (bold/minimal/elegant/playful/corporate)

Be specific and visual. Example: "Bold graphic design ad with solid deep purple background, large white sans-serif headline centered top, product photo bottom-right with drop shadow, neon green accent bar, high contrast with no photography."

Reply with ONLY the description, nothing else.`

// ── Text Curation ──────────────────────────────────────────────────────────

export function buildCurateAdTextPrompt(headline: string, primaryText: string): string {
  return `You're creating an ad image. Pick the BEST single supporting line from this ad copy to pair with the headline.

HEADLINE: ${headline}

FULL COPY:
${primaryText}

Rules:
- Pick ONE short, punchy line (under 60 characters ideal)
- It should be impactful and work visually on an ad image
- Don't pick the first line if there's a better hook deeper in the copy
- Look for lines with rhythm, power words, or emotional punch

Reply with ONLY the supporting line, nothing else. No quotes, no explanation.`
}

export function extractBestLine(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 80)
  const powerLine = lines.find(l =>
    l.includes('Every') || l.includes('That\'s why') || l.includes('Your') ||
    l.includes('100%') || l.includes('fresh') || l.includes('difference')
  )
  return powerLine || lines[0] || ''
}

// ── Dual Image Prompt (product + reference ad) ────────────────────────────

export function buildDualImagePrompt(req: ImagePromptRequest, curatedText: CuratedAdText, styleDescription?: string | null): string {
  const { product, style = 'clone' } = req

  if (style === 'clone') {
    const styleBlock = styleDescription
      ? `\nTHE REFERENCE AD'S VISUAL STYLE (analyzed):\n${styleDescription}\n\nYou MUST replicate this exact visual style. If it's a graphic design ad, create a graphic design ad — NOT a lifestyle photo. If it uses solid color backgrounds, use solid color backgrounds. Match the style precisely.`
      : ''

    return `TWO IMAGES ARE PROVIDED. READ THIS CAREFULLY:

IMAGE 1 (first image) = MY PRODUCT "${product.name}". This is the product you are advertising. You MUST extract this exact product — its shape, colors, packaging, and appearance — and place it prominently in the generated ad. This product MUST be clearly visible and recognizable in your output.

IMAGE 2 (second image) = STYLE REFERENCE ONLY. This is a competitor's ad. Copy ONLY its visual style (layout, colors, typography, composition). IGNORE the product shown in this image — do NOT use it.
${styleBlock}

#1 RULE: The generated ad MUST show MY PRODUCT from IMAGE 1. Not a generic product illustration. Not the competitor's product from IMAGE 2. The actual product from IMAGE 1. If my product is not clearly visible in your output, the task has failed.

STYLE TO CLONE (from IMAGE 2):
- Replicate the layout, composition, color palette, and background treatment
- Match the typography style and text positioning
- If IMAGE 2 is graphic design → create graphic design. If photography → match photography style
- Do NOT default to lifestyle photography unless IMAGE 2 uses it

AD TEXT (render exactly as written, no labels):
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"
- Do NOT use any text from IMAGE 2
- Spell exactly as provided${TEXT_REQUIREMENTS}

OUTPUT: An ad with MY PRODUCT (IMAGE 1) placed into the visual style of IMAGE 2, with the text above overlaid. Professional quality for Facebook/Instagram ads.`
  }

  if (style === 'refresh' || req.isRefresh) {
    return `TWO IMAGES ARE PROVIDED:

IMAGE 1 (first image) = MY PRODUCT "${product.name}". Extract this exact product and feature it in the new ad.

IMAGE 2 (second image) = THE CURRENT AD that has creative fatigue and needs a fresh version. Use this to understand what to change — make the new ad look DIFFERENT.

#1 RULE: The generated ad MUST show MY PRODUCT from IMAGE 1. Not the competitor's product, not a generic illustration — my actual product.

AD TEXT (render exactly as written, no labels):
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"
- Spell exactly as provided${TEXT_REQUIREMENTS}

REFRESH STRATEGY (make it look fresh vs IMAGE 2):
- Create a DIFFERENT composition, angle, color treatment, or background
- If IMAGE 2 uses warm tones → try cool tones. Centered → try off-center. Minimal → try environmental.
- Do NOT clone IMAGE 2's layout — change it deliberately
- The goal is to look fresh and new while maintaining brand quality

OUTPUT: A refreshed ad featuring MY PRODUCT (IMAGE 1) that looks clearly different from IMAGE 2 at first glance. Professional quality for Facebook/Instagram ads.`
  }

  if (style === 'bold') {
    return `TWO IMAGES ARE PROVIDED:

IMAGE 1 (first image) = MY PRODUCT "${product.name}". Extract this exact product and feature it prominently.

IMAGE 2 (second image) = STYLE REFERENCE. Use for bold style inspiration only. IGNORE the product in this image.

#1 RULE: The generated ad MUST show MY PRODUCT from IMAGE 1. Not the competitor's product from IMAGE 2.

Create a BOLD, scroll-stopping, pattern-interrupting advertisement:
- Feature MY PRODUCT from IMAGE 1 as the clear focal point
- Take inspiration from IMAGE 2 but make it MORE bold and attention-grabbing
- Vibrant colors, high contrast, dynamic composition

AD TEXT (render exactly as written, no labels):
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"
- Spell exactly as provided${TEXT_REQUIREMENTS}

OUTPUT: A bold, impossible-to-scroll-past ad featuring MY PRODUCT (IMAGE 1). Professional quality for Facebook/Instagram ads.`
  }

  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography, natural setting, warm and authentic feel',
    product: 'clean product photography, studio lighting, professional presentation',
    minimal: 'minimalist design, clean background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  return `TWO IMAGES ARE PROVIDED:

IMAGE 1 (first image) = MY PRODUCT "${product.name}". Extract this exact product and feature it prominently.

IMAGE 2 (second image) = STYLE REFERENCE. Use for general inspiration only. IGNORE the product in this image.

#1 RULE: The generated ad MUST show MY PRODUCT from IMAGE 1. Not the competitor's product from IMAGE 2.

STYLE: ${styleGuide}

AD TEXT (render exactly as written, no labels):
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"
- Spell exactly as provided${TEXT_REQUIREMENTS}

Create an ad that:
- Features MY PRODUCT from IMAGE 1 as the focal point
- Uses the ${style} visual style
- Takes general inspiration from IMAGE 2's approach

OUTPUT: A ${style} style ad featuring MY PRODUCT (IMAGE 1) with text overlaid. Professional quality for Facebook/Instagram ads.`
}

// ── Reference-Only Prompt (no product image) ──────────────────────────────

export function buildReferenceOnlyPrompt(req: ImagePromptRequest, curatedText: CuratedAdText, styleDescription?: string | null): string {
  const { product, style = 'clone' } = req

  if (style === 'clone') {
    const styleBlock = styleDescription
      ? `\nTHE REFERENCE AD'S VISUAL STYLE (analyzed):\n${styleDescription}\n\nYou MUST replicate this exact visual style. If it's a graphic design ad, create a graphic design ad — NOT a lifestyle photo. If it uses solid color backgrounds, use solid color backgrounds. Match the style precisely.`
      : ''

    return `I'm providing ONE image: a reference ad. CLONE this exact visual format and style for a new product.
${styleBlock}

PRODUCT TO ADVERTISE: ${product.name}
${product.description ? `Product description: ${product.description}` : ''}
${product.category ? `Category: ${product.category}` : ''}

CRITICAL TEXT INSTRUCTIONS - READ CAREFULLY:
The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

- Use ONLY the two lines of text above
- DO NOT use any text from the reference ad image
- DO NOT copy the reference ad's text - only its visual style
- Spell the text EXACTLY as provided - no changes

Create an advertisement that is a FAITHFUL CLONE of the reference ad's VISUAL FORMAT (not its text):
- EXACTLY match the reference ad's visual approach: if it's a graphic design ad with solid colors and bold typography, create the same. If it's photography-based, match that. Do NOT default to lifestyle photography.
- Copy the same layout, composition, color palette, background treatment, and typography style
- Match the reference ad's text STYLING and POSITIONING, but use MY text provided above
- Represent the product "${product.name}" — use your knowledge of this product type

Requirements:
- The output MUST look like it came from the same ad campaign as the reference
- Match the reference ad's format EXACTLY - this is a clone, not a reinterpretation
- If the reference uses graphic design (solid backgrounds, bold text, no photography), do NOT add lifestyle photography
- If the reference uses photography, match the photography style
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate an ad that clones the reference ad's visual format for "${product.name}" using MY provided text.`
  }

  if (style === 'refresh' || req.isRefresh) {
    return `I'm providing ONE image: the current ad that needs a fresh version.

PRODUCT: ${product.name}
${product.description ? `Description: ${product.description}` : ''}

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

- Use ONLY the two lines of text above
- Spell the text EXACTLY as provided - no changes

Create a FRESH advertisement that looks noticeably different from the reference:
- Create a DIFFERENT composition, angle, color treatment, or background
- The goal is to look fresh and new while maintaining brand consistency
- Do NOT clone the reference ad's layout — change it deliberately
- If the reference uses warm tones, try cool tones. If centered, try off-center.

Requirements:
- Must be clearly different from the reference ad at first glance
- Represent the product "${product.name}" prominently
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate an ad that refreshes the creative while keeping the same product and quality level.`
  }

  if (style === 'bold') {
    return `I'm providing ONE image: a reference ad. Use it as inspiration for a BOLD style ad.

PRODUCT: ${product.name}
${product.description ? `Description: ${product.description}` : ''}

Create a BOLD, scroll-stopping advertisement that:
- Takes inspiration from the reference but makes it MORE bold and attention-grabbing
- Uses vibrant colors, high contrast, and dynamic composition

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

Requirements:
- Make it impossible to scroll past
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Represent the product "${product.name}" prominently
- Professional quality suitable for Facebook/Instagram ads${TEXT_REQUIREMENTS}

Generate a bold, attention-grabbing ad for "${product.name}".`
  }

  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography, natural setting, warm and authentic feel',
    product: 'clean product photography, studio lighting, professional presentation',
    minimal: 'minimalist design, clean background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  return `I'm providing ONE image: a reference ad. Use it for general inspiration.

PRODUCT: ${product.name}
${product.description ? `Description: ${product.description}` : ''}

Create an advertisement with this style: ${styleGuide}

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

The ad should:
- Represent the product "${product.name}"
- Use the ${style} visual style
- Take general inspiration from the reference ad's approach

Requirements:
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate a ${style} style ad with text overlay for "${product.name}".`
}

// ── Product Image Only Prompt ─────────────────────────────────────────────

export function buildImagePrompt(req: ImagePromptRequest, curatedText: CuratedAdText): string {
  const { product, style = 'lifestyle' } = req

  if (style === 'bold') {
    return `Create a BOLD, scroll-stopping, pattern-interrupting advertisement image featuring this exact product: ${product.name}

Use the provided product image as reference - the generated image MUST feature this same product accurately.

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

Requirements:
- Make it impossible to scroll past - use vibrant colors, high contrast, dynamic angles
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Feature the product from the reference image prominently
- Professional quality suitable for Facebook/Instagram ads
- Eye-catching graphic design style, not just photography
- Bold typography that demands attention${TEXT_REQUIREMENTS}

Generate a scroll-stopping advertisement that makes people stop and look.`
  }

  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography setting, warm lighting, authentic feel, social media ad style',
    product: 'clean product photography, white or gradient background, professional studio lighting',
    minimal: 'minimalist design, solid color background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  return `Create a high-quality advertisement image featuring this exact product: ${product.name}

Use the provided product image as reference - the generated image MUST feature this same product accurately.

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

Visual style: ${styleGuide}

Requirements:
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Feature the product from the reference image prominently
- Professional quality suitable for Facebook/Instagram ads
- ${style === 'lifestyle' ? 'Show the product being used or in an appealing lifestyle context' : 'Focus on the product itself'}
- Photorealistic, high resolution${TEXT_REQUIREMENTS}

Generate an advertisement image with text overlay for this product.`
}

// ── Custom Direction Prompt (Create mode) ─────────────────────────────────

export function buildCustomPrompt(req: ImagePromptRequest, curatedText: CuratedAdText): string {
  const { product, imagePrompt } = req

  return `Create an advertisement image for this product: ${product.name}

Use the provided product image as reference - the generated image MUST feature this same product accurately.

USER'S CREATIVE DIRECTION:
"${imagePrompt}"

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

Requirements:
- Follow the user's creative direction above
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Feature the product from the reference image prominently
- Professional quality suitable for Facebook/Instagram ads
- High resolution output${TEXT_REQUIREMENTS}

Generate an advertisement image with text overlay.`
}

// ── Text-Only Prompt (no images at all) ───────────────────────────────────

export function buildTextOnlyPrompt(req: ImagePromptRequest, curatedText: CuratedAdText): string {
  const { product, style = 'lifestyle' } = req

  if (style === 'bold') {
    return `Create a BOLD, scroll-stopping, pattern-interrupting advertisement image for: ${product.name}

Product details:
- Category: ${product.category || 'consumer product'}
- Brand: ${product.brand || product.name}
${product.description ? `- Description: ${product.description}` : ''}

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

Requirements:
- Make it impossible to scroll past - use vibrant colors, high contrast, dynamic angles
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Feature or represent the product prominently
- Professional quality suitable for Facebook/Instagram ads
- Eye-catching graphic design style, not just photography
- Bold typography that demands attention${TEXT_REQUIREMENTS}

Generate a scroll-stopping advertisement that makes people stop and look.`
  }

  const styleDescriptions: Record<string, string> = {
    lifestyle: 'lifestyle photography, person using the product naturally, warm lighting, authentic feel',
    product: 'clean product photography, white or gradient background, professional studio lighting',
    minimal: 'minimalist design, solid color background, modern aesthetic',
  }

  const styleGuide = styleDescriptions[style] || styleDescriptions.lifestyle

  return `Create a high-quality advertisement image for: ${product.name}

Product details:
- Category: ${product.category || 'consumer product'}
- Brand: ${product.brand || product.name}
${product.description ? `- Description: ${product.description}` : ''}

The ad text MUST be exactly:
Line 1 (big/bold text): "${curatedText.headline}"
Line 2 (smaller supporting text): "${curatedText.supportingLine}"

Visual style: ${styleGuide}

Requirements:
- Include ONLY the two lines of text above - no other text, no labels
- Spell the text EXACTLY as provided
- Professional quality suitable for Facebook/Instagram ads
- Photorealistic, high resolution${TEXT_REQUIREMENTS}

Generate an advertisement image with text overlay.`
}
