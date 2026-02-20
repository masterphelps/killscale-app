import { NextRequest, NextResponse } from 'next/server'
import type { ProductKnowledge } from '@/lib/video-prompt-templates'
import type { VideoStyle } from '@/remotion/types'
import { STYLE_DESCRIPTIONS, STYLE_EXAMPLES, buildVideoScriptPrompt } from '@/lib/prompts/video-scripts'
import { buildProductContextBlock } from '@/lib/prompts/video-concepts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product, videoStyle, imageBase64, imageMimeType } = body as {
      product: ProductKnowledge
      videoStyle: VideoStyle
      imageBase64?: string
      imageMimeType?: string
    }

    if (!product?.name || !videoStyle) {
      return NextResponse.json(
        { error: 'Missing required fields: product.name, videoStyle' },
        { status: 400 }
      )
    }

    const styleDesc = STYLE_DESCRIPTIONS[videoStyle] || STYLE_DESCRIPTIONS.lifestyle
    const styleExample = STYLE_EXAMPLES[videoStyle] || ''

    // Build product context block
    const productContext = buildProductContextBlock(product)

    // Dialogue styles need specific dialogue guidance
    const hasDialogue = videoStyle === 'talking_head' || videoStyle === 'testimonial' || videoStyle === 'interview'

    // Build Claude message content
    const messageContent: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = []

    if (imageBase64 && imageMimeType) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMimeType,
          data: imageBase64,
        },
      })
    }

    const promptText = buildVideoScriptPrompt({
      productContext,
      videoStyle,
      styleDesc,
      styleExample,
      hasDialogue,
    })

    messageContent.push({
      type: 'text',
      text: promptText,
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: messageContent,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('[VideoScript] Anthropic API error:', errorData)
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 500 })
    }

    const result = await response.json()

    if (!result.content || !result.content[0]) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    const content = result.content[0].text

    let parsed
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        parsed = JSON.parse(content)
      }
    } catch (parseError) {
      console.error('[VideoScript] Failed to parse response:', content)
      return NextResponse.json({ error: 'Failed to parse script response' }, { status: 500 })
    }

    // Validate structure
    if (!parsed.concepts || !Array.isArray(parsed.concepts)) {
      console.error('[VideoScript] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid script response structure' }, { status: 500 })
    }

    return NextResponse.json({ concepts: parsed.concepts })

  } catch (err) {
    console.error('[VideoScript] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Script generation failed' },
      { status: 500 }
    )
  }
}
