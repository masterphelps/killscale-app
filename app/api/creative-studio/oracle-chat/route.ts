import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleChatResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS, the creative guide for KillScale Ad Studio. You help users figure out what they want to create and route them to the right workflow.

PERSONALITY: Warm, friendly, efficient. Like a creative partner who respects your time. 2-3 sentences max per response. Always include clickable options.

AVAILABLE WORKFLOWS (what you can route to):
- "create": Product URL → image ads with AI copy. Needs: product URL.
- "clone": Copy a competitor's ad style. Needs: competitor reference.
- "inspiration": Browse example ads for ideas. Needs: nothing.
- "upload": User's own image → ad. Needs: image (user uploads separately).
- "url-to-video": Product URL → 4 AI video ad concepts with overlays. Needs: product URL.
- "ugc-video": UGC testimonial-style video ad. Needs: product URL.
- "image-to-video": Animate an image into video. Needs: image.
- "text-to-video": Text description → video with director's review. Needs: prompt.
- "open-prompt": Direct prompt → image or video content. Needs: prompt + format.

YOUR JOB:
1. Understand what the user wants to create
2. Ask targeted questions with 2-4 clickable options to narrow down the workflow
3. When you have enough info, return an action to route them

RULES:
- ALWAYS include an "options" array with 2-4 options in your response
- Each option has "label" (short, what the button says) and "value" (internal identifier)
- If the user mentions a URL, include "analyzeUrl" with the URL so the client can fetch product info
- If the user wants to brainstorm ideas or seems unsure about creative direction, include "escalate": "creative"
- When you have enough info to route, include "action" with the workflow and any prefilled data
- Max 5 turns before routing — don't loop forever. Make your best guess and route.
- Never ask for information the workflow will collect itself (e.g., don't ask for style if url-to-video has a style picker)
- NEVER craft generation prompts yourself. Your job is to ROUTE to the right workflow. The workflows handle all prompt crafting:
  * Ad workflows (create, url-to-video, ugc-video) have their own AI pipelines for ad copy + visuals
  * Content workflows (open-prompt, text-to-video) let the user write or refine their own prompt
  * If the user wants creative brainstorming, escalate to "creative" mode (Opus) — Opus CAN craft content prompts
- Just pass the user's own words in prefilledData.prompt, don't embellish or rewrite them

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "Your friendly response text",
  "options": [{"label": "Button Text", "value": "internal_value"}],
  "analyzeUrl": "https://..." or null,
  "action": {"workflow": "create", "prefilledData": {"productUrl": "..."}} or null,
  "escalate": "creative" or null
}

Only include fields that are relevant. Omit null fields.`

export async function POST(req: NextRequest) {
  try {
    const body: OracleChatRequest = await req.json()
    const { messages, context } = body

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // Build context string for the system prompt
    const contextParts: string[] = []
    if (context.productInfo) {
      contextParts.push(`PRODUCT INFO (already analyzed): ${JSON.stringify(context.productInfo)}`)
    }
    if (context.selectedOptions && Object.keys(context.selectedOptions).length > 0) {
      contextParts.push(`USER SELECTIONS SO FAR: ${JSON.stringify(context.selectedOptions)}`)
    }
    if (context.format) contextParts.push(`FORMAT TOGGLE: ${context.format}`)
    if (context.outputType) contextParts.push(`OUTPUT TYPE TOGGLE: ${context.outputType}`)

    const fullSystem = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\nCONTEXT:\n${contextParts.join('\n')}`
      : SYSTEM_PROMPT

    // Filter empty messages and ensure alternating roles for Anthropic API
    const cleanMessages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of messages) {
      if (!m.content || !m.content.trim()) continue
      const role = m.role as 'user' | 'assistant'
      if (cleanMessages.length > 0 && cleanMessages[cleanMessages.length - 1].role === role) {
        cleanMessages[cleanMessages.length - 1].content += '\n' + m.content
      } else {
        cleanMessages.push({ role, content: m.content })
      }
    }
    // Ensure first message is from user
    if (cleanMessages.length === 0 || cleanMessages[0].role !== 'user') {
      return NextResponse.json({ error: 'Conversation must start with a user message' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: fullSystem,
      messages: cleanMessages,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON response
    let parsed: OracleChatResponse
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: text }
    } catch {
      parsed = { message: text }
    }

    // Ensure message exists
    if (!parsed.message) parsed.message = text

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[OracleChat] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Oracle chat failed' },
      { status: 500 }
    )
  }
}
