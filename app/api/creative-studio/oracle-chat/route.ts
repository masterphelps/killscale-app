import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleChatResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS (KillScale), a warm and direct creative assistant for Meta advertisers. Keep responses to 2-3 sentences. Be conversational — sometimes a statement or open question is better than offering buttons.

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
- CRITICAL: When generating ad copy AFTER a video analysis, ALWAYS include the video analysis data by adding "videoAnalysis": {transcript, speakerStyle, visualStyle, emotionalTone, keyMessages, hook, hold, click, convert} in the generate_ad_copy inputs. The copy must complement the video, not ignore it.
- When the user says "download" or "finish" for a generated asset, tell them to use the Save/Download buttons on the result card above. Don't restart the conversation.

## Workflows (for routing via "action")
create, clone, inspiration, upload, url-to-video, ugc-video, image-to-video, text-to-video, open-prompt

## Response Format
CRITICAL: Your ENTIRE response must be a single, valid JSON object. No markdown, no code fences, no text outside the JSON. Start with { and end with }.

{
  "message": "Your response text",
  "options": [{"label": "Option text", "value": "option_value"}],
  "toolRequest": {"tool": "tool_name", "inputs": {...}, "reason": "why"},
  "mediaRequest": {"type": "image|video|any", "reason": "why", "multiple": false},
  "action": {"workflow": "name", "prefilledData": {...}},
  "escalate": "creative",
  "analyzeUrl": "https://..."
}
Include ONLY the fields you need. "message" is always required.
"options" is OPTIONAL — only include it when you're presenting distinct choices the user needs to pick between. Do NOT include options when:
- You're about to execute a tool (the action IS the next step)
- You're asking an open-ended question ("What product are you working with?")
- You're making a statement or sharing results ("Here's what I found...")
- The natural next step is obvious
When you DO include options, keep them to 2-3 genuinely distinct choices.
NEVER include JSON code blocks inside "message" — the toolRequest field IS the tool call. Put a short friendly message in "message" and the tool call in "toolRequest".
When a tool result arrives (message starting with "[Tool result"), respond conversationally about what you found and suggest next steps. Do NOT echo the tool result JSON back.`

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
    if (context.videoAnalysis) {
      contextParts.push(`VIDEO ANALYSIS (already completed): ${JSON.stringify(context.videoAnalysis)}`)
    }
    if (context.analyzedVideoUrl) {
      contextParts.push(`ANALYZED VIDEO URL (use this for generate_overlay): ${context.analyzedVideoUrl}`)
    }
    if (context.userMedia && Array.isArray(context.userMedia) && context.userMedia.length > 0) {
      contextParts.push(`USER MEDIA (already uploaded): ${JSON.stringify(context.userMedia)}`)
    }

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
      max_tokens: 1024,
      system: fullSystem,
      messages: cleanMessages,
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON response — model is instructed to return pure JSON via system prompt
    let parsed: OracleChatResponse
    try {
      // Strip any markdown code fences the model might add
      const cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      try {
        // Fallback: find first balanced JSON object using bracket counting
        const start = rawText.indexOf('{')
        if (start !== -1) {
          let depth = 0
          let inString = false
          let escape = false
          let end = -1
          for (let i = start; i < rawText.length; i++) {
            const ch = rawText[i]
            if (escape) { escape = false; continue }
            if (ch === '\\' && inString) { escape = true; continue }
            if (ch === '"' && !escape) { inString = !inString; continue }
            if (inString) continue
            if (ch === '{') depth++
            else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
          }
          if (end !== -1) {
            parsed = JSON.parse(rawText.slice(start, end + 1))
          } else {
            parsed = { message: rawText }
          }
        } else {
          parsed = { message: rawText }
        }
      } catch {
        parsed = { message: rawText }
      }
    }

    // Ensure message exists
    if (!parsed.message) parsed.message = rawText

    // Safety net: double-encoded JSON
    if (parsed.message && !parsed.toolRequest && !parsed.action && !parsed.escalate && !parsed.mediaRequest) {
      try {
        const inner = parsed.message.trim()
        if (inner.startsWith('{') && inner.endsWith('}')) {
          const reparsed = JSON.parse(inner)
          if (reparsed.message && (reparsed.toolRequest || reparsed.action || reparsed.escalate || reparsed.options)) {
            parsed = reparsed
          }
        }
      } catch { /* not double-encoded */ }
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[OracleChat] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Oracle chat failed' },
      { status: 500 }
    )
  }
}
