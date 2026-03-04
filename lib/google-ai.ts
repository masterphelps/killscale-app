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
export async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 1, label = 'Gemini'): Promise<T> {
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

    try {
      const result = await fnFactory(client)
      if (i > 0) console.log(`[${label}] Succeeded in fallback region "${region}"`)
      return result
    } catch (err: unknown) {
      const msg = safeErrorMsg(err)

      // 404 = model not available in this region → skip to next region
      if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found')) {
        console.log(`[${label}] Model not available in "${region}", skipping...`)
        continue
      }

      // 429 = quota exhausted — try next region (no retry, fail fast)
      if (is429Error(msg)) {
        if (!first429Error) first429Error = err
        console.log(`[${label}] 429 in "${region}"${i < regions.length - 1 ? `, trying "${regions[i + 1]}"...` : ', all regions exhausted'}`)
        continue
      }

      // Other error (bad input, safety, etc.) — fail fast
      throw err
    }
  }

  // All regions exhausted — throw the 429 error (not a 404 from a fallback region)
  throw first429Error || new Error(`All regions exhausted (${regions.join(', ')})`)
}

/**
 * Model fallback for Gemini image models.
 * Tries the primary function first. On 429, falls back to a secondary function
 * (typically the same call with a cheaper/faster model like gemini-3.1-flash-image-preview).
 */
export async function withModelFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  label = 'Gemini',
): Promise<T> {
  try {
    return await primaryFn()
  } catch (err: unknown) {
    const msg = safeErrorMsg(err)
    if (is429Error(msg)) {
      console.log(`[${label}] Primary model 429'd — falling back to secondary model`)
      return await fallbackFn()
    }
    throw err
  }
}

/** Primary and fallback image generation models */
export const IMAGE_MODEL_PRIMARY = 'gemini-3-pro-image-preview'
export const IMAGE_MODEL_FALLBACK = 'gemini-3.1-flash-image-preview'
