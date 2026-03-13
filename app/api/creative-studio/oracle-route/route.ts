import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface OracleRequest {
  text: string
  mode?: 'ks' | 'image' | 'video'
  outputType?: 'ad' | 'content'   // deprecated — use mode
  format?: 'image' | 'video'      // deprecated — use mode
  hasImage: boolean
}

interface OracleResponse {
  workflow: 'create' | 'clone' | 'inspiration' | 'upload'
    | 'url-to-video' | 'ugc-video' | 'image-to-video'
    | 'open-prompt' | 'text-to-video' | 'conversation'
  productUrl?: string
  competitorUrl?: string
  prompt?: string
  format: 'image' | 'video'
  outputType: 'ad' | 'content'
}

const SYSTEM_PROMPT = `You are a router for an ad creation tool called KillScale Ad Studio. Given user input and their selected toggles, classify their intent and extract any URLs.

Available workflows:
- "create": User wants to make an ad from a product. This is the DEFAULT for image ads — use it whenever the user mentions making ads, product ads, or has a product URL. Keywords: make an ad, create ad, product ad, ad for my product
- "clone": User wants to copy/remix a competitor's ad style. Keywords: clone, like, similar to, inspired by, remix, copy style
- "inspiration": User wants to browse example ads for inspiration. Keywords: inspiration, browse, examples, gallery, ideas
- "upload": User has their own image and wants to turn it into an ad
- "url-to-video": User wants a video ad from a product. This is the DEFAULT for video ads — use it whenever the user mentions making video ads or product videos. Keywords: video ad, product video, make a video, video from url/product/site
- "ugc-video": User wants a UGC (user-generated content) style testimonial video. Keywords: UGC, testimonial, talking head, influencer, creator, review
- "image-to-video": User has an image and wants to animate it into a video
- "text-to-video": User has a specific scene/concept in mind (NOT a product) and wants to describe it for a video. Only use when the user provides a creative brief or scene description, not just "make a video"
- "open-prompt": User wants raw content (no ad copy structure). Used when outputType is "content"
- "conversation": User wants to edit an existing image (add text, headlines, modify), OR input is truly vague with no clear direction. Image editing goes through conversation so the agent can ask for the image, analyze it, and help interactively. Examples: "help me", "what can you do?", "not sure where to start". Do NOT use conversation for anything that mentions ads, videos, products, or any specific intent.

Routing rules (check in order):
1. If outputType is "content", always return "open-prompt"
2. If hasImage is true and format is "image", return "upload"
3. If hasImage is true and format is "video", return "image-to-video"
4. If text contains a literal URL (https://...) and format is "image", return "create"
5. If text contains a literal URL and format is "video" and NO UGC keywords, return "url-to-video"
6. If text contains a literal URL and format is "video" and HAS UGC keywords, return "ugc-video"
7. If text mentions cloning/copying a competitor, return "clone"
8. If text asks for inspiration/examples/browsing, return "inspiration"
9. If text mentions UGC, testimonial, talking head, return "ugc-video"
10. If format is "video" and user wants to make a video ad or mentions product/url/website, return "url-to-video"
11. If format is "video" and text is a detailed creative brief or scene description (not just "make a video"), return "text-to-video"
12. If format is "video" and intent is making a video (generic), return "url-to-video" (the workflow will ask for the URL)
13. If format is "image" and user wants to make ads or mentions a product, return "create"
14. If text mentions editing an existing image, adding text/headlines to an image, or modifying an image they have, return "conversation"
15. For anything else (vague, greeting, unclear), return "conversation"

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
  let body: OracleRequest = { text: '', hasImage: false }
  try {
    body = await req.json()
    const { text, hasImage } = body

    // Resolve mode from new field or deprecated fields
    const mode: 'ks' | 'image' | 'video' = body.mode
      || (body.outputType === 'content' && body.format === 'video' ? 'video'
        : body.outputType === 'content' ? 'image'
        : 'ks')
    // Derive legacy fields for response compat
    const format = mode === 'video' ? 'video' as const : 'image' as const
    const outputType = mode === 'ks' ? 'ad' as const : 'content' as const

    if (!text?.trim() && !hasImage) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 })
    }

    // Fast path: Image mode → always open-prompt
    if (mode === 'image') {
      const urlMatch = text.match(/https?:\/\/[^\s]+/)
      return NextResponse.json({
        workflow: 'open-prompt',
        productUrl: urlMatch?.[0] || null,
        prompt: text.trim(),
        format: 'image',
        outputType: 'content',
      })
    }

    // Fast path: Video mode → always text-to-video
    if (mode === 'video') {
      if (hasImage) {
        return NextResponse.json({
          workflow: 'image-to-video',
          prompt: text.trim() || null,
          format: 'video',
          outputType: 'content',
        })
      }
      return NextResponse.json({
        workflow: 'text-to-video',
        prompt: text.trim() || null,
        format: 'video',
        outputType: 'content',
      })
    }

    // KS mode: always go to Sonnet conversation — no blind transfers
    // Sonnet decides what to do conversationally and handles handoffs with friendly messages
    return NextResponse.json({
      workflow: 'conversation',
      productUrl: text.match(/https?:\/\/[^\s]+/)?.[0] || null,
      prompt: text.trim() || null,
      format,
      outputType,
    })
  } catch (err) {
    console.error('Oracle route error:', err)
    // Fallback: use body captured before try block (req stream already consumed)
    return NextResponse.json({
      workflow: 'create',
      prompt: body.text?.trim() || null,
      format: 'image',
      outputType: 'ad',
    })
  }
}
