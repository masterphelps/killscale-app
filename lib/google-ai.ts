import { GoogleGenAI } from '@google/genai'

/**
 * Shared Google GenAI client — prefers Vertex AI (service account) over AI Studio (API key).
 * Singleton: initialized once, reused across requests.
 */
let _client: GoogleGenAI | null = null

export function getGoogleAI(): GoogleGenAI | null {
  if (_client) return _client

  // Prefer Vertex AI with service account credentials
  if (process.env.GCP_SERVICE_ACCOUNT_EMAIL && process.env.GCP_SERVICE_ACCOUNT_KEY) {
    _client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
      googleAuthOptions: {
        credentials: {
          client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL!,
          private_key: process.env.GCP_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, '\n'),
        },
      },
    })
    return _client
  }

  // Fallback to AI Studio API key
  if (process.env.GOOGLE_GEMINI_API_KEY) {
    _client = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY })
    return _client
  }

  return null
}

/** Returns true if we're using Vertex AI (service account) vs AI Studio (API key) */
export function isVertexAI(): boolean {
  return !!(process.env.GCP_SERVICE_ACCOUNT_EMAIL && process.env.GCP_SERVICE_ACCOUNT_KEY)
}
