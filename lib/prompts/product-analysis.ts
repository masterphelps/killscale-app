/**
 * Product Analysis Prompts
 *
 * Prompt for extracting comprehensive product information from a URL's
 * HTML content using Claude. Covers name, description, features,
 * benefits, pain points, testimonial points, motion opportunities,
 * sensory details, visual hooks, and image identification.
 *
 * Extracted from: app/api/creative-studio/analyze-product-url/route.ts
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

export function buildProductAnalysisPrompt(
  url: string,
  metaTags: string,
  truncatedText: string,
  imageContext: string,
): string {
  return `Analyze this product/service page and extract comprehensive information. Read the ENTIRE page content carefully — features, benefits, and details may appear throughout.

URL: ${url}

META TAGS:
${metaTags}

PAGE CONTENT:
${truncatedText}${imageContext}

Extract and return a JSON object with these fields:
- name: Product/service name
- description: Brief product description (2-3 sentences covering what it does and who it's for)
- price: Price if visible (or null)
- currency: Currency code (USD, EUR, etc.) or null
- features: Array of up to 10 key features/benefits found anywhere on the page
- brand: Brand name if different from product name
- category: Product category (e.g., "fitness equipment", "SaaS", "skincare", "clothing")
- uniqueSellingPoint: The main thing that makes this product special
- targetAudience: Who this product is for (1 sentence)
- imageUrl: The main product image URL (from og:image meta tag or primary product image)
- images: Array of up to 8 product-relevant image objects. Each: { "url": "full URL", "description": "what the image shows", "type": "product|screenshot|lifestyle|hero|packaging" }. Pick the HIGHEST RESOLUTION version of each product image — look for URLs without size suffixes like "_100x", "-150x150", or "?width=200". Prefer: product photos on white/clean background, lifestyle shots showing the product in use, detail/macro shots. SKIP: thumbnails, icons under 200px, logos, decorative backgrounds, tiny UI elements, SVGs. From the IMAGES FOUND ON PAGE list, identify which ones are product-relevant and highest quality.
- benefits: Array of up to 5 customer-facing benefits (phrased as outcomes the customer gets, e.g., "Launch campaigns in under 60 seconds")
- painPoints: Array of up to 3 problems this product solves (phrased as frustrations, e.g., "Hours wasted in Ads Manager")
- testimonialPoints: Array of 3 lines that a satisfied customer would say about this product (authentic UGC style, first person, e.g., "I used to spend hours in Ads Manager. KillScale cut that to under a minute.")
- keyMessages: Array of 3 short punchy hook lines for ads (scroll-stopping, e.g., "Make ads like a pro, scale them like a boss")
- motionOpportunities: Array of up to 5 ways this product could be shown in motion or physical interaction (e.g., "Pouring creates a satisfying cascade", "Snapping the lid shut with a confident click", "Fabric draping and flowing over surfaces"). Think about what's physically INTERESTING about this product — what movements, textures, transformations, or interactions would look satisfying on camera.
- sensoryDetails: Array of up to 5 tactile/visual/sensory qualities (e.g., "Matte black finish with brushed metal accents", "Thick, creamy texture that holds its shape", "Translucent amber color that catches light"). Focus on textures, materials, colors, weight, sound.
- visualHooks: Array of up to 3 visual concepts that would stop someone scrolling (e.g., "Before/after transformation", "Satisfying pour in slow motion", "Macro shot revealing hidden detail"). Think about what would make someone pause their thumb.

Respond ONLY with the JSON object, no other text.`
}
