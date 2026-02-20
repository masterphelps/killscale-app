/**
 * Image Adjustment Prompts
 *
 * Prompt template for modifying existing advertisement images
 * via Gemini, preserving the product/subject while applying
 * user-requested changes.
 *
 * Extracted from: app/api/creative-studio/adjust-image/route.ts
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

export function buildAdjustImagePrompt(adjustmentPrompt: string): string {
  return `Here is an advertisement image. Please modify it according to these instructions:

"${adjustmentPrompt}"

Requirements:
- Keep the same product/subject from the original image
- Maintain professional ad quality
- Apply the requested changes accurately
- Keep any text that was in the original (unless asked to change it)
- Output a high-resolution image
- Make sure all text fits in the image section where it's placed
- Ensure no cutoff sentences or words
- Any text must be spelled correctly

Generate the modified advertisement image.`
}
