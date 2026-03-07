/**
 * Direct Veo 3.1 REST API client — bypasses @google/genai SDK.
 *
 * Why: The SDK silently drops `referenceImages` for generateVideos (only supports
 * single `image` param). Direct REST calls let us send multi-image referenceImages
 * exactly as Google's Vertex AI docs specify.
 *
 * API Reference:
 * - Generate: POST .../models/MODEL:predictLongRunning
 * - Poll:     POST .../models/MODEL:fetchPredictOperation
 * - Docs:     https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation
 */

// ── Auth ────────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library')
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL!,
      private_key: process.env.GCP_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const tokenRes = await client.getAccessToken()
  if (!tokenRes.token) throw new Error('Failed to get Vertex AI access token')
  return tokenRes.token
}

// ── URL builders ────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}`
}

function getGenerateUrl(model: string): string {
  return `${getBaseUrl()}/publishers/google/models/${model}:predictLongRunning`
}

/**
 * Polling uses :fetchPredictOperation on the MODEL endpoint (NOT /operations/ GET).
 * The operation name contains the model path, so we extract it.
 * Format: "projects/X/locations/Y/publishers/google/models/Z/operations/ID"
 */
function getFetchOperationUrl(operationName: string): string {
  // Extract model path: everything before "/operations/"
  const opsIdx = operationName.indexOf('/operations/')
  if (opsIdx === -1) {
    // Fallback: use operation name directly with location prefix
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
    return `https://${location}-aiplatform.googleapis.com/v1/${operationName}`
  }
  const modelPath = operationName.substring(0, opsIdx)
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  return `https://${location}-aiplatform.googleapis.com/v1/${modelPath}:fetchPredictOperation`
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface VeoGenerateParams {
  model: string
  prompt: string
  images?: Array<{ base64: string; mimeType: string }>
  video?: { uri: string; mimeType: string }
  config: {
    numberOfVideos?: number
    durationSeconds?: number
    aspectRatio?: string
    resolution?: string
    outputGcsUri?: string
  }
}

export interface VeoOperationResult {
  name: string
  done: boolean
  response?: {
    /** Vertex AI returns videos as array of { gcsUri, mimeType } */
    generatedVideos: Array<{
      video?: {
        gcsUri?: string
        uri?: string
        mimeType?: string
      }
    }>
    raiMediaFilteredCount?: number
    raiMediaFilteredReasons?: string[]
  }
  error?: {
    code?: number
    message?: string
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip data URI prefix (e.g. "data:image/png;base64,") if present */
function stripDataUri(base64: string): string {
  const idx = base64.indexOf(',')
  if (idx !== -1 && base64.startsWith('data:')) {
    return base64.substring(idx + 1)
  }
  return base64
}

// ── Core API ────────────────────────────────────────────────────────────────

/** Submit a video generation request to Veo via Vertex AI REST API */
export async function veoGenerate(params: VeoGenerateParams): Promise<VeoOperationResult> {
  const token = await getAccessToken()
  const url = getGenerateUrl(params.model)

  // Build instance
  const instance: Record<string, unknown> = {
    prompt: params.prompt,
  }

  // Images: single uses `image`, multiple uses `referenceImages`
  if (params.images && params.images.length > 0 && !params.video) {
    if (params.images.length === 1) {
      // Single image → image field (image-to-video)
      instance.image = {
        bytesBase64Encoded: stripDataUri(params.images[0].base64),
        mimeType: params.images[0].mimeType || 'image/png',
      }
    } else {
      // Multiple images → referenceImages array (up to 3 asset images per docs)
      instance.referenceImages = params.images.map((img) => ({
        image: {
          bytesBase64Encoded: stripDataUri(img.base64),
          mimeType: img.mimeType || 'image/png',
        },
        referenceType: 'asset',
      }))
    }
  }

  // Video input (for extensions)
  if (params.video) {
    instance.video = {
      gcsUri: params.video.uri,
      mimeType: params.video.mimeType,
    }
  }

  // Build parameters
  const parameters: Record<string, unknown> = {}
  if (params.config.aspectRatio) parameters.aspectRatio = params.config.aspectRatio
  if (params.config.resolution) parameters.resolution = params.config.resolution
  if (params.config.durationSeconds) parameters.durationSeconds = params.config.durationSeconds
  if (params.config.numberOfVideos) parameters.sampleCount = params.config.numberOfVideos
  if (params.config.outputGcsUri) parameters.storageUri = params.config.outputGcsUri

  const body = {
    instances: [instance],
    parameters,
  }

  const bodyJson = JSON.stringify(body)
  const bodyMB = (bodyJson.length / 1024 / 1024).toFixed(2)
  console.log(`[Veo] POST ${params.model}: images=${params.images?.length || 0}, video=${!!params.video}, duration=${params.config.durationSeconds}s, payload=${bodyMB}MB`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: bodyJson,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Veo generation failed (${res.status}): ${text}`)
  }

  const raw = await res.json()
  // predictLongRunning returns { name: "projects/.../operations/ID" }
  return { name: raw.name || '', done: false }
}

/**
 * Poll a Veo operation for completion.
 * Uses :fetchPredictOperation POST endpoint (NOT GET /operations/).
 */
export async function veoPoll(operationName: string): Promise<VeoOperationResult> {
  const token = await getAccessToken()
  const url = getFetchOperationUrl(operationName)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operationName }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Veo poll failed (${res.status}): ${text}`)
  }

  const raw = await res.json()
  return normalizeResponse(raw)
}

// ── Response normalization ──────────────────────────────────────────────────

/**
 * Normalize Vertex AI response to our standard format.
 * Vertex returns: { name, done, response: { videos: [{ gcsUri, mimeType }] } }
 * We normalize to: { name, done, response: { generatedVideos: [{ video: { gcsUri } }] } }
 * so downstream code that uses `response.generatedVideos[0].video.gcsUri` keeps working.
 */
function normalizeResponse(raw: any): VeoOperationResult {
  const result: VeoOperationResult = {
    name: raw.name || '',
    done: raw.done || false,
    error: raw.error,
  }

  if (raw.response) {
    // Vertex returns videos as: [{ gcsUri: "gs://...", mimeType: "video/mp4" }]
    const rawVideos = raw.response.videos || raw.response.predictions || []
    result.response = {
      generatedVideos: rawVideos.map((v: any) => ({
        video: {
          gcsUri: v.gcsUri || v.videoURI || undefined,
          uri: v.uri || undefined,
          mimeType: v.mimeType || 'video/mp4',
        },
      })),
      raiMediaFilteredCount: raw.response.raiMediaFilteredCount,
      raiMediaFilteredReasons: raw.response.raiMediaFilteredReasons,
    }
  }

  return result
}
