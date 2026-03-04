// Oracle conversation types shared between components and API routes

export type OracleMode = 'idle' | 'chat' | 'creative'

export type OracleTier = 'haiku' | 'sonnet' | 'opus'

// Three-state input mode — replaces the old outputType + format toggles
export type OracleInputMode = 'ks' | 'image' | 'video'

// Backwards compat: resolve mode from old session context
export function resolveMode(context: Record<string, unknown>): OracleInputMode {
  if (context.mode) return context.mode as OracleInputMode
  if (context.outputType === 'content' && context.format === 'video') return 'video'
  if (context.outputType === 'content') return 'image'
  return 'ks'
}

export interface OracleOption {
  label: string
  value: string
  escalates?: boolean // true = this option takes you to the next tier (bright styling)
}

export type OracleContextCardType =
  | 'product'
  | 'style'
  | 'prompt-preview'
  | 'video-analysis'
  | 'image-analysis'
  | 'overlay-preview'
  | 'ad-copy'
  | 'image-result'
  | 'video-result'
  | 'concepts'
  | 'media-attached'
  | 'credit-confirm'
  | 'tool-loading'
  | 'tool-error'

export interface OracleContextCard {
  type: OracleContextCardType
  data: Record<string, unknown>
}

// --- Oracle v2: Tool System Types ---

export type OracleToolName =
  | 'analyze_product'
  | 'analyze_video'
  | 'analyze_image'
  | 'adjust_image'
  | 'generate_overlay'
  | 'generate_ad_copy'
  | 'generate_image'
  | 'generate_video'
  | 'detect_text'
  | 'request_media'

export interface OracleToolRequest {
  tool: OracleToolName
  inputs: Record<string, unknown>
  reason: string
}

export interface OracleMediaRequest {
  type: 'image' | 'video' | 'any'
  reason: string
  multiple?: boolean
}

export const ORACLE_TOOL_CREDITS: Partial<Record<OracleToolName, number>> = {
  generate_image: 5,
  generate_video: 50,
}

export interface OracleMessage {
  id: string
  role: 'user' | 'oracle'
  content: string
  tier?: OracleTier // which model generated this message
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  isEscalating?: boolean
  promptPreview?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
  // New: tool system fields
  mediaRequest?: OracleMediaRequest
  toolRequest?: OracleToolRequest
  mediaAttachments?: Array<{
    url: string
    mimeType: string
    name: string
    type: 'image' | 'video'
    preview?: string
  }>
}

export interface OracleChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  context: {
    mode?: OracleInputMode
    productInfo?: Record<string, unknown>
    selectedOptions?: Record<string, string>
    format?: 'image' | 'video'       // deprecated — use mode
    outputType?: 'ad' | 'content'    // deprecated — use mode
    priorConversation?: { role: string; content: string }[]
    videoAnalysis?: Record<string, unknown>
    analyzedVideoUrl?: string
    imageAnalysis?: Record<string, unknown>
    analyzedImageUrl?: string
    userMedia?: Array<{ url: string; mimeType: string; name: string; type: string }>
    productImages?: Array<{ base64: string; mimeType: string; description: string; type: string }>
  }
}

export interface OracleChatResponse {
  message: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  action?: {
    workflow: string
    prefilledData: Record<string, unknown>
  }
  escalate?: 'creative'
  analyzeUrl?: string
  // New: tool system
  toolRequest?: OracleToolRequest
  mediaRequest?: OracleMediaRequest
}

export interface OracleCreativeResponse {
  message: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  analyzeUrl?: string
  generatedPrompt?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
  action?: {
    workflow: string
    prefilledData: Record<string, unknown>
  }
  // New: tool system
  toolRequest?: OracleToolRequest
  mediaRequest?: OracleMediaRequest
}

export interface OracleChatSession {
  id: string
  user_id: string
  ad_account_id: string
  title: string
  messages: OracleMessage[]
  context: Record<string, unknown>
  generated_assets: Array<{
    type: 'image' | 'video' | 'overlay' | 'ad-copy'
    url?: string
    mediaHash?: string
    toolUsed: OracleToolName
    creditCost: number
  }>
  highest_tier: 'haiku' | 'sonnet' | 'opus'
  status: 'active' | 'complete'
  created_at: string
  updated_at: string
}
