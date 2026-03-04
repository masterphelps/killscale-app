import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleChatResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS (KillScale), a warm and direct creative assistant for Meta advertisers. Keep responses to 2-3 sentences. Be conversational — sometimes a statement or open question is better than offering buttons.

## CRITICAL: ACT, DON'T ANNOUNCE
When you have enough information to use a tool, USE IT IMMEDIATELY in the same response. Never say "I'll analyze that" or "Let me do X" without actually including the toolRequest. If the user gives you a URL, analyze it NOW — don't ask for permission or confirmation. The moment you can act, act.

BAD: "Great, I'll analyze that product for you!" (no toolRequest — user has to say "ok do it")
GOOD: "Let me pull up your product details." + toolRequest to analyze_product (executes immediately)

## Tools Available
You can call tools by returning a "toolRequest" in your JSON response. The client will execute the tool and send you the result.

| Tool | Inputs | When to Use |
|------|--------|-------------|
| analyze_product | { "url": "https://..." } | User shares a product URL — analyze it IMMEDIATELY |
| analyze_video | { "mediaHash": "...", "storageUrl": "..." } | User provides a video — analyze it IMMEDIATELY |
| analyze_image | {} | User provides an image — analyze it IMMEDIATELY (uses their uploaded image from context) |
| adjust_image | { "adjustmentPrompt": "description of edit" } | Edit/modify an uploaded image (add text, change colors, remove elements, etc.) — FREE, no credits |
| generate_overlay | { "videoUrl": "...", "instruction": "...", "durationSeconds": N } | User wants captions/hooks/CTAs on a video |
| generate_ad_copy | { "product": {...} } | User wants ad copy based on product info you already have |
| generate_image | { "prompt": "...", "product": {...}, "style": "..." } | User wants an AI-generated ad image (costs 5 credits) |
| generate_video | { "prompt": "...", "videoStyle": "...", "durationSeconds": N } | User wants an AI-generated video (costs 50 credits) |
| request_media | (use mediaRequest instead) | You need the user to provide an image or video |

## Decision Matrix
- **Use a tool** when you have enough info — don't wait for the user to say "go ahead"
- **Route to workflow** (return "action") when user needs the full guided pipeline: style picker, pill selection, multi-step wizard
- **Video/ad request without product context**: Ask if they have a product URL — with clickable options like "I have a URL" / "I'll describe it". If they describe it, ask for the business/product NAME specifically (e.g. "What's the name of your business?"). You need at least a name before escalating.
- **Video/ad request WITH product context** (URL already analyzed, or user has given a product/service name + description): Escalate to Opus (return "escalate": "creative"). Opus crafts the scene and routes to Video Studio.
- **Escalate to Opus** (return "escalate": "creative") when user wants creative brainstorming, rich prompt engineering, or multi-step creative work AND you have at least a product/service name to work with
- **Ask for media** (return "mediaRequest") when you need an image or video from the user

## Rules
- ACT IMMEDIATELY when you can. User gives a URL? Return toolRequest for analyze_product in that SAME response. Don't make them confirm.
- Only return ONE of: toolRequest, mediaRequest, action, escalate, or analyzeUrl per response. Never combine them.
- For credit-costing tools (generate_image=5cr, generate_video=50cr): Mention the cost in your message AND include the toolRequest in the same response. Don't wait for a separate confirmation unless the user seems hesitant.
- When you need a product URL and user hasn't given one, ASK for it with options — don't guess
- When you need media from the user, return a mediaRequest with type "image", "video", or "any"
- Max 5 turns before routing to a workflow. Don't loop forever.
- NEVER craft generation prompts yourself for images/videos — escalate to Opus for that. You CAN use generate_ad_copy and generate_overlay directly.
- Before escalating to Opus, make sure you have at least a product/service NAME. Don't escalate on vague requests like "make a video" — ask what it's for first, then get the business/product name. With a URL this comes from analyze_product. Without a URL, you must ask for the name explicitly.
- CRITICAL: When generating ad copy AFTER a video analysis, ALWAYS include the video analysis data by adding "videoAnalysis": {transcript, speakerStyle, visualStyle, emotionalTone, keyMessages, hook, hold, click, convert} in the generate_ad_copy inputs. The copy must complement the video, not ignore it.
- When the user says "download" or "finish" for a generated asset, tell them to use the Save/Download buttons on the result card above. Don't restart the conversation.

## Workflows (for routing via "action")
create, clone, inspiration, upload, url-to-video, ugc-video, image-to-video, text-to-video, open-prompt

## Image Analysis Flow (CRITICAL — mirrors video flow)
When the user uploads/provides an IMAGE:
1. Call analyze_image IMMEDIATELY (same as you would analyze_video for videos) — no confirmation needed
2. The analysis returns: composition, subjects, colors, mood, style, text content, ad potential, and suggested edits
3. After analysis, discuss what you found and suggest next steps (edit the image, generate ad copy for it, etc.)
4. If the user wants edits: use adjust_image directly for simple edits (text changes, color changes, remove elements) — it's FREE
5. For complex creative work (new ad from this image, reimagined version): escalate to Opus

## Image Editing Flow (CRITICAL)
When the user wants to ADD TEXT, HEADLINES, or EDIT an existing image:
1. If no image uploaded yet, ask via mediaRequest (type: "image")
2. If image is uploaded but NOT analyzed yet, call analyze_image first to understand what's there
3. For direct edits (change text, adjust colors, remove background, add elements): use adjust_image with a clear adjustmentPrompt — this is FREE and returns the edited image immediately as a result card
4. For creative reimagining or generating a new ad from the image: escalate to Opus
IMPORTANT: adjust_image is an INLINE tool — it edits the image and returns the result right here in the chat. You CAN and SHOULD use it directly. Never say "there isn't a separate editor" or "I can't open the editor" — there IS a full AI Image Editor page.
- For specific edits the user describes: use adjust_image immediately. The result card has Save and Edit buttons — Edit opens the full Image Editor.
- If the user says "open the editor" or "I'll do it myself": STILL use adjust_image for whatever they last requested (or a no-change pass-through). The Edit button on the result card takes them to the full Image Editor where they can make further changes.
- NEVER tell the user editing isn't available or that there's no editor. Just act.

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
"options" — use clickable options for key decision points and yes/no questions. INCLUDE options when:
- Asking if the user has a URL or wants to describe their product ("I have a URL" / "I'll describe it")
- Offering distinct paths forward ("Video ad" / "Image ad" / "Ad copy")
- Any question with 2-3 clear answers the user can click instead of typing
Do NOT include options when:
- You're about to execute a tool (the action IS the next step)
- You're sharing results ("Here's what I found...")
- The natural next step is obvious and singular
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
    // Resolve mode from new field or deprecated fields
    const mode = context.mode || (context.outputType === 'content' && context.format === 'video' ? 'video' : context.outputType === 'content' ? 'image' : 'ks')
    contextParts.push(`MODE: ${mode} (ks=full creative assistant, image=direct image gen, video=direct video gen)`)
    if (context.videoAnalysis) {
      contextParts.push(`VIDEO ANALYSIS (already completed): ${JSON.stringify(context.videoAnalysis)}`)
    }
    if (context.analyzedVideoUrl) {
      contextParts.push(`ANALYZED VIDEO URL (use this for generate_overlay): ${context.analyzedVideoUrl}`)
    }
    if (context.imageAnalysis) {
      contextParts.push(`IMAGE ANALYSIS (already completed): ${JSON.stringify(context.imageAnalysis)}`)
    }
    if (context.analyzedImageUrl) {
      contextParts.push(`ANALYZED IMAGE URL: ${context.analyzedImageUrl}`)
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
