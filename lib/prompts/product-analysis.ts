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
  return `Analyze this product/service page and extract ONLY information that is explicitly stated on the page. DO NOT guess, infer, or fabricate any details.

CRITICAL RULES:
- ONLY include information you can directly find in the page content below
- If a field's information is not on the page, set it to null or an empty array
- DO NOT invent features, benefits, prices, or descriptions based on the URL or product name
- If the page content is very short or mostly empty (JavaScript-rendered sites often return minimal HTML), say so — set "pageQuality" to "minimal" and only fill in what you can actually see
- Quote or closely paraphrase actual text from the page — do not embellish

URL: ${url}

META TAGS:
${metaTags}

PAGE CONTENT:
${truncatedText}${imageContext}

Extract and return a JSON object with these fields:
- pageQuality: "rich" if the page has substantial readable content, "minimal" if mostly empty/JS-rendered, "moderate" if some content but sparse
- name: Product/service name (from page title, og:title, or heading — NOT guessed from URL)
- description: Brief product description ONLY using text found on the page (2-3 sentences, or null if not found)
- price: Price if explicitly shown on the page (or null)
- currency: Currency code if price found (or null)
- features: Array of up to 10 features/benefits ACTUALLY LISTED on the page (empty array if none found)
- brand: Brand name if stated on the page
- category: Product category based on what the page says (not guessed from URL)
- uniqueSellingPoint: The main differentiator IF stated on the page (or null)
- targetAudience: Who this product is for IF the page says so (or null)
- imageUrl: The main product image URL (from og:image meta tag or primary product image)
- images: Array of up to 8 product-relevant image objects from the IMAGES FOUND ON PAGE list. Each: { "url": "full URL", "description": "what the image shows", "type": "product|screenshot|lifestyle|hero|packaging" }. Pick the HIGHEST RESOLUTION version — look for URLs without size suffixes like "_100x", "-150x150", or "?width=200". Prefer: product photos on white/clean background, lifestyle shots, detail shots. SKIP: thumbnails, icons, logos, decorative backgrounds, SVGs.
- benefits: Array of up to 5 customer-facing benefits FOUND ON THE PAGE (empty array if none stated)
- painPoints: Array of up to 3 problems mentioned on the page (empty array if none stated)
- testimonialPoints: Array of up to 3 actual testimonial quotes from the page (empty array if no testimonials found — DO NOT make these up)
- keyMessages: Array of up to 3 marketing headlines/taglines actually on the page (empty array if none found)
- motionOpportunities: Array of up to 5 ways this product could be shown in motion, based on what you learned about the actual product (only if you have enough real info)
- sensoryDetails: Array of up to 5 tactile/visual/sensory qualities based on actual product descriptions on the page (empty array if product details are too sparse)
- visualHooks: Array of up to 3 visual ad concepts based on what the product actually is (only if you have enough real info)

Respond ONLY with the JSON object, no other text.`
}
