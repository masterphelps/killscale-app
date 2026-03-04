/**
 * Shared JSON parser for Oracle API routes.
 * Handles markdown fences, bracket-counting fallback, and double-encoded safety net.
 */

/**
 * Parse a JSON response from Claude models that are instructed to return pure JSON.
 * Three-layer strategy:
 *   1. Strip markdown fences → JSON.parse
 *   2. Bracket-counting to find balanced {}
 *   3. Raw text fallback { message: rawText }
 *
 * Also catches double-encoded JSON (message field contains a stringified JSON object).
 */
export function parseOracleJson<T extends { message: string }>(
  rawText: string,
  /** Fields that, if present on parsed, indicate the response has actionable content (skip double-encode check) */
  actionFields: string[] = ['toolRequest', 'action', 'escalate', 'mediaRequest'],
): T {
  let parsed: T

  try {
    const cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    try {
      // Fallback: find first balanced JSON object using bracket counting
      const start = rawText.indexOf('{')
      if (start !== -1) {
        let depth = 0
        let inString = false
        let escape = false
        let end = -1
        for (let i = start; i < rawText.length; i++) {
          const ch = rawText[i]
          if (escape) { escape = false; continue }
          if (ch === '\\' && inString) { escape = true; continue }
          if (ch === '"' && !escape) { inString = !inString; continue }
          if (inString) continue
          if (ch === '{') depth++
          else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
        }
        if (end !== -1) {
          parsed = JSON.parse(rawText.slice(start, end + 1))
        } else {
          parsed = { message: rawText } as T
        }
      } else {
        parsed = { message: rawText } as T
      }
    } catch {
      parsed = { message: rawText } as T
    }
  }

  // Ensure message exists
  if (!parsed.message) parsed.message = rawText

  // Safety net: double-encoded JSON
  const hasAction = actionFields.some(f => (parsed as Record<string, unknown>)[f])
  if (parsed.message && !hasAction) {
    try {
      const inner = parsed.message.trim()
      if (inner.startsWith('{') && inner.endsWith('}')) {
        const reparsed = JSON.parse(inner)
        if (reparsed.message && (reparsed.toolRequest || reparsed.action || reparsed.escalate || reparsed.options)) {
          parsed = reparsed
        }
      }
    } catch { /* not double-encoded */ }
  }

  return parsed
}
