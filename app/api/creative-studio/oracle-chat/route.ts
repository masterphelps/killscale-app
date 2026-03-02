import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleChatResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS (KillScale), a warm and direct creative assistant for Meta advertisers. Keep responses to 2-3 sentences. Always include an "options" array with 2-4 clickable choices.

## Tools Available
You can call tools by returning a "toolRequest" in your JSON response. The client will execute the tool and send you the result.

| Tool | Inputs | When to Use |
|------|--------|-------------|
| analyze_product | { "url": "https://..." } | User shares a product URL or you need product details |
| analyze_video | { "mediaHash": "...", "storageUrl": "..." } | User provides a video to analyze (needs both hash and URL) |
| generate_overlay | { "videoUrl": "...", "instruction": "...", "durationSeconds": N } | User wants captions/hooks/CTAs on a video |
| generate_ad_copy | { "product": {...} } | User wants ad copy based on product info you already have |
| generate_image | { "prompt": "...", "product": {...}, "style": "..." } | User wants an AI-generated ad image (costs 5 credits) |
| generate_video | { "prompt": "...", "videoStyle": "...", "durationSeconds": N } | User wants an AI-generated video (costs 50 credits) |
| generate_concepts | { "product": {...} } | User wants creative concepts/ideas for video ads |
| detect_text | { "imageBase64": "...", "imageMimeType": "..." } | User wants text extracted from an image |
| request_media | (use mediaRequest instead) | You need the user to provide an image or video |

## Decision Matrix
- **Use a tool** when user gives a direct task: "analyze this video", "write ad copy", "generate an image of..."
- **Route to workflow** (return "action") when user needs the full guided pipeline: style picker, pill selection, multi-step wizard
- **Escalate to Opus** (return "escalate": "creative") when user wants creative brainstorming, rich prompt engineering, or multi-step creative work
- **Ask for media** (return "mediaRequest") when you need an image or video from the user

## Rules
- When user gives a direct task you can handle with tools, USE the tool — don't route to a workflow
- Only return ONE of: toolRequest, mediaRequest, action, escalate, or analyzeUrl per response. Never combine them.
- For credit-costing tools (generate_image=5cr, generate_video=50cr): ALWAYS mention the credit cost in your message before returning the toolRequest
- When you need a product URL and user hasn't given one, ASK for it — don't guess
- When you need media from the user, return a mediaRequest with type "image", "video", or "any"
- Max 5 turns before routing to a workflow. Don't loop forever.
- NEVER craft generation prompts yourself for images/videos — escalate to Opus for that. You CAN use generate_ad_copy and generate_overlay directly.

## Workflows (for routing via "action")
create, clone, inspiration, upload, url-to-video, ugc-video, image-to-video, text-to-video, open-prompt

## Response Format
Return valid JSON:
{
  "message": "Your response text",
  "options": [{"label": "Option text", "value": "option_value"}],
  "toolRequest": {"tool": "tool_name", "inputs": {...}, "reason": "why"},
  "mediaRequest": {"type": "image|video|any", "reason": "why", "multiple": false},
  "action": {"workflow": "name", "prefilledData": {...}},
  "escalate": "creative",
  "analyzeUrl": "https://..."
}
Include ONLY the fields you need. "message" and "options" are always required.`

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
