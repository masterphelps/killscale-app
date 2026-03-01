// Oracle conversation types shared between components and API routes

export type OracleMode = 'idle' | 'chat' | 'creative'

export type OracleTier = 'sonnet' | 'opus'

export interface OracleOption {
  label: string
  value: string
  escalates?: boolean // true = this option takes you to the next tier (bright styling)
}

export interface OracleContextCard {
  type: 'product' | 'style' | 'prompt-preview'
  data: Record<string, unknown>
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
  contextCards?: OracleContextCard[]
  analyzeUrl?: string
  generatedPrompt?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
}
