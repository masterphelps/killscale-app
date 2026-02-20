/**
 * Video Generation Prompts
 *
 * Prompt condensing logic for Runway's 1000-char limit.
 * Extracted from: app/api/creative-studio/generate-video/route.ts
 *
 * PROTECTED IP — changes require CODEOWNERS approval.
 */

/**
 * Condense a structured Sora/Veo prompt into ≤1000 chars for Runway.
 * Strips block headers, redundant adjectives, and technical directives
 * that Runway doesn't need, while preserving the core creative intent.
 */
export function condenseForRunway(prompt: string): string {
  if (prompt.length <= 1000) return prompt

  let condensed = prompt
    // Strip block headers like [Scene], [Action], [Mood & Atmosphere], [Technical], [Dialogue]
    .replace(/\[(?:Scene|Subject|Action|Product|Mood & Atmosphere|Technical|Dialogue)\]\n?/g, '')
    // Remove the Technical block entirely — Runway handles its own rendering
    .replace(/Vertical 9:16 portrait[^.]*\.\s*(?:Professional ad quality\.?\s*)?(?:Cinematic lighting\.?\s*)?/gi, '')
    .replace(/Pacing:[^.]*\.[^.]*\./g, '')
    // Compress beat markers into shorter form
    .replace(/\bBeat \d+:\s*/g, '')
    .replace(/\bOpening:\s*/g, '')
    .replace(/\bMid:\s*/g, '')
    .replace(/\bClosing:\s*/g, '')
    // Remove flowery filler phrases
    .replace(/\b(?:the kind of (?:shot|video|frame) that)[^.]*\./gi, '')
    .replace(/\b(?:every frame (?:is|feels|looks)[^.]*\.)/gi, '')
    .replace(/\b(?:the viewer feels[^.]*\.)/gi, '')
    .replace(/\b(?:nothing else competes for attention\.?\s*)/gi, '')
    .replace(/\bNo (?:dialogue|music|background music)[^.]*\.\s*/gi, '')
    // Compress repeated whitespace and newlines
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim()

  // If still over 1000, trim at last sentence boundary
  if (condensed.length > 1000) {
    condensed = condensed.substring(0, 1000)
    const lastPeriod = condensed.lastIndexOf('.')
    if (lastPeriod > 600) condensed = condensed.substring(0, lastPeriod + 1)
  }

  return condensed
}
