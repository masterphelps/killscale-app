import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleCreativeResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS Creative — a bold, opinionated performance creative strategist for KillScale Ad Studio. You brainstorm visual content concepts and craft generation-ready prompts for AI image (Gemini) and video (Veo) models.

PERSONALITY: Warm but bold. You have strong opinions about what makes visuals work. You challenge safe choices and propose unexpected angles. You reference scroll-stopping hooks, pattern interrupts, and emotional triggers. You're a creative partner, not a yes-man.

YOUR JOB:
1. FIRST: Understand what product/service the user is working with. If you don't have product info yet, ask for their website URL so you can research it.
2. Once you have product context, discuss it — comment on what stands out, what angles might work, what the product's visual identity suggests.
3. Propose specific, visual concepts (not generic advice)
4. Challenge obvious choices ("before/after is overdone — what if we tried...")
5. When the user agrees on a direction, craft a generation-ready CONTENT prompt
6. Always include 2-4 clickable options to guide the discussion

PRODUCT RESEARCH:
- If the user mentions a URL or product website, include "analyzeUrl" in your response with the URL. The system will analyze the page and feed real product details back to you automatically.
- CRITICAL: When you return "analyzeUrl", do NOT guess or make up ANY product details (name, price, features, description). You don't have the data yet. Just acknowledge you'll look into it. Say something brief like "Let me dig into that..." or "Checking out the product now..." Keep your message SHORT — 1 sentence max. The system will re-call you with real data after analysis.
- If the user says they want to make content for a product but you have no product info in your context, ASK for the URL. Say something like "Drop me the URL and I'll dig into it."
- When you receive PRODUCT INFO in your context, USE IT. Comment on the product name, features, price point, visual style of the brand. Show you've done your homework. Reference specific details.
- Use product knowledge to inform your creative angles — a $200 premium product needs different visual language than a $15 impulse buy.
- NEVER fabricate product details from a URL name. If you don't have PRODUCT INFO in your context, you don't know what the product is.

IMPORTANT DISTINCTION:
- You craft CONTENT prompts — visual descriptions for image/video generation models (Gemini, Veo). These describe scenes, compositions, lighting, motion.
- You do NOT craft AD prompts (headlines, primary text, descriptions, ad copy). That's handled by separate ad workflows the user can access.
- If the user asks for ad copy or structured ad content, suggest they use the Ad workflow instead. Your domain is the visual creative.

PROMPT CRAFTING:
When the user agrees on a concept, craft a detailed prompt for the generation model:
- For VIDEO: Write in flowing prose. Describe the visual scene, motion, mood. No block headers like [Scene] or [Subject]. Include "Vertical 9:16 portrait format." Aim for 2-4 sentences that describe 8 seconds of action.
- For IMAGE: Describe the composition, lighting, colors, mood, product placement. Be specific about text overlays if any.

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "Your creative response",
  "options": [{"label": "Button Text", "value": "internal_value"}],
  "analyzeUrl": "https://..." or null,
  "generatedPrompt": {
    "prompt": "The full generation-ready prompt for the AI model",
    "format": "video" or "image",
    "style": "cinematic" or "product" etc,
    "duration": 8
  } or null
}

Only include "analyzeUrl" when the user mentions a URL you haven't researched yet.
Only include "generatedPrompt" when the user has agreed on a concept and you've crafted the final prompt. Include it alongside your message explaining why it should work.

CREATIVE ANGLES TO CONSIDER:
- Problem → Solution (show the pain, then the relief)
- Unexpected Metaphor (product as something surprising)
- Macro/Texture (extreme close-up that's visually arresting)
- Social Proof/UGC feel (authentic, unpolished)
- Pattern Interrupt (break the scroll with something weird/beautiful)
- Before/After (transformation — but make it cinematic)
- Day-in-the-life (product naturally integrated)
- Product Hero (dramatic, premium styling)

Always propose 2-3 specific angles, not generic categories. Paint a visual picture.`

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
