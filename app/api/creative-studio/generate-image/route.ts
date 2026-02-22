import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getGoogleAI } from '@/lib/google-ai'
import {
  ANALYZE_REFERENCE_AD_PROMPT,
  TEXT_REQUIREMENTS,
  buildCurateAdTextPrompt,
  extractBestLine,
  buildDualImagePrompt,
  buildReferenceOnlyPrompt,
  buildImagePrompt,
  buildCustomPrompt,
  buildTextOnlyPrompt,
  buildOpenPrompt,
  buildOpenPromptWithImage,
  type ImagePromptRequest,
  type CuratedAdText,
} from '@/lib/prompts/image-generation'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Claude client for text curation
let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

// Use shared Vertex AI / AI Studio client
const getGenAI = getGoogleAI

// Always use Gemini 3 Pro - it's the only model that works reliably
const MODEL_NAME = 'gemini-3-pro-image-preview'

// Retry wrapper for transient 429s from Vertex AI
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Resource exhausted')
      if (!is429 || attempt === maxRetries) throw err
      const delay = (attempt + 1) * 3000 // 3s, 6s
      console.log(`[Imagen] 429 hit, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable')
}

interface GenerateImageRequest extends ImagePromptRequest {
  userId?: string
}

// Detect actual MIME type from base64 magic bytes (browser file.type can lie)
function detectMimeType(base64: string): string {
  const header = base64.slice(0, 20)
  if (header.startsWith('/9j/')) return 'image/jpeg'
  if (header.startsWith('iVBOR')) return 'image/png'
  if (header.startsWith('R0lGO')) return 'image/gif'
  if (header.startsWith('UklGR')) return 'image/webp'
  return 'image/jpeg'
}

// Use Claude vision to describe the reference ad's visual style
async function analyzeReferenceAdStyle(imageBase64: string, imageMimeType: string): Promise<string | null> {
  const claude = getAnthropic()
  if (!claude) return null

  try {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: detectMimeType(imageBase64) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            }
          },
          {
            type: 'text',
            text: ANALYZE_REFERENCE_AD_PROMPT
          }
        ]
      }]
    })

    const description = (response.content[0] as { text: string }).text.trim()
    console.log('[Imagen] Claude analyzed reference ad style:', description)
    return description
  } catch (err) {
    console.error('[Imagen] Failed to analyze reference ad:', err)
    return null
  }
}

// Use Claude to pick the best text for the ad image
async function curateAdText(headline: string, primaryText: string): Promise<CuratedAdText> {
  const claude = getAnthropic()

  // If no Claude available, fall back to simple extraction
  if (!claude) {
    console.log('[Imagen] No Claude API, using fallback text extraction')
    return {
      headline,
      supportingLine: extractBestLine(primaryText)
    }
  }

  try {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: buildCurateAdTextPrompt(headline, primaryText)
      }]
    })

    const supportingLine = (response.content[0] as { text: string }).text.trim()
    console.log('[Imagen] Claude picked supporting line:', supportingLine)

    return {
      headline,
      supportingLine: supportingLine.length > 80 ? supportingLine.slice(0, 77) + '...' : supportingLine
    }
  } catch (err) {
    console.error('[Imagen] Claude text curation failed:', err)
    return {
      headline,
      supportingLine: extractBestLine(primaryText)
    }
  }
}

// Note: prompt builder functions are now imported from @/lib/prompts/image-generation

export async function POST(request: NextRequest) {
  try {
    const body: GenerateImageRequest = await request.json()

    if (!body.adCopy || !body.product?.name) {
      return NextResponse.json(
        { error: 'Missing required fields: adCopy, product.name' },
        { status: 400 }
      )
    }

    // Check AI credit limits if userId provided
    if (body.userId) {
      // Inline credit check — mirrors /api/ai/usage logic
      const PLAN_CREDITS: Record<string, number> = { pro: 500, scale: 500, launch: 500 }
      const TRIAL_CREDITS = 25

      const [subResult, adminSubResult, overrideResult] = await Promise.all([
        supabaseAdmin.from('subscriptions').select('plan, status').eq('user_id', body.userId).single(),
        supabaseAdmin.from('admin_granted_subscriptions').select('plan, is_active, expires_at')
          .eq('user_id', body.userId).eq('is_active', true).order('created_at', { ascending: false }).limit(1).single(),
        supabaseAdmin.from('ai_credit_overrides').select('credit_limit').eq('user_id', body.userId).single(),
      ])

      const sub = subResult.data
      const adminSub = adminSubResult.data
      const override = overrideResult.data
      const hasAdminSub = adminSub?.is_active && new Date(adminSub.expires_at) > new Date()
      const isTrial = sub?.status === 'trialing'
      const isActive = sub?.status === 'active' || isTrial || hasAdminSub

      if (isActive) {
        const plan = sub?.plan || 'launch'
        let planLimit = isTrial ? TRIAL_CREDITS : (PLAN_CREDITS[plan] || PLAN_CREDITS.launch)
        if (override?.credit_limit) planLimit = override.credit_limit

        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        // Sum credit_cost for used credits
        let usedQuery = supabaseAdmin.from('ai_generation_usage').select('credit_cost').eq('user_id', body.userId)
        if (!isTrial || override) {
          usedQuery = usedQuery.gte('created_at', monthStart)
        }
        const { data: usageRows } = await usedQuery
        const used = (usageRows || []).reduce((sum: number, row: any) => sum + (row.credit_cost || 5), 0)

        // Get purchased credits this month
        const { data: purchaseRows } = await supabaseAdmin
          .from('ai_credit_purchases').select('credits').eq('user_id', body.userId).gte('created_at', monthStart)
        const purchased = (purchaseRows || []).reduce((sum: number, row: any) => sum + row.credits, 0)

        const totalAvailable = planLimit + purchased
        const IMAGE_CREDIT_COST = 5

        if (used + IMAGE_CREDIT_COST > totalAvailable) {
          return NextResponse.json(
            {
              error: 'AI credit limit reached',
              totalAvailable,
              used,
              remaining: Math.max(0, totalAvailable - used),
              status: isTrial ? 'trial' : 'active',
            },
            { status: 429 }
          )
        }
      }
    }

    const client = getGenAI()
    if (!client) {
      return NextResponse.json(
        { error: 'Image generation not configured' },
        { status: 503 }
      )
    }

    // Map aspect ratio to Gemini format (e.g. '9:16' → '9:16')
    const aspectRatio = body.aspectRatio || '1:1'

    const hasProductImage = body.product.imageBase64 && body.product.imageMimeType
    const hasReferenceAd = body.referenceAd?.imageBase64 && body.referenceAd?.imageMimeType
    let geminiFallbackReason = ''

    console.log('[Imagen] Has product image:', Boolean(hasProductImage), 'imageBase64 length:', body.product.imageBase64?.length || 0, 'mimeType:', body.product.imageMimeType || 'none')
    console.log('[Imagen] Has reference ad:', Boolean(hasReferenceAd), 'referenceAd length:', body.referenceAd?.imageBase64?.length || 0)

    // Open Prompt mode: skip text curation, use raw user prompt with no text overlay
    if (body.noTextOverlay && body.imagePrompt) {
      console.log('[Imagen] Open Prompt mode — no text overlay')

      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = []

      if (hasProductImage) {
        parts.push({
          inlineData: {
            mimeType: body.product.imageMimeType!,
            data: body.product.imageBase64!,
          }
        })
        parts.push({ text: buildOpenPromptWithImage(body) })
      } else {
        parts.push({ text: buildOpenPrompt(body) })
      }

      console.log('[Imagen] Open Prompt | Parts count:', parts.length, '| Has source image:', Boolean(hasProductImage))

      try {
        const response = await withRetry(() => client.models.generateContent({
          model: MODEL_NAME,
          contents: [{ role: 'user', parts }],
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: { aspectRatio },
          }
        }))

        const responseParts = response.candidates?.[0]?.content?.parts || []
        for (const part of responseParts) {
          if (part.inlineData?.data) {
            console.log('[Imagen] Open Prompt image generated successfully')
            const mimeType = detectMimeType(part.inlineData.data)

            // Log credit usage
            if (body.userId) {
              await supabaseAdmin.from('ai_generation_usage').insert({
                user_id: body.userId,
                generation_type: 'image',
                generation_label: 'Image: open-prompt',
                credit_cost: 5,
              })
            }

            return NextResponse.json({
              image: { base64: part.inlineData.data, mimeType },
              model: MODEL_NAME,
            })
          }
        }
        console.error('[Imagen] Open Prompt returned no image')
        return NextResponse.json({ error: 'No image generated' }, { status: 500 })
      } catch (err: unknown) {
        console.error('[Imagen] Open Prompt generation failed:', err)
        return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
      }
    }

    // Use Claude to intelligently pick the best text for the ad image
    console.log('[Imagen] Curating ad text with Claude...')
    const curatedText = await curateAdText(body.adCopy.headline, body.adCopy.primaryText)
    console.log('[Imagen] Curated text:', curatedText)

    if (hasProductImage || hasReferenceAd) {
      // Build the parts array - product image first (if available), then reference ad
      const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = []

      if (hasProductImage) {
        parts.push({
          inlineData: {
            mimeType: body.product.imageMimeType!,
            data: body.product.imageBase64!,
          }
        })
      }

      // If we have a reference ad, add it
      if (hasReferenceAd) {
        console.log('[Imagen] Adding reference ad image to request')
        parts.push({
          inlineData: {
            mimeType: body.referenceAd!.imageMimeType,
            data: body.referenceAd!.imageBase64,
          }
        })
      }

      // For clone mode, use Claude to analyze the reference ad's visual style
      // so Gemini gets explicit instructions instead of guessing
      let styleDescription: string | null = null
      if (hasReferenceAd && (body.style === 'clone' || !body.style)) {
        console.log('[Imagen] Analyzing reference ad style with Claude...')
        styleDescription = await analyzeReferenceAdStyle(
          body.referenceAd!.imageBase64,
          body.referenceAd!.imageMimeType
        )
      }

      // Select prompt based on what we have:
      // 1. Reference ad + product image -> dual-image prompt
      // 2. Reference ad only (no product image) -> reference-only prompt
      // 3. Custom imagePrompt (Create mode) -> custom prompt with user's direction
      // 4. Product image only -> default single-image prompt
      let prompt: string
      let promptType: string
      if (hasReferenceAd && hasProductImage) {
        prompt = buildDualImagePrompt(body, curatedText, styleDescription)
        promptType = 'dual-image (product + reference)'
      } else if (hasReferenceAd) {
        prompt = buildReferenceOnlyPrompt(body, curatedText, styleDescription)
        promptType = 'reference-only (no product image)'
      } else if (body.imagePrompt) {
        prompt = buildCustomPrompt(body, curatedText)
        promptType = 'custom (user prompt)'
      } else {
        prompt = buildImagePrompt(body, curatedText)
        promptType = 'product-only (no reference)'
      }
      parts.push({ text: prompt })

      console.log('[Imagen] Prompt type:', promptType, '| Parts count:', parts.length, '(images:', parts.length - 1, ')')
      console.log('[Imagen] Using model:', MODEL_NAME)

      try {
        const response = await withRetry(() => client.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: 'user',
              parts: parts
            }
          ],
          config: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: { aspectRatio },
          }
        }))

        // Extract the generated image from response
        const responseParts = response.candidates?.[0]?.content?.parts || []
        console.log('[Imagen] Response parts count:', responseParts.length)

        for (const part of responseParts) {
          if (part.inlineData) {
            console.log('[Imagen] Image generated successfully', hasReferenceAd ? 'with reference ad style' : 'with product reference')

            // Convert raw bytes to base64 if needed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rawData: any = part.inlineData.data
            let base64Data: string
            if (typeof rawData === 'string') {
              base64Data = rawData
            } else if (Buffer.isBuffer(rawData)) {
              base64Data = rawData.toString('base64')
            } else if (rawData instanceof Uint8Array) {
              base64Data = Buffer.from(rawData).toString('base64')
            } else {
              base64Data = Buffer.from(rawData as ArrayBuffer).toString('base64')
            }

            // Track usage with credit cost
            if (body.userId) {
              await supabaseAdmin.from('ai_generation_usage').insert({
                user_id: body.userId,
                generation_type: 'image',
                credit_cost: 5,
                generation_label: `Image: ${body.style || 'default'}`,
              })
            }

            return NextResponse.json({
              image: {
                base64: base64Data,
                mimeType: part.inlineData.mimeType || 'image/png',
              },
              model: MODEL_NAME,
              prompt: prompt.slice(0, 500),
            })
          }
        }

        geminiFallbackReason = 'Gemini returned response but no image part'
        console.error('[Imagen] WARNING:', geminiFallbackReason, 'Parts:', JSON.stringify(responseParts.map(p => ({ hasImage: !!p.inlineData, hasText: !!p.text, text: p.text?.slice(0, 100) }))))
      } catch (geminiError) {
        const errMsg = geminiError instanceof Error ? geminiError.message : String(geminiError)
        geminiFallbackReason = errMsg
        console.error('[Imagen] GEMINI FAILED — falling back to Imagen. Error:', errMsg)
      }
    } else {
      geminiFallbackReason = `No product image and no reference ad (hasProductImage=${hasProductImage}, hasReferenceAd=${hasReferenceAd})`
      console.log('[Imagen] Skipping Gemini — no images available, going to Imagen text-only')
    }

    // Text-only: use Gemini 3 Pro (same model as image-input path)
    console.log('[Imagen] Generating with Gemini 3 Pro text-only. Reason:', geminiFallbackReason)

    const prompt = buildTextOnlyPrompt(body, curatedText)

    const textOnlyResponse = await withRetry(() => client.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { aspectRatio },
      },
    }))

    const textOnlyParts = textOnlyResponse.candidates?.[0]?.content?.parts || []
    console.log('[Imagen] Text-only response parts count:', textOnlyParts.length)

    for (const part of textOnlyParts) {
      if (part.inlineData) {
        console.log('[Imagen] Image generated successfully with Gemini 3 Pro (text-only)')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawData: any = part.inlineData.data
        let base64Data: string
        if (typeof rawData === 'string') {
          base64Data = rawData
        } else if (Buffer.isBuffer(rawData)) {
          base64Data = rawData.toString('base64')
        } else if (rawData instanceof Uint8Array) {
          base64Data = Buffer.from(rawData).toString('base64')
        } else {
          base64Data = Buffer.from(rawData as ArrayBuffer).toString('base64')
        }

        // Track usage with credit cost
        if (body.userId) {
          await supabaseAdmin.from('ai_generation_usage').insert({
            user_id: body.userId,
            generation_type: 'image',
            credit_cost: 5,
            generation_label: `Image: ${body.style || 'default'} (text-only)`,
          })
        }

        return NextResponse.json({
          image: {
            base64: base64Data,
            mimeType: part.inlineData.mimeType || 'image/png',
          },
          model: MODEL_NAME,
          prompt: prompt.slice(0, 500),
        })
      }
    }

    console.error('[Imagen] Gemini 3 Pro text-only returned no image')
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    )

  } catch (err) {
    console.error('[Imagen] Generation error:', err)

    const errorMessage = err instanceof Error ? err.message : 'Image generation failed'

    if (errorMessage.includes('quota') || errorMessage.includes('rate')) {
      return NextResponse.json(
        { error: 'Image generation quota exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
      return NextResponse.json(
        { error: 'Image could not be generated due to content policies. Try adjusting the ad copy.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
