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
