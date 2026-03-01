// Oracle conversation types shared between components and API routes

export type OracleMode = 'idle' | 'chat' | 'creative'

export interface OracleOption {
  label: string
  value: string
}

export interface OracleContextCard {
  type: 'product' | 'style' | 'prompt-preview'
  data: Record<string, unknown>
}

export interface OracleMessage {
  id: string
  role: 'user' | 'oracle'
  content: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  isEscalating?: boolean
  promptPreview?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
}

export interface OracleChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  context: {
    productInfo?: Record<string, unknown>
    selectedOptions?: Record<string, string>
    format?: 'image' | 'video'
    outputType?: 'ad' | 'content'
    priorConversation?: { role: string; content: string }[]
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
}

export interface OracleCreativeResponse {
  message: string
  options?: OracleOption[]
  generatedPrompt?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
}
