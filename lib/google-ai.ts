import { GoogleGenAI } from '@google/genai'

/**
 * Shared Google GenAI client — prefers Vertex AI (service account) over AI Studio (API key).
 * Per-location caching: different models live in different Vertex regions
 * (e.g. gemini-3-pro-image-preview → global, veo-3.1 → us-central1).
 */
const _clients: Record<string, GoogleGenAI> = {}
let _apiKeyClient: GoogleGenAI | null = null

export function getGoogleAI(location?: string): GoogleGenAI | null {
  // Prefer Vertex AI with service account credentials
  if (process.env.GCP_SERVICE_ACCOUNT_EMAIL && process.env.GCP_SERVICE_ACCOUNT_KEY) {
    const loc = location || process.env.GOOGLE_CLOUD_LOCATION || 'global'
    if (_clients[loc]) return _clients[loc]

    console.log(`[GoogleAI] Creating Vertex AI client (project: ${process.env.GOOGLE_CLOUD_PROJECT}, location: ${loc})`)
    _clients[loc] = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: loc,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL!,
          private_key: process.env.GCP_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, '\n'),
        },
      },
    })
    return _clients[loc]
  }

  // Fallback to AI Studio API key
  if (process.env.GOOGLE_GEMINI_API_KEY) {
    if (_apiKeyClient) return _apiKeyClient
    console.log('[GoogleAI] Using AI Studio API key (NOT Vertex)')
    _apiKeyClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY })
    return _apiKeyClient
  }

  return null
}

/** Returns true if we're using Vertex AI (service account) vs AI Studio (API key) */
export function isVertexAI(): boolean {
  return !!(process.env.GCP_SERVICE_ACCOUNT_EMAIL && process.env.GCP_SERVICE_ACCOUNT_KEY)
}


/** Safely extract error message from Gemini SDK errors (may not be standard Error) */
function safeErrorMsg(err: unknown): string {
  try {
    return err instanceof Error ? err.message : String(err)
  } catch {
    return 'Unknown Gemini error'
  }
}

function is429Error(msg: string): boolean {
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Resource exhausted')
}

/**
 * Retry wrapper for transient 429s from Vertex AI preview models.
 * Exponential backoff: 5s, 10s, 20s.
 */
export async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2, label = 'Gemini'): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const msg = safeErrorMsg(err)
      if (!is429Error(msg) || attempt === maxRetries) throw err
      const delay = 5000 * Math.pow(2, attempt) // 5s, 10s, 20s
      console.log(`[${label}] 429 hit, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable')
}

/**
 * Regional failover for Vertex AI image models.
 * Tries each region with per-region retries. On 429, retries in same region
 * with backoff, then moves to next region. On 404 (model not in region),
 * skips immediately to next region.
 *
 * For global-only models (e.g. gemini-3-pro-image-preview), the non-global
 * regions will 404 and be skipped — the retries on 'global' are what help.
 *
 * Falls back to standard retry for API key mode (no regions).
 */
const IMAGE_REGIONS = ['global', 'us-central1', 'europe-west1']

export async function withRegionalFallback<T>(
  fnFactory: (client: GoogleGenAI) => Promise<T>,
  label = 'Gemini',
  regions = IMAGE_REGIONS,
): Promise<T> {
  // API key mode: single endpoint, use standard retry
  if (!isVertexAI()) {
    const client = getGoogleAI()
    if (!client) throw new Error('Google AI not configured')
    return withGeminiRetry(() => fnFactory(client), 2, label)
  }

  let first429Error: unknown = null

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const client = getGoogleAI(region)
    if (!client) continue

    // Per-region retries (2 retries = 3 attempts) for the primary region,
    // single attempt for fallback regions (they'll likely 404 for global-only models)
    const regionRetries = i === 0 ? 2 : 0

    for (let attempt = 0; attempt <= regionRetries; attempt++) {
      try {
        const result = await fnFactory(client)
        if (i > 0) console.log(`[${label}] Succeeded in fallback region "${region}"`)
        return result
      } catch (err: unknown) {
        const msg = safeErrorMsg(err)

        // 404 = model not available in this region → skip to next region immediately
        if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found')) {
          console.log(`[${label}] Model not available in "${region}", skipping...`)
          break // break inner retry loop, continue to next region
        }

        // 429 = quota exhausted in this region
        if (is429Error(msg)) {
          if (!first429Error) first429Error = err
          if (attempt < regionRetries) {
            const delay = 5000 * Math.pow(2, attempt) // 5s, 10s
            console.log(`[${label}] 429 in "${region}", retrying in ${delay / 1000}s (attempt ${attempt + 1}/${regionRetries})`)
            await new Promise(r => setTimeout(r, delay))
            continue
          }
          // Exhausted retries for this region — try next
          if (i < regions.length - 1) {
            console.log(`[${label}] 429 in "${region}" after ${regionRetries + 1} attempts, trying "${regions[i + 1]}"...`)
            await new Promise(r => setTimeout(r, 2000))
          }
          break // break inner retry loop, continue to next region
        }

        // Other error (bad input, safety, etc.) — fail fast
        throw err
      }
    }
  }

  // All regions exhausted — throw the 429 error (not a 404 from a fallback region)
  throw first429Error || new Error(`All regions exhausted (${regions.join(', ')})`)
}
