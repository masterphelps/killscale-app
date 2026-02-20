/**
 * Ad Copy Generation Prompts
 *
 * Extracted from:
 *   - app/api/creative-studio/generate-from-competitor/route.ts (competitor + refresh modes)
 *   - app/api/creative-studio/generate-from-product/route.ts (product-only mode)
 */

export interface ProductInfo {
  name: string
  description?: string
  price?: string
  currency?: string
  features?: string[]
  brand?: string
  category?: string
  uniqueSellingPoint?: string
  targetAudience?: string
}

export interface CompetitorAdCopyParams {
  competitorCopy: string
  pageName: string
  productContext: string
}

export interface RefreshAdCopyParams {
  competitorCopy: string
  productContext: string
}

export interface ProductAdCopyParams {
  productContext: string
  hasImage: boolean
}

/**
 * Build the shared product context block used across all ad copy prompts.
 *
 * The `skipPlaceholderName` option (used by generate-from-product) filters out
 * the "Custom Product" placeholder name that appears when users enter product
 * details manually without a URL scrape.
 */
export function buildProductContext(
  product: ProductInfo,
  options?: { skipPlaceholderName?: boolean }
): string {
  const hasRealName = options?.skipPlaceholderName
    ? product.name && product.name !== 'Custom Product'
    : !!product.name

  return [
    hasRealName ? `Name: ${product.name}` : null,
    product.brand && product.brand !== product.name ? `Brand: ${product.brand}` : null,
    product.description ? `Description: ${product.description}` : null,
    product.price ? `Price: ${product.currency || '$'}${product.price}` : null,
    product.category ? `Category: ${product.category}` : null,
    product.uniqueSellingPoint ? `Unique Selling Point: ${product.uniqueSellingPoint}` : null,
    product.features?.length ? `Key Features:\n${product.features.map(f => `- ${f}`).join('\n')}` : null,
    product.targetAudience ? `Target Audience: ${product.targetAudience}` : null,
  ].filter(Boolean).join('\n')
}

/**
 * Standard competitor-inspired ad copy prompt.
 * Analyzes a competitor ad and generates 4 variations for the user's product.
 */
export function buildCompetitorAdCopyPrompt(params: CompetitorAdCopyParams): string {
  const { competitorCopy, pageName, productContext } = params

  return `You are an expert Facebook/Instagram ad copywriter. Analyze this competitor ad and create new ad copy variations for a different product.

COMPETITOR AD (from ${pageName}):
${competitorCopy}

MY PRODUCT:
${productContext}

Generate 4 unique ad copy variations inspired by the competitor's approach but for MY product. Each variation should use a different angle/hook. Use the specific product details, features, and price point in the copy where relevant.

For each variation, provide:
1. angle: A 2-3 word description of the angle (e.g., "Social Proof", "FOMO/Urgency", "Problem-Solution", "Testimonial Style")
2. headline: A compelling headline (under 40 characters)
3. primaryText: The main ad copy (2-4 short paragraphs, use emojis sparingly, include a clear CTA)
4. description: A short link description (under 30 characters)
5. whyItWorks: One sentence explaining why this approach works

Respond ONLY with a valid JSON array of 4 objects with these exact fields: angle, headline, primaryText, description, whyItWorks

Do not include any other text, markdown, or explanation - just the JSON array.`
}

/**
 * Creative fatigue refresh prompt.
 * Takes a winning ad that is fatiguing and generates fresh variations that
 * preserve the core value proposition with completely new hooks and framing.
 */
export function buildRefreshAdCopyPrompt(params: RefreshAdCopyParams): string {
  const { competitorCopy, productContext } = params

  return `You are an expert Facebook/Instagram ad copywriter. This is a winning ad for a product that is showing signs of creative fatigue. Create fresh variations that preserve the core value proposition and winning angle, but with completely new hooks, framing, and language.

ORIGINAL AD COPY:
${competitorCopy}

MY PRODUCT:
${productContext}

The audience has seen the original ad too many times — surprise them while keeping what works. Generate 4 unique ad copy variations that refresh this ad's approach. Each variation should keep the core value proposition but change the hook, framing, and execution style.

For each variation, provide:
1. angle: A 2-3 word description of the angle (e.g., "Fresh Hook", "New Framing", "Flip the Script", "Reframe Value")
2. headline: A compelling headline (under 40 characters) — must be noticeably different from the original
3. primaryText: The main ad copy (2-4 short paragraphs, use emojis sparingly, include a clear CTA) — same value proposition, completely new language
4. description: A short link description (under 30 characters)
5. whyItWorks: One sentence explaining why this fresh approach works

Respond ONLY with a valid JSON array of 4 objects with these exact fields: angle, headline, primaryText, description, whyItWorks

Do not include any other text, markdown, or explanation - just the JSON array.`
}

/**
 * Product-only ad copy prompt (no competitor reference).
 * Generates 4 variations from product info alone, optionally informed by a
 * product image when `hasImage` is true (the image is sent as a separate
 * multimodal content block by the caller).
 */
export function buildProductAdCopyPrompt(params: ProductAdCopyParams): string {
  const { productContext, hasImage } = params

  return `You are an expert Facebook/Instagram ad copywriter. Create compelling ad copy variations for this product.

MY PRODUCT:
${productContext}
${hasImage ? '\nA product image is also attached — use what you see in the image to inform the ad copy (product appearance, colors, branding, use case, etc.).' : ''}

Generate 4 unique ad copy variations for this product. Each variation should use a different angle/hook to appeal to different customer motivations. Use the specific product details, features, and price point in the copy where relevant.

Advertising angles to consider:
- Social Proof / Testimonial style
- Problem-Solution (what pain does this solve?)
- FOMO / Urgency / Scarcity
- Benefit-focused (what transformation does the customer get?)
- Curiosity / Pattern interrupt
- Authority / Expert endorsement
- Emotional appeal
- Value proposition / ROI

For each variation, provide:
1. angle: A 2-3 word description of the angle (e.g., "Social Proof", "FOMO/Urgency", "Problem-Solution", "Benefit-Focused")
2. headline: A compelling headline (under 40 characters)
3. primaryText: The main ad copy (2-4 short paragraphs, use emojis sparingly, include a clear CTA)
4. description: A short link description (under 30 characters)
5. whyItWorks: One sentence explaining why this approach works

Respond ONLY with a valid JSON array of 4 objects with these exact fields: angle, headline, primaryText, description, whyItWorks

Do not include any other text, markdown, or explanation - just the JSON array.`
}
