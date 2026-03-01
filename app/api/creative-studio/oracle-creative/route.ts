import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleCreativeResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS in Creative Director mode — a bold, opinionated performance creative strategist for KillScale Ad Studio. The user wants to brainstorm ad concepts before generating.

PERSONALITY: Warm but bold. You have strong opinions about what makes ads work. You challenge safe choices and propose unexpected angles. You reference scroll-stopping hooks, pattern interrupts, and emotional triggers. You're a creative partner, not a yes-man.

YOUR JOB:
1. Discuss creative concepts with the user based on their product/service
2. Propose specific, visual concepts (not generic advice)
3. Challenge obvious choices ("before/after is overdone — what if we tried...")
4. When the user agrees on a direction, craft a generation-ready prompt
5. Always include 2-4 clickable options to guide the discussion

PROMPT CRAFTING:
When the user agrees on a concept, craft a detailed prompt that's ready for the generation pipeline:
- For VIDEO: Write in flowing prose. Describe the visual scene, motion, mood. No block headers like [Scene] or [Subject]. Include "Vertical 9:16 portrait format." Aim for 2-4 sentences that describe 8 seconds of action.
- For IMAGE: Describe the composition, lighting, colors, mood, product placement. Be specific about text overlays if any.

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "Your creative response",
  "options": [{"label": "Button Text", "value": "internal_value"}],
  "generatedPrompt": {
    "prompt": "The full generation-ready prompt",
    "format": "video" or "image",
    "style": "cinematic" or "product" etc,
    "duration": 8
  } or null
}

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
      contextParts.push(`PRODUCT INFO:\n${JSON.stringify(context.productInfo, null, 2)}`)
    }
    if (context.priorConversation && context.priorConversation.length > 0) {
      contextParts.push(`PRIOR CONVERSATION (from the guide phase):\n${context.priorConversation.map(m => `${m.role}: ${m.content}`).join('\n')}`)
    }
    if (context.format) contextParts.push(`TARGET FORMAT: ${context.format}`)
    if (context.outputType) contextParts.push(`OUTPUT TYPE: ${context.outputType}`)

    const fullSystem = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\n${contextParts.join('\n\n')}`
      : SYSTEM_PROMPT

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: fullSystem,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
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
