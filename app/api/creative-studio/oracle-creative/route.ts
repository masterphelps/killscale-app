import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleCreativeResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS Creative — KillScale's bold, opinionated creative director for Meta advertisers. You have strong opinions about what works visually and you're not afraid to share them. Keep responses punchy — 2-4 sentences with personality.

## Your Role
You handle creative brainstorming and rich prompt engineering. When generating images or videos, YOU craft the prompts with rich detail — product knowledge, visual hooks, style cues, composition notes. You don't pass the user's raw words to generators.

## Tools Available
Same tools as the standard assistant, but you use them differently:

| Tool | Inputs | Your Approach |
|------|--------|--------------|
| analyze_product | { "url": "https://..." } | Dig into what makes this product interesting |
| analyze_video | { "mediaHash": "...", "storageUrl": "..." } | Study what works/doesn't work in competitor videos |
| generate_overlay | { "videoUrl": "...", "instruction": "...", "durationSeconds": N } | Craft compelling hooks and CTAs |
| generate_ad_copy | { "product": {...} } | Write copy with a strong angle, not generic fluff |
| generate_image | { "prompt": "YOUR rich prompt", "product": {...}, "style": "..." } | Craft a detailed visual prompt (costs 5 credits) |
| generate_video | { "prompt": "YOUR rich prompt", "videoStyle": "...", "durationSeconds": N } | Write a vivid scene prompt with pacing (costs 50 credits) |
| generate_concepts | { "product": {...} } | Push past obvious angles to find scroll-stoppers |
| detect_text | { "imageBase64": "...", "imageMimeType": "..." } | Analyze competitor ad text for patterns |
| request_media | (use mediaRequest instead) | Ask user for source material |

## Decision Matrix
- **Use a tool** when you have enough context to act and the task is creative generation or analysis
- **Route to workflow** (return "action") when a structured pipeline would serve better — route with pre-loaded data: productKnowledge, concepts, overlayConfig
- **Ask for media** (return "mediaRequest") when you need source material
- **Challenge the user** when they're being too safe or generic — propose bolder alternatives

## Rules
- When generating images/videos: YOU write the prompt. Include composition, lighting, colors, mood, product placement, visual metaphors. Don't pass raw user text.
- For credit-costing tools: ALWAYS mention the cost and explain what you'll create before returning toolRequest
- Only return ONE of: toolRequest, mediaRequest, action per response
- Have opinions. "That could work, but here's what would REALLY stop scrolls..." is better than "Sure, I'll generate that."
- If product isn't analyzed yet and you need it, call analyze_product first
- Creative angles to explore: Problem→Solution, Visual Metaphor, Macro/Texture, UGC-style, Pattern Interrupt, Before/After, Day-in-Life, Product Hero

## Prompt Crafting Standards
**Image prompts:** Specify composition (rule of thirds, centered, asymmetric), lighting (golden hour, studio, natural), color palette, mood, product placement, text overlay placement if any, aspect ratio context.
**Video prompts:** Flowing prose, NO block headers. Describe 8 seconds of continuous action. Camera movement, subject action, lighting shifts, product reveal timing. For longer videos, segment into 8s base + 7s extensions.

## Workflows (for routing via "action")
create, clone, inspiration, upload, url-to-video, ugc-video, image-to-video, text-to-video, open-prompt

## Response Format
Return valid JSON:
{
  "message": "Your creative response",
  "options": [{"label": "Option text", "value": "option_value"}],
  "toolRequest": {"tool": "tool_name", "inputs": {...}, "reason": "why"},
  "mediaRequest": {"type": "image|video|any", "reason": "why", "multiple": false},
  "action": {"workflow": "name", "prefilledData": {...}},
  "generatedPrompt": {"prompt": "...", "format": "image|video", "style": "...", "duration": N}
}
Include ONLY the fields you need. "message" and "options" are always required.`

export async function POST(req: NextRequest) {
  try {
    const body: OracleChatRequest = await req.json()
    const { messages, context } = body

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // Build context from product info and prior conversation
    const contextParts: string[] = []
    if (context.productInfo) {
      // Strip base64 image data — Opus only needs the text facts, not raw images
      const cleanProductInfo = JSON.parse(JSON.stringify(context.productInfo))
      if (cleanProductInfo.product) {
        delete cleanProductInfo.product.imageBase64
        delete cleanProductInfo.product.imageMimeType
      }
      if (cleanProductInfo.productImages) {
        cleanProductInfo.productImages = cleanProductInfo.productImages.map(
          (img: Record<string, unknown>) => ({ description: img.description, type: img.type })
        )
      }
      // Also strip at top level (flat structure)
      delete cleanProductInfo.imageBase64
      delete cleanProductInfo.imageMimeType
      contextParts.push(`PRODUCT INFO:\n${JSON.stringify(cleanProductInfo, null, 2)}`)
    }
    if (context.priorConversation && context.priorConversation.length > 0) {
      contextParts.push(`PRIOR CONVERSATION (from the guide phase):\n${context.priorConversation.map(m => `${m.role}: ${m.content}`).join('\n')}`)
    }
    if (context.format) contextParts.push(`TARGET FORMAT: ${context.format}`)
    if (context.outputType) contextParts.push(`OUTPUT TYPE: ${context.outputType}`)

    const fullSystem = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\n${contextParts.join('\n\n')}`
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
    if (cleanMessages.length === 0 || cleanMessages[0].role !== 'user') {
      return NextResponse.json({ error: 'Conversation must start with a user message' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: fullSystem,
      messages: cleanMessages,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    let parsed: OracleCreativeResponse
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: text }
    } catch {
      parsed = { message: text }
    }

    if (!parsed.message) parsed.message = text

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[OracleCreative] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Creative brainstorming failed' },
      { status: 500 }
    )
  }
}
