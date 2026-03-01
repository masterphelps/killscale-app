import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface OracleRequest {
  text: string
  outputType: 'ad' | 'content'
  format: 'image' | 'video'
  hasImage: boolean
}

interface OracleResponse {
  workflow: 'create' | 'clone' | 'inspiration' | 'upload'
    | 'url-to-video' | 'ugc-video' | 'image-to-video'
    | 'open-prompt' | 'text-to-video'
  productUrl?: string
  competitorUrl?: string
  prompt?: string
  format: 'image' | 'video'
  outputType: 'ad' | 'content'
}

const SYSTEM_PROMPT = `You are a router for an ad creation tool called KillScale Ad Studio. Given user input and their selected toggles, classify their intent and extract any URLs.

Available workflows:
- "create": User has a product URL and wants image ads with copy (headlines, primary text, descriptions)
- "clone": User wants to copy/remix a competitor's ad style. Keywords: clone, like, similar to, inspired by, remix, copy style
- "inspiration": User wants to browse example ads for inspiration. Keywords: inspiration, browse, examples, gallery, ideas
- "upload": User has their own image and wants to turn it into an ad
- "url-to-video": User has a product URL and wants AI video ad concepts with overlays
- "ugc-video": User wants a UGC (user-generated content) style testimonial video. Keywords: UGC, testimonial, talking head, influencer, creator, review
- "image-to-video": User has an image and wants to animate it into a video
- "text-to-video": User has a text description and wants a video ad with director's review
- "open-prompt": User wants raw content (no ad copy structure). Used when outputType is "content"

Routing rules:
1. If outputType is "content", always return "open-prompt" regardless of other signals
2. If hasImage is true and format is "image", return "upload"
3. If hasImage is true and format is "video", return "image-to-video"
4. If text contains a URL and format is "image", return "create"
5. If text contains a URL and format is "video" and NO UGC keywords, return "url-to-video"
6. If text contains a URL and format is "video" and HAS UGC keywords, return "ugc-video"
7. If text mentions cloning/copying a competitor, return "clone"
8. If text asks for inspiration/examples/browsing, return "inspiration"
9. If text is a creative brief with NO URL and format is "image", return "create"
10. If text is a creative brief with NO URL and format is "video", return "text-to-video"

Extract any URLs found in the text. If there are two URLs, the first is likely the product URL and the second is the competitor URL.

Strip routing-intent language from the prompt field — return only the creative brief portion.

Return ONLY valid JSON matching this schema:
{
  "workflow": string,
  "productUrl": string | null,
  "competitorUrl": string | null,
  "prompt": string | null,
  "format": "image" | "video",
  "outputType": "ad" | "content"
}`

export async function POST(req: NextRequest) {
  try {
    const body: OracleRequest = await req.json()
    const { text, outputType, format, hasImage } = body

    if (!text?.trim() && !hasImage) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 })
    }

    // Fast path: if content mode, skip Claude call
    if (outputType === 'content') {
      const urlMatch = text.match(/https?:\/\/[^\s]+/)
      return NextResponse.json({
        workflow: 'open-prompt',
        productUrl: urlMatch?.[0] || null,
        prompt: text.trim(),
        format,
        outputType,
      })
    }

    // Fast path: image attached
    if (hasImage && format === 'image') {
      return NextResponse.json({
        workflow: 'upload',
        prompt: text.trim() || null,
        format,
        outputType,
      })
    }

    if (hasImage && format === 'video') {
      return NextResponse.json({
        workflow: 'image-to-video',
        prompt: text.trim() || null,
        format,
        outputType,
      })
    }

    // Claude Haiku classification for ambiguous inputs
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Input text: "${text}"\nOutput type toggle: ${outputType}\nFormat toggle: ${format}\nHas attached image: ${hasImage}`,
      }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Fallback: use toggles directly
      const urlMatch = text.match(/https?:\/\/[^\s]+/)
      return NextResponse.json({
        workflow: urlMatch
          ? (format === 'video' ? 'url-to-video' : 'create')
          : (format === 'video' ? 'text-to-video' : 'create'),
        productUrl: urlMatch?.[0] || null,
        prompt: text.trim(),
        format,
        outputType,
      })
    }

    const result: OracleResponse = JSON.parse(jsonMatch[0])

    // Validate workflow value
    const validWorkflows = [
      'create', 'clone', 'inspiration', 'upload',
      'url-to-video', 'ugc-video', 'image-to-video',
      'open-prompt', 'text-to-video',
    ]
    if (!validWorkflows.includes(result.workflow)) {
      result.workflow = format === 'video' ? 'text-to-video' : 'create'
    }

    // Ensure format/outputType match toggles (user toggles override Claude)
    result.format = format
    result.outputType = outputType

    return NextResponse.json(result)
  } catch (err) {
    console.error('Oracle route error:', err)
    // Fallback: simple toggle-based routing
    const body: OracleRequest = await req.json().catch(() => ({
      text: '', outputType: 'ad' as const, format: 'image' as const, hasImage: false,
    }))
    return NextResponse.json({
      workflow: body.format === 'video' ? 'text-to-video' : 'create',
      prompt: body.text?.trim() || null,
      format: body.format,
      outputType: body.outputType,
    })
  }
}
