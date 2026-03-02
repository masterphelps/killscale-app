# Oracle v2: Three-Tier Agentic System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Oracle from a simple router into an agentic system where models return `toolRequest` JSON, the client executes API endpoints, shows inline context cards, and feeds results back — enabling multi-step conversations with real tool use.

**Architecture:** Client-side tool orchestration. Haiku routes (unchanged), Sonnet and Opus return `toolRequest`/`mediaRequest` in their JSON responses. The ad-studio page intercepts these, calls existing API endpoints, renders result cards in the chat thread, and auto-sends results back to the model for chaining. Chat sessions persisted to Supabase for replay in AI Tasks.

**Tech Stack:** Existing creative-studio API endpoints as tools, Anthropic SDK (Haiku/Sonnet/Opus), Supabase (postgres + storage), existing MediaLibraryModal, existing OracleChatThread component.

**Design Doc:** `docs/plans/2026-03-02-oracle-v2-design.md`

---

## Task 1: Update Oracle Types

Add `toolRequest`, `mediaRequest`, and new context card types to the Oracle type system.

**Files:**
- Modify: `components/creative-studio/oracle-types.ts`

**Step 1: Add tool request types**

Add after the existing `OracleContextCard` interface (~line 15):

```typescript
// Tool system types
export type OracleToolName =
  | 'analyze_product'
  | 'analyze_video'
  | 'generate_overlay'
  | 'generate_ad_copy'
  | 'generate_image'
  | 'generate_video'
  | 'generate_concepts'
  | 'detect_text'
  | 'request_media'

export interface OracleToolRequest {
  tool: OracleToolName
  inputs: Record<string, unknown>
  reason: string
}

export interface OracleMediaRequest {
  type: 'image' | 'video' | 'any'
  reason: string
  multiple?: boolean
}

// Credit-costing tools map
export const ORACLE_TOOL_CREDITS: Partial<Record<OracleToolName, number>> = {
  generate_image: 5,
  generate_video: 50,
}
```

**Step 2: Expand context card types**

Replace the existing `OracleContextCard` interface:

```typescript
export type OracleContextCardType =
  | 'product'
  | 'style'
  | 'prompt-preview'
  // New tool result card types:
  | 'video-analysis'
  | 'overlay-preview'
  | 'ad-copy'
  | 'image-result'
  | 'video-result'
  | 'concepts'
  | 'media-attached'
  | 'credit-confirm'
  | 'tool-loading'
  | 'tool-error'

export interface OracleContextCard {
  type: OracleContextCardType
  data: Record<string, unknown>
}
```

**Step 3: Update OracleMessage to support media request and tool state**

Add to the `OracleMessage` interface:

```typescript
export interface OracleMessage {
  id: string
  role: 'user' | 'oracle'
  content: string
  tier?: OracleTier
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  isEscalating?: boolean
  promptPreview?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
  // New: tool system fields
  mediaRequest?: OracleMediaRequest
  toolRequest?: OracleToolRequest
  mediaAttachments?: Array<{
    url: string
    mimeType: string
    name: string
    type: 'image' | 'video'
    preview?: string  // thumbnail URL
  }>
}
```

**Step 4: Update response types**

Update `OracleChatResponse` and `OracleCreativeResponse` to include tool fields:

```typescript
export interface OracleChatResponse {
  message: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  action?: { workflow: string; prefilledData?: Record<string, unknown> }
  escalate?: 'creative'
  analyzeUrl?: string  // DEPRECATED — replaced by toolRequest analyze_product
  // New: tool system
  toolRequest?: OracleToolRequest
  mediaRequest?: OracleMediaRequest
}

export interface OracleCreativeResponse {
  message: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  generatedPrompt?: { prompt: string; format: 'image' | 'video'; style?: string; duration?: number }
  action?: { workflow: string; prefilledData?: Record<string, unknown> }
  analyzeUrl?: string  // DEPRECATED
  // New: tool system
  toolRequest?: OracleToolRequest
  mediaRequest?: OracleMediaRequest
}
```

**Step 5: Add session type for persistence**

```typescript
export interface OracleChatSession {
  id: string
  user_id: string
  ad_account_id: string
  title: string
  messages: OracleMessage[]
  context: Record<string, unknown>
  generated_assets: Array<{
    type: 'image' | 'video' | 'overlay' | 'ad-copy'
    url?: string
    mediaHash?: string
    toolUsed: OracleToolName
    creditCost: number
  }>
  highest_tier: 'haiku' | 'sonnet' | 'opus'
  status: 'active' | 'complete'
  created_at: string
  updated_at: string
}
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Passes (types only, no consumers yet)

**Step 7: Commit**

```bash
git add components/creative-studio/oracle-types.ts
git commit -m "feat(oracle-v2): add tool request, media request, and session types"
```

---

## Task 2: Update Sonnet System Prompt with Tool Awareness

Teach Sonnet about available tools so it returns `toolRequest` JSON when appropriate.

**Files:**
- Modify: `app/api/creative-studio/oracle-chat/route.ts`

**Step 1: Replace the system prompt**

Replace the existing system prompt string (lines 7-50) with a new version that includes tool definitions. The new prompt should:

1. Keep the existing personality (warm, friendly, efficient, 2-3 sentences)
2. Keep the existing workflow routing rules
3. Add a `## Tools` section listing all 9 tools with their inputs and when to use them
4. Add a `## Decision Matrix` section:
   - **Use a tool** when user gives a direct, specific task ("analyze this video", "generate ad copy for my product")
   - **Route to workflow** when user needs the full guided pipeline (pill selection, style picker, multi-step wizard)
   - **Escalate to Opus** when user wants creative brainstorming, rich prompt engineering, or multi-step creative work
5. Add `toolRequest` and `mediaRequest` to the JSON response format
6. Add rules:
   - "When user gives a direct task you can handle with tools, USE THEM — don't route to a workflow"
   - "Only return ONE of: toolRequest, mediaRequest, action, or escalate per response — never combine them"
   - "When you need media from the user, return mediaRequest with the appropriate type"
   - "Credit-costing tools (generate_image=5cr, generate_video=50cr): ALWAYS explain the cost in your message before returning toolRequest"

Here is the full replacement system prompt:

```typescript
const systemPrompt = `You are KS (KillScale), a warm and direct creative assistant for Meta advertisers. Keep responses to 2-3 sentences. Always include an "options" array with 2-4 clickable choices.

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
- NEVER craft generation prompts yourself — that's Opus's job. For generate_image/generate_video, escalate to Opus first.

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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Passes

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-chat/route.ts
git commit -m "feat(oracle-v2): update Sonnet system prompt with tool awareness"
```

---

## Task 3: Update Opus System Prompt with Tool + Generation Authority

Teach Opus about tools plus its special authority to craft rich generation prompts.

**Files:**
- Modify: `app/api/creative-studio/oracle-creative/route.ts`

**Step 1: Replace the system prompt**

Replace the existing system prompt (lines 7-63) with a new version that includes:

1. Keep existing personality (warm but bold, strong opinions, challenges safe choices)
2. Add the same tools table as Sonnet
3. Add Opus-specific generation rules:
   - "When using generate_image or generate_video, YOU write the prompt with rich detail — product knowledge, visual hooks, style cues, multiple reference images"
   - "You can route BACK DOWN to workflows with pre-loaded data (productKnowledge, concepts, overlayConfig)"
   - "Don't just execute — have opinions. Challenge safe choices."
4. Add same `toolRequest`/`mediaRequest` JSON format

Here is the full replacement system prompt:

```typescript
const systemPrompt = `You are KS Creative — KillScale's bold, opinionated creative director for Meta advertisers. You have strong opinions about what works visually and you're not afraid to share them. Keep responses punchy — 2-4 sentences with personality.

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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Passes

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-creative/route.ts
git commit -m "feat(oracle-v2): update Opus system prompt with tool + generation authority"
```

---

## Task 4: Build the Client-Side Tool Executor

This is the core engine: a function that receives a `toolRequest`, calls the corresponding API endpoint, and returns the result.

**Files:**
- Create: `lib/oracle-tools.ts`

**Step 1: Create the tool executor module**

```typescript
/**
 * Oracle Tool Executor
 *
 * Maps tool names to API endpoints and executes them.
 * Returns structured results for display as context cards.
 */

import type { OracleToolName, OracleContextCardType } from '@/components/creative-studio/oracle-types'

export interface ToolExecutionResult {
  success: boolean
  cardType: OracleContextCardType
  data: Record<string, unknown>
  /** Short summary to send back to the model as context */
  modelSummary: string
  /** If this tool generated a saveable asset */
  generatedAsset?: {
    type: 'image' | 'video' | 'overlay' | 'ad-copy'
    url?: string
    mediaHash?: string
    creditCost: number
  }
}

interface ToolContext {
  userId: string
  adAccountId: string
  /** Product info from prior analyze_product call */
  productInfo?: Record<string, unknown>
  /** Product images (base64) from prior analyze_product call */
  productImages?: Array<{ base64: string; mimeType: string }>
  /** Media provided by user via mediaRequest */
  userMedia?: Array<{ url: string; mimeType: string; name: string; type: string }>
}

export async function executeOracleTool(
  tool: OracleToolName,
  inputs: Record<string, unknown>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  switch (tool) {
    case 'analyze_product':
      return executeAnalyzeProduct(inputs, context)
    case 'analyze_video':
      return executeAnalyzeVideo(inputs, context)
    case 'generate_overlay':
      return executeGenerateOverlay(inputs, context)
    case 'generate_ad_copy':
      return executeGenerateAdCopy(inputs, context)
    case 'generate_image':
      return executeGenerateImage(inputs, context)
    case 'generate_video':
      return executeGenerateVideo(inputs, context)
    case 'generate_concepts':
      return executeGenerateConcepts(inputs, context)
    case 'detect_text':
      return executeDetectText(inputs, context)
    default:
      return {
        success: false,
        cardType: 'tool-error',
        data: { error: `Unknown tool: ${tool}` },
        modelSummary: `Error: Unknown tool "${tool}"`,
      }
  }
}

// --- Individual tool executors ---

async function executeAnalyzeProduct(
  inputs: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const url = inputs.url as string
    if (!url) throw new Error('Missing url input')

    const res = await fetch('/api/creative-studio/analyze-product-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Product analysis failed')

    const product = data.product || {}
    const imageCount = data.productImages?.length || 0

    return {
      success: true,
      cardType: 'product',
      data: {
        product,
        productImages: data.productImages,
        url,
      },
      modelSummary: `Product analyzed: "${product.name || 'Unknown'}". Price: ${product.price || 'N/A'}. ${product.features?.length || 0} features found. ${imageCount} product images available. Key details: ${product.description?.slice(0, 200) || 'No description'}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Product analysis failed'
    return {
      success: false,
      cardType: 'tool-error',
      data: { error: msg },
      modelSummary: `Error analyzing product: ${msg}`,
    }
  }
}

async function executeAnalyzeVideo(
  inputs: Record<string, unknown>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const mediaHash = inputs.mediaHash as string
    if (!mediaHash) throw new Error('Missing mediaHash input')

    const res = await fetch('/api/creative-studio/analyze-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: context.userId,
        adAccountId: context.adAccountId,
        mediaHash,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Video analysis failed')

    const analysis = data.analysis || {}
    const transcript = data.transcript || analysis.transcript || ''

    return {
      success: true,
      cardType: 'video-analysis',
      data: {
        analysis,
        transcript: transcript.slice(0, 500),
        funnelScores: analysis.funnelScores,
        styleDetection: analysis.styleDetection,
        scriptSuggestions: data.scriptSuggestions,
      },
      modelSummary: `Video analyzed. Transcript (first 300 chars): "${transcript.slice(0, 300)}". Hook score: ${analysis.funnelScores?.hook?.score || 'N/A'}/100, Hold: ${analysis.funnelScores?.hold?.score || 'N/A'}/100, Click: ${analysis.funnelScores?.click?.score || 'N/A'}/100, Convert: ${analysis.funnelScores?.convert?.score || 'N/A'}/100. Style: ${analysis.styleDetection?.visualStyle || 'unknown'}, Tone: ${analysis.styleDetection?.emotionalTone || 'unknown'}.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Video analysis failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error analyzing video: ${msg}` }
  }
}

async function executeGenerateOverlay(
  inputs: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const videoUrl = inputs.videoUrl as string
    const instruction = (inputs.instruction as string) || 'generate captions'
    const durationSeconds = (inputs.durationSeconds as number) || 8

    if (!videoUrl) throw new Error('Missing videoUrl input')

    const res = await fetch('/api/creative-studio/generate-overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, instruction, durationSeconds }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Overlay generation failed')

    const config = data.overlayConfig || {}
    const captionCount = config.captions?.length || 0

    return {
      success: true,
      cardType: 'overlay-preview',
      data: {
        overlayConfig: config,
        transcript: data.transcript,
        hookText: config.hook?.text,
        captionCount,
        ctaText: config.cta?.text,
        style: config.style,
      },
      modelSummary: `Overlay generated. Hook: "${config.hook?.text || 'none'}". ${captionCount} captions. CTA: "${config.cta?.text || 'none'}". Style: ${config.style || 'default'}.`,
      generatedAsset: {
        type: 'overlay',
        creditCost: 0,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Overlay generation failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error generating overlay: ${msg}` }
  }
}

async function executeGenerateAdCopy(
  inputs: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const product = inputs.product as Record<string, unknown>
    if (!product) throw new Error('Missing product input')

    const res = await fetch('/api/creative-studio/generate-from-competitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product,
        competitorAd: inputs.competitorAd || { pageName: product.name || 'Product' },
        isRefresh: !inputs.competitorAd, // Use refresh prompt when no competitor
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Ad copy generation failed')

    const ads = data.ads || []
    return {
      success: true,
      cardType: 'ad-copy',
      data: { ads },
      modelSummary: `Generated ${ads.length} ad copy variants. Headlines: ${ads.map((a: { headline: string }) => `"${a.headline}"`).join(', ')}. Angles: ${ads.map((a: { angle: string }) => a.angle).join(', ')}.`,
      generatedAsset: {
        type: 'ad-copy',
        creditCost: 0,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ad copy generation failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error generating ad copy: ${msg}` }
  }
}

async function executeGenerateImage(
  inputs: Record<string, unknown>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const prompt = inputs.prompt as string
    const style = (inputs.style as string) || 'lifestyle'
    const product = (inputs.product as Record<string, unknown>) || context.productInfo || {}

    if (!prompt && !product.name) throw new Error('Missing prompt or product info')

    // Build request using product images from context if available
    const productImage = context.productImages?.[0]

    const res = await fetch('/api/creative-studio/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: context.userId,
        adCopy: {
          headline: (inputs.headline as string) || '',
          primaryText: (inputs.primaryText as string) || '',
        },
        product: {
          ...product,
          imageBase64: productImage?.base64,
          imageMimeType: productImage?.mimeType,
        },
        style,
        imagePrompt: prompt,
        noTextOverlay: !!inputs.noTextOverlay,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Image generation failed')

    return {
      success: true,
      cardType: 'image-result',
      data: {
        imageBase64: data.image?.base64,
        imageMimeType: data.image?.mimeType,
        model: data.model,
        prompt: data.prompt,
      },
      modelSummary: `Image generated successfully using ${data.model || 'Gemini'}. Style: ${style}. The image is now visible to the user in the chat.`,
      generatedAsset: {
        type: 'image',
        creditCost: 5,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image generation failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error generating image: ${msg}` }
  }
}

async function executeGenerateVideo(
  inputs: Record<string, unknown>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const prompt = inputs.prompt as string
    const videoStyle = (inputs.videoStyle as string) || 'product'
    const durationSeconds = (inputs.durationSeconds as number) || 8

    if (!prompt) throw new Error('Missing prompt input')

    // Build request with product images from context
    const productImages = context.productImages?.slice(0, 3).map(img => ({
      base64: img.base64,
      mimeType: img.mimeType,
    })) || []

    const res = await fetch('/api/creative-studio/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: context.userId,
        adAccountId: context.adAccountId,
        prompt,
        videoStyle,
        durationSeconds,
        productImages,
        productName: (context.productInfo as Record<string, unknown>)?.name || '',
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Video generation failed')

    return {
      success: true,
      cardType: 'video-result',
      data: {
        jobId: data.jobId,
        status: data.status,
        creditCost: data.creditCost,
        provider: data.provider,
      },
      modelSummary: `Video generation started (job ${data.jobId}). ${data.creditCost} credits used. Status: ${data.status}. The video is generating and will appear when ready (~2-5 minutes).`,
      generatedAsset: {
        type: 'video',
        url: undefined, // Will be resolved when job completes
        creditCost: data.creditCost || 50,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Video generation failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error generating video: ${msg}` }
  }
}

async function executeGenerateConcepts(
  inputs: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const product = inputs.product as Record<string, unknown>
    if (!product) throw new Error('Missing product input')

    const res = await fetch('/api/creative-studio/generate-ad-concepts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product,
        count: 4,
        style: (inputs.style as string) || undefined,
        directionPrompt: (inputs.direction as string) || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Concept generation failed')

    const concepts = data.concepts || []
    return {
      success: true,
      cardType: 'concepts',
      data: { concepts },
      modelSummary: `Generated ${concepts.length} video ad concepts: ${concepts.map((c: { title: string; angle: string }) => `"${c.title}" (${c.angle})`).join(', ')}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Concept generation failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error generating concepts: ${msg}` }
  }
}

async function executeDetectText(
  inputs: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  try {
    const imageBase64 = inputs.imageBase64 as string
    const imageMimeType = inputs.imageMimeType as string

    if (!imageBase64 || !imageMimeType) throw new Error('Missing imageBase64 or imageMimeType')

    const res = await fetch('/api/creative-studio/detect-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, imageMimeType }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Text detection failed')

    const blocks = data.textBlocks || []
    return {
      success: true,
      cardType: 'product', // Reuse product card with text display
      data: { textBlocks: blocks },
      modelSummary: `Detected ${blocks.length} text blocks: ${blocks.map((b: { text: string; role: string }) => `"${b.text}" (${b.role})`).join(', ')}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Text detection failed'
    return { success: false, cardType: 'tool-error', data: { error: msg }, modelSummary: `Error detecting text: ${msg}` }
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Passes

**Step 3: Commit**

```bash
git add lib/oracle-tools.ts
git commit -m "feat(oracle-v2): client-side tool executor with all 9 tools"
```

---

## Task 5: Build Context Card Renderers for Tool Results

Add new context card components to the chat thread for tool results: video-analysis, overlay-preview, ad-copy, image-result, video-result, concepts, media-attached, credit-confirm, tool-loading, tool-error.

**Files:**
- Modify: `components/creative-studio/oracle-chat-thread.tsx`

**Step 1: Add new imports at top of file**

Add to existing imports:
```typescript
import { Loader2, AlertCircle, Play, Image as ImageIcon, Video, FileText, Palette, Mic, Eye } from 'lucide-react'
```

**Step 2: Add new context card renderer functions**

After the existing `renderContextCard()` function (around line 247), add new rendering cases. The existing function handles `product`, `style`, and `prompt-preview`. Add cases for the new types:

- **`tool-loading`**: Spinner with tool name and reason text. Purple border, subtle pulse animation.
- **`tool-error`**: Red border, AlertCircle icon, error message text.
- **`video-analysis`**: Transcript snippet (first 200 chars), 4 funnel score badges (Hook/Hold/Click/Convert with color coding), style tags.
- **`overlay-preview`**: Hook text in purple quote, caption count badge, CTA text, style badge. "Open in Editor" button.
- **`ad-copy`**: Render each ad variant as a mini card with headline (bold), primary text (truncated), angle badge (amber). Copy button per variant.
- **`image-result`**: Render the generated image as a `<img>` tag with `src="data:${mimeType};base64,${base64}"`. Below: Save, Edit, Download action buttons.
- **`video-result`**: Job status card. If generating: spinner + "Generating video..." with progress. If complete: video player. Reuse pattern from `VideoJobCard` but simplified for inline chat.
- **`concepts`**: 2x2 grid of concept cards. Each shows title (bold), angle badge, logline (truncated), visual world tag.
- **`media-attached`**: Small thumbnail with filename and type icon.
- **`credit-confirm`**: Yellow-amber card with "Generate for X credits?" text, Confirm and Cancel buttons. Shows remaining credits.

Each card should follow the existing pattern:
```tsx
<div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
  {/* Card content */}
</div>
```

**Step 3: Add media request buttons renderer**

In the message rendering section, after the context cards section and before the options section, add a `mediaRequest` renderer:

```tsx
{msg.mediaRequest && (
  <div className="mt-3 flex gap-2">
    <button
      onClick={() => onMediaUpload?.(msg.id, msg.mediaRequest!.type)}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 text-sm font-medium transition-colors"
    >
      <Upload className="w-4 h-4" />
      Upload
    </button>
    <button
      onClick={() => onMediaLibrary?.(msg.id, msg.mediaRequest!.type)}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700/70 border border-zinc-600/50 text-sm font-medium transition-colors"
    >
      <FolderOpen className="w-4 h-4" />
      Media Library
    </button>
  </div>
)}
```

**Step 4: Update the OracleChatThread component props**

Add new callback props:
```typescript
interface OracleChatThreadProps {
  // ... existing props
  onMediaUpload?: (messageId: string, type: 'image' | 'video' | 'any') => void
  onMediaLibrary?: (messageId: string, type: 'image' | 'video' | 'any') => void
  onCreditConfirm?: (messageId: string) => void
  onCreditCancel?: (messageId: string) => void
  onOpenInEditor?: (overlayConfig: Record<string, unknown>) => void
  onCopyText?: (text: string) => void
}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Passes (new props are optional, no consumers need updating yet)

**Step 6: Commit**

```bash
git add components/creative-studio/oracle-chat-thread.tsx
git commit -m "feat(oracle-v2): context card renderers for all tool result types"
```

---

## Task 6: Wire Tool Execution Loop into Ad Studio

This is the largest task — integrate the tool executor into the Oracle chat flow so `toolRequest` and `mediaRequest` responses are handled.

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1: Add imports**

```typescript
import { executeOracleTool, type ToolExecutionResult } from '@/lib/oracle-tools'
import { ORACLE_TOOL_CREDITS, type OracleToolRequest, type OracleMediaRequest } from '@/components/creative-studio/oracle-types'
```

**Step 2: Add new state variables near existing oracle state (~line 498)**

```typescript
const [oracleSessionId, setOracleSessionId] = useState<string | null>(null)
const [oracleGeneratedAssets, setOracleGeneratedAssets] = useState<Array<{
  type: string; url?: string; mediaHash?: string; toolUsed: string; creditCost: number
}>>([])
const [pendingToolRequest, setPendingToolRequest] = useState<OracleToolRequest | null>(null)
const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false)
const [mediaRequestMsgId, setMediaRequestMsgId] = useState<string | null>(null)
const [mediaRequestType, setMediaRequestType] = useState<'image' | 'video' | 'any'>('any')
```

**Step 3: Create the tool execution handler**

Add after `stripBase64ForContext` (~line 1815):

```typescript
const handleToolExecution = useCallback(async (
  toolReq: OracleToolRequest,
  tier: 'sonnet' | 'opus'
) => {
  const toolCredits = ORACLE_TOOL_CREDITS[toolReq.tool]

  // For credit-costing tools, show confirm card and wait
  if (toolCredits && toolCredits > 0) {
    // Add a credit-confirm card as an oracle message
    const confirmMsg: OracleMessage = {
      id: `tool-confirm-${Date.now()}`,
      role: 'oracle',
      tier,
      content: '',
      contextCards: [{
        type: 'credit-confirm',
        data: {
          tool: toolReq.tool,
          credits: toolCredits,
          reason: toolReq.reason,
          inputs: toolReq.inputs,
        }
      }],
    }
    setOracleMessages(prev => [...prev, confirmMsg])
    setPendingToolRequest(toolReq)
    return // Wait for user to click confirm
  }

  // For free tools, execute immediately
  await executeTool(toolReq, tier)
}, []) // executeTool added below

const executeTool = useCallback(async (
  toolReq: OracleToolRequest,
  tier: 'sonnet' | 'opus'
) => {
  // Show loading card
  const loadingMsgId = `tool-loading-${Date.now()}`
  const loadingMsg: OracleMessage = {
    id: loadingMsgId,
    role: 'oracle',
    tier,
    content: '',
    contextCards: [{
      type: 'tool-loading',
      data: { tool: toolReq.tool, reason: toolReq.reason },
    }],
  }
  setOracleMessages(prev => [...prev, loadingMsg])

  try {
    // Build tool context from current oracle context
    const toolContext = {
      userId: user?.id || '',
      adAccountId: currentAccountId || '',
      productInfo: oracleContext.productInfo as Record<string, unknown> | undefined,
      productImages: oracleContext.productImages as Array<{ base64: string; mimeType: string }> | undefined,
      userMedia: oracleContext.userMedia as Array<{ url: string; mimeType: string; name: string; type: string }> | undefined,
    }

    const result = await executeOracleTool(toolReq.tool, toolReq.inputs, toolContext)

    // Replace loading card with result card
    setOracleMessages(prev => prev.map(m =>
      m.id === loadingMsgId
        ? { ...m, contextCards: [{ type: result.cardType, data: result.data }] }
        : m
    ))

    // Update oracle context with tool results
    if (result.success) {
      if (toolReq.tool === 'analyze_product' && result.data.product) {
        setOracleContext(prev => ({
          ...prev,
          productInfo: stripBase64ForContext(result.data.product as Record<string, unknown>),
          productImages: result.data.productImages,
        }))
      }

      // Track generated assets
      if (result.generatedAsset) {
        setOracleGeneratedAssets(prev => [...prev, {
          ...result.generatedAsset!,
          toolUsed: toolReq.tool,
        }])
      }
    }

    // Auto-send result back to model for chaining
    const toolResultText = `Tool result (${toolReq.tool}): ${result.modelSummary}`
    await handleOracleChatSend(toolResultText, true) // true = isToolResult flag

  } catch (err) {
    // Replace loading with error
    setOracleMessages(prev => prev.map(m =>
      m.id === loadingMsgId
        ? {
            ...m,
            contextCards: [{
              type: 'tool-error' as const,
              data: { error: err instanceof Error ? err.message : 'Tool execution failed' },
            }],
          }
        : m
    ))
  }
}, [user?.id, currentAccountId, oracleContext, stripBase64ForContext])
```

**Step 4: Handle credit confirmation**

```typescript
const handleCreditConfirm = useCallback(async (messageId: string) => {
  if (!pendingToolRequest) return
  const toolReq = pendingToolRequest
  setPendingToolRequest(null)

  // Remove the confirm card
  setOracleMessages(prev => prev.filter(m => m.id !== messageId))

  // Execute the tool
  const tier = oracleMode === 'creative' ? 'opus' : 'sonnet'
  await executeTool(toolReq, tier as 'sonnet' | 'opus')
}, [pendingToolRequest, oracleMode, executeTool])

const handleCreditCancel = useCallback((messageId: string) => {
  setPendingToolRequest(null)
  // Remove confirm card and add a cancellation message
  setOracleMessages(prev => [
    ...prev.filter(m => m.id !== messageId),
    {
      id: `cancel-${Date.now()}`,
      role: 'oracle' as const,
      tier: oracleMode === 'creative' ? 'opus' as const : 'sonnet' as const,
      content: 'No problem. What else can I help with?',
      options: [
        { label: 'Try something else', value: 'try_else' },
        { label: 'Start over', value: '__reset' },
      ],
    },
  ])
}, [oracleMode])
```

**Step 5: Handle media requests**

```typescript
const handleMediaUpload = useCallback((messageId: string, type: 'image' | 'video' | 'any') => {
  setMediaRequestMsgId(messageId)
  setMediaRequestType(type)
  // Open file picker
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'image/*,video/*'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    // Upload to Supabase Storage
    // Then add media-attached card and auto-send to model
    // (Implementation follows the existing upload pattern in OracleBox)
  }
  input.click()
}, [])

const handleMediaLibrary = useCallback((messageId: string, type: 'image' | 'video' | 'any') => {
  setMediaRequestMsgId(messageId)
  setMediaRequestType(type)
  setMediaLibraryOpen(true)
}, [])

const handleMediaSelected = useCallback(async (items: Array<{ id: string; url?: string; name?: string; mediaType: string }>) => {
  setMediaLibraryOpen(false)
  if (items.length === 0) return

  const item = items[0]
  const mediaType = item.mediaType as 'image' | 'video'

  // Add media-attached card as user message
  const mediaMsg: OracleMessage = {
    id: `media-${Date.now()}`,
    role: 'user',
    content: '',
    mediaAttachments: [{
      url: item.url || '',
      mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      name: item.name || 'Media',
      type: mediaType,
    }],
  }
  setOracleMessages(prev => [...prev, mediaMsg])

  // Update context with provided media
  setOracleContext(prev => ({
    ...prev,
    userMedia: [...(prev.userMedia as Array<Record<string, unknown>> || []), {
      url: item.url,
      mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      name: item.name || 'Media',
      type: mediaType,
      mediaHash: item.id,
    }],
  }))

  // Auto-send to model
  await handleOracleChatSend(
    `User provided ${mediaType}: "${item.name || 'Media'}" at ${item.url}`,
    true
  )
}, [])
```

**Step 6: Modify handleOracleChatSend to handle toolRequest/mediaRequest responses**

In the existing `handleOracleChatSend` function (~lines 2017-2259), after parsing the Sonnet or Opus response, add:

```typescript
// After: const data = parsed as OracleChatResponse (or OracleCreativeResponse)

// Handle toolRequest
if (data.toolRequest) {
  const tier = oracleMode === 'creative' ? 'opus' : 'sonnet'
  // Show the model's message first
  if (data.message) {
    oracleMsg.content = data.message
    oracleMsg.options = data.options
    setOracleMessages(prev => [...prev, oracleMsg])
  }
  // Then execute the tool
  await handleToolExecution(data.toolRequest, tier as 'sonnet' | 'opus')
  setOracleSending(false)
  return
}

// Handle mediaRequest
if (data.mediaRequest) {
  oracleMsg.content = data.message
  oracleMsg.options = data.options
  oracleMsg.mediaRequest = data.mediaRequest
  setOracleMessages(prev => [...prev, oracleMsg])
  setOracleSending(false)
  return
}
```

Add an `isToolResult` parameter to `handleOracleChatSend`:

```typescript
const handleOracleChatSend = useCallback(async (text: string, isToolResult = false) => {
  // ... existing code
  // When isToolResult is true, don't show the text as a user message
  // (it's the tool result being fed back to the model)
  if (!isToolResult) {
    // Show user message in chat (existing code)
  }
  // ... rest of the function
```

**Step 7: Pass new callbacks to OracleChatThread**

In the JSX where `OracleChatThread` is rendered (~line 3660):

```tsx
<OracleChatThread
  messages={oracleMessages}
  currentTier={oracleMode === 'creative' ? 'opus' : 'sonnet'}
  onOptionClick={handleOracleOptionClick}
  onPromptAction={handleOraclePromptAction}
  isSending={oracleSending}
  isResearching={oracleResearching}
  // New callbacks:
  onMediaUpload={handleMediaUpload}
  onMediaLibrary={handleMediaLibrary}
  onCreditConfirm={handleCreditConfirm}
  onCreditCancel={handleCreditCancel}
/>
```

**Step 8: Add MediaLibraryModal for media requests**

Add near the end of the JSX (before the closing fragment):

```tsx
{mediaLibraryOpen && user && currentAccountId && (
  <MediaLibraryModal
    isOpen={mediaLibraryOpen}
    onClose={() => setMediaLibraryOpen(false)}
    userId={user.id}
    adAccountId={currentAccountId}
    selectedItems={[]}
    onSelectionChange={(items) => handleMediaSelected(items.map(item => ({
      id: item.id,
      url: item.mediaType === 'video'
        ? (item as any).source || (item as any).thumbnailUrl
        : (item as any).url,
      name: item.mediaType === 'video' ? (item as any).title : (item as any).name,
      mediaType: item.mediaType,
    })))}
    maxSelection={1}
    allowedTypes={
      mediaRequestType === 'image' ? ['image'] :
      mediaRequestType === 'video' ? ['video'] :
      ['image', 'video']
    }
  />
)}
```

**Step 9: Verify build**

Run: `npm run build`
Expected: Passes

**Step 10: Commit**

```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx lib/oracle-tools.ts
git commit -m "feat(oracle-v2): wire tool execution loop into ad-studio Oracle flow"
```

---

## Task 7: Database Migration for Chat Session Persistence

Create the `oracle_chat_sessions` table with RLS policies.

**Files:**
- Create: `supabase/migrations/068_oracle_chat_sessions.sql`

**Step 1: Write the migration**

```sql
-- Oracle Chat Sessions for Oracle v2 agentic system
-- Stores full conversation history with tool results and generated assets

CREATE TABLE IF NOT EXISTS oracle_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  title TEXT,
  messages JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  generated_assets JSONB DEFAULT '[]'::jsonb,
  highest_tier TEXT NOT NULL DEFAULT 'sonnet',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_user_id
  ON oracle_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_user_account
  ON oracle_chat_sessions(user_id, ad_account_id);
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_status
  ON oracle_chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_oracle_chat_sessions_created
  ON oracle_chat_sessions(created_at DESC);

-- RLS
ALTER TABLE oracle_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can view own oracle sessions"
  ON oracle_chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can create own oracle sessions"
  ON oracle_chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can update own oracle sessions"
  ON oracle_chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own oracle sessions" ON oracle_chat_sessions;
CREATE POLICY "Users can delete own oracle sessions"
  ON oracle_chat_sessions FOR DELETE
  USING (auth.uid() = user_id);
```

**Step 2: Apply migration**

Run via Supabase SQL Editor or CLI:
```bash
# If using Supabase CLI:
supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/068_oracle_chat_sessions.sql
git commit -m "feat(oracle-v2): add oracle_chat_sessions table with RLS"
```

---

## Task 8: Build Oracle Session CRUD API

Create the API endpoint for creating, reading, updating, and deleting chat sessions.

**Files:**
- Create: `app/api/creative-studio/oracle-session/route.ts`

**Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET: List sessions or fetch one by sessionId
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const adAccountId = searchParams.get('adAccountId')
  const sessionId = searchParams.get('sessionId')

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  try {
    if (sessionId) {
      // Fetch single session
      const { data, error } = await supabaseAdmin
        .from('oracle_chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (error) throw error
      return NextResponse.json({ session: data })
    }

    // List sessions for account
    let query = supabaseAdmin
      .from('oracle_chat_sessions')
      .select('id, title, highest_tier, status, generated_assets, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (adAccountId) {
      query = query.eq('ad_account_id', adAccountId)
    }

    const { data, error } = await query.limit(50)
    if (error) throw error

    return NextResponse.json({ sessions: data || [] })
  } catch (err) {
    console.error('Oracle session GET error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}

// POST: Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, adAccountId, title, messages, context, highestTier } = body

    if (!userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing userId or adAccountId' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('oracle_chat_sessions')
      .insert({
        user_id: userId,
        ad_account_id: adAccountId,
        title: title || 'New Chat',
        messages: messages || [],
        context: context || {},
        generated_assets: [],
        highest_tier: highestTier || 'sonnet',
        status: 'active',
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ sessionId: data.id })
  } catch (err) {
    console.error('Oracle session POST error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create session' },
      { status: 500 }
    )
  }
}

// PATCH: Update session (messages, assets, status, title)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, userId, messages, context, generatedAssets, highestTier, status, title } = body

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (messages !== undefined) updates.messages = messages
    if (context !== undefined) updates.context = context
    if (generatedAssets !== undefined) updates.generated_assets = generatedAssets
    if (highestTier !== undefined) updates.highest_tier = highestTier
    if (status !== undefined) updates.status = status
    if (title !== undefined) updates.title = title

    const { error } = await supabaseAdmin
      .from('oracle_chat_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Oracle session PATCH error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update session' },
      { status: 500 }
    )
  }
}

// DELETE: Remove session
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  const userId = searchParams.get('userId')

  if (!sessionId || !userId) {
    return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('oracle_chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Oracle session DELETE error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete session' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Passes

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-session/route.ts
git commit -m "feat(oracle-v2): oracle session CRUD API endpoint"
```

---

## Task 9: Add Session Persistence to Ad Studio Oracle

Wire the session creation/update into the existing Oracle chat flow so conversations are automatically saved.

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1: Add session persistence logic**

Add a debounced session save function:

```typescript
const saveSessionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

const saveOracleSession = useCallback(async () => {
  if (!user?.id || !currentAccountId || oracleMessages.length < 2) return

  const messages = oracleMessages.map(m => ({
    ...m,
    // Strip base64 from any image-result cards before persisting
    contextCards: m.contextCards?.map(c => {
      if (c.type === 'image-result' && c.data.imageBase64) {
        return { ...c, data: { ...c.data, imageBase64: undefined } }
      }
      return c
    }),
  }))

  const title = (oracleContext.productInfo as Record<string, unknown>)?.name as string
    || oracleMessages.find(m => m.role === 'user')?.content?.slice(0, 50)
    || 'Chat'

  const highestTier = oracleMode === 'creative' ? 'opus' : 'sonnet'

  if (oracleSessionId) {
    // Update existing session
    await fetch('/api/creative-studio/oracle-session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: oracleSessionId,
        userId: user.id,
        messages,
        context: oracleContext,
        generatedAssets: oracleGeneratedAssets,
        highestTier,
      }),
    })
  } else {
    // Create new session
    const res = await fetch('/api/creative-studio/oracle-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        adAccountId: currentAccountId,
        title,
        messages,
        context: oracleContext,
        highestTier,
      }),
    })
    const data = await res.json()
    if (data.sessionId) {
      setOracleSessionId(data.sessionId)
    }
  }
}, [user?.id, currentAccountId, oracleMessages, oracleContext, oracleMode, oracleSessionId, oracleGeneratedAssets])

// Debounced save: triggers 2 seconds after last message change
useEffect(() => {
  if (oracleMessages.length < 2) return
  if (saveSessionTimeoutRef.current) clearTimeout(saveSessionTimeoutRef.current)
  saveSessionTimeoutRef.current = setTimeout(() => {
    saveOracleSession()
  }, 2000)
  return () => {
    if (saveSessionTimeoutRef.current) clearTimeout(saveSessionTimeoutRef.current)
  }
}, [oracleMessages.length, saveOracleSession])
```

**Step 2: Reset session ID when conversation resets**

In the existing `handleOracleAction` function where `setOracleMessages([])` and `setOracleContext({})` are called, also add:

```typescript
setOracleSessionId(null)
setOracleGeneratedAssets([])
```

And in `handleOracleOptionClick` for `__reset`:

```typescript
// Mark session as complete before resetting
if (oracleSessionId) {
  fetch('/api/creative-studio/oracle-session', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: oracleSessionId,
      userId: user?.id,
      status: 'complete',
    }),
  })
}
setOracleSessionId(null)
setOracleGeneratedAssets([])
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Passes

**Step 4: Commit**

```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat(oracle-v2): auto-persist Oracle chat sessions to Supabase"
```

---

## Task 10: Add "Chats" Section to AI Tasks Page

Add the fourth collapsible section to the AI Tasks page showing Oracle chat sessions.

**Files:**
- Modify: `app/dashboard/creative-studio/ai-tasks/page.tsx`

**Step 1: Add imports and types**

Add import:
```typescript
import { MessageSquare } from 'lucide-react'
import type { OracleChatSession } from '@/components/creative-studio/oracle-types'
```

**Step 2: Add state for Oracle sessions**

Near the existing section state variables, add:

```typescript
const [oracleSessions, setOracleSessions] = useState<OracleChatSession[]>([])
const [isLoadingOracle, setIsLoadingOracle] = useState(true)
const [oracleChatExpanded, setOracleChatExpanded] = useState(true)
const [selectedOracleSessionId, setSelectedOracleSessionId] = useState<string | null>(null)
const [selectedOracleSession, setSelectedOracleSession] = useState<OracleChatSession | null>(null)
```

**Step 3: Add load function**

```typescript
const loadOracleSessions = useCallback(async () => {
  if (!user?.id || !currentAccountId) return
  setIsLoadingOracle(true)
  try {
    const res = await fetch(
      `/api/creative-studio/oracle-session?userId=${user.id}&adAccountId=${currentAccountId}`
    )
    const data = await res.json()
    if (data.sessions) setOracleSessions(data.sessions)
  } catch (err) {
    console.error('Failed to load oracle sessions:', err)
  } finally {
    setIsLoadingOracle(false)
  }
}, [user?.id, currentAccountId])
```

Add `loadOracleSessions` to the initial useEffect that loads all other data.

**Step 4: Add select handler**

```typescript
const handleSelectOracleSession = useCallback(async (sessionId: string) => {
  setSelectedOracleSessionId(sessionId)
  setSelectedSessionId(null)
  setSelectedCanvasId(null)
  setSelectedAnalysisId(null)
  setSelectedType('oracle')

  try {
    const res = await fetch(
      `/api/creative-studio/oracle-session?userId=${user?.id}&sessionId=${sessionId}`
    )
    const data = await res.json()
    if (data.session) setSelectedOracleSession(data.session)
  } catch (err) {
    console.error('Failed to load oracle session:', err)
  }
}, [user?.id])
```

**Step 5: Update `selectedType` union**

Find where `selectedType` is declared and add `'oracle'`:

```typescript
const [selectedType, setSelectedType] = useState<'session' | 'canvas' | 'analysis' | 'oracle' | null>(null)
```

**Step 6: Add Chats section to left sidebar**

After the Analysis section, add:

```tsx
{/* Oracle Chats Section */}
<div className="border-b border-border">
  <button
    onClick={() => setOracleChatExpanded(!oracleChatExpanded)}
    className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/30 transition-colors"
  >
    <div className="flex items-center gap-2">
      <MessageSquare className="w-4 h-4 text-purple-400" />
      <span className="text-sm font-medium text-white">Chats</span>
      {oracleSessions.length > 0 && (
        <span className="text-xs text-zinc-500">({oracleSessions.length})</span>
      )}
    </div>
    {oracleChatExpanded ? (
      <ChevronUp className="w-4 h-4 text-zinc-500" />
    ) : (
      <ChevronDown className="w-4 h-4 text-zinc-500" />
    )}
  </button>

  {oracleChatExpanded && (
    <div className="pb-2">
      {isLoadingOracle && oracleSessions.length === 0 ? (
        <div className="px-2 space-y-1">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : oracleSessions.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-zinc-500">No chats yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Start a conversation in Ad Studio
          </p>
        </div>
      ) : (
        <div className="px-2 space-y-1">
          {oracleSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSelectOracleSession(session.id)}
              className={cn(
                'w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors',
                selectedType === 'oracle' && session.id === selectedOracleSessionId
                  ? 'bg-purple-500/15 ring-1 ring-purple-500/50'
                  : 'hover:bg-zinc-800/50'
              )}
            >
              <MessageSquare className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{session.title || 'Chat'}</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    session.highest_tier === 'opus'
                      ? 'bg-fuchsia-500/20 text-fuchsia-300'
                      : 'bg-purple-500/20 text-purple-300'
                  )}>
                    {session.highest_tier === 'opus' ? 'Creative' : 'Guide'}
                  </span>
                  {(session.generated_assets as unknown[])?.length > 0 && (
                    <span>{(session.generated_assets as unknown[]).length} assets</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )}
</div>
```

**Step 7: Add detail panel for Oracle sessions**

In the detail panel conditional rendering area, add:

```tsx
{selectedType === 'oracle' && selectedOracleSession ? (
  <div className="max-w-4xl mx-auto p-6">
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold text-white">{selectedOracleSession.title || 'Chat'}</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            selectedOracleSession.highest_tier === 'opus'
              ? 'bg-fuchsia-500/20 text-fuchsia-300'
              : 'bg-purple-500/20 text-purple-300'
          )}>
            {selectedOracleSession.highest_tier === 'opus' ? 'Creative Director' : 'Guide'}
          </span>
          <span className="text-xs text-zinc-500">
            {new Date(selectedOracleSession.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <a
        href={`/dashboard/creative-studio/ad-studio?oracleSessionId=${selectedOracleSession.id}`}
        className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 text-sm font-medium transition-colors"
      >
        Continue Chat
      </a>
    </div>

    {/* Conversation replay */}
    <div className="space-y-4 mb-8">
      {(selectedOracleSession.messages as Array<{ id: string; role: string; content: string; tier?: string; contextCards?: Array<{ type: string; data: Record<string, unknown> }> }>).map((msg, i) => (
        <div
          key={msg.id || i}
          className={cn(
            'rounded-lg p-3',
            msg.role === 'user'
              ? 'bg-blue-500/10 border border-blue-500/20 ml-8'
              : 'bg-zinc-800/50 border border-zinc-700/50 mr-8'
          )}
        >
          <div className="text-xs text-zinc-500 mb-1">
            {msg.role === 'user' ? 'You' : msg.tier === 'opus' ? 'KS Creative' : 'KS'}
          </div>
          <div className="text-sm text-white whitespace-pre-wrap">{msg.content}</div>
        </div>
      ))}
    </div>

    {/* Generated assets gallery */}
    {(selectedOracleSession.generated_assets as Array<{ type: string; url?: string; creditCost: number }>)?.length > 0 && (
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Generated Assets</h3>
        <div className="grid grid-cols-2 gap-3">
          {(selectedOracleSession.generated_assets as Array<{ type: string; url?: string; creditCost: number }>).map((asset, i) => (
            <div key={i} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
              <div className="text-xs text-zinc-500 capitalize">{asset.type}</div>
              {asset.url && asset.type === 'image' && (
                <img src={asset.url} alt="" className="mt-2 rounded-lg max-h-48 object-cover" />
              )}
              {asset.creditCost > 0 && (
                <div className="text-xs text-amber-400 mt-1">{asset.creditCost} credits</div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
) : null}
```

**Step 8: Verify build**

Run: `npm run build`
Expected: Passes

**Step 9: Commit**

```bash
git add app/dashboard/creative-studio/ai-tasks/page.tsx
git commit -m "feat(oracle-v2): add Chats section to AI Tasks page"
```

---

## Task 11: Build Verification + Polish

Final verification and any remaining wiring.

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean pass with no type errors

**Step 2: Test matrix (manual)**

| Flow | Expected Behavior |
|------|-------------------|
| Type "analyze my product at example.com" | Haiku → Sonnet → Sonnet returns `toolRequest(analyze_product)` → product card appears in chat |
| Continue with "write ad copy" | Sonnet returns `toolRequest(generate_ad_copy)` with product context → ad-copy cards appear |
| Type "I want a creative image ad" | Haiku → Sonnet → Sonnet escalates to Opus → Opus asks about product/direction |
| Give Opus a product URL | Opus returns `toolRequest(analyze_product)` → product card → Opus proposes concepts |
| Opus generates image | Opus returns `toolRequest(generate_image)` → credit-confirm card → user clicks confirm → image appears |
| Type "analyze this video" → no video | Sonnet returns `mediaRequest(video)` → Upload/Library buttons appear |
| Select video from library | Media-attached card → Sonnet auto-calls `analyze_video` → video-analysis card appears |
| Navigate to AI Tasks | Chats section shows saved sessions with tier badges |
| Click a chat session | Full conversation replay with context cards |

**Step 3: Commit any polish fixes**

```bash
git add -A
git commit -m "fix(oracle-v2): build verification and polish"
```

---

## Files Summary

| # | File | Action | Task |
|---|------|--------|------|
| 1 | `components/creative-studio/oracle-types.ts` | Modify | Task 1 |
| 2 | `app/api/creative-studio/oracle-chat/route.ts` | Modify | Task 2 |
| 3 | `app/api/creative-studio/oracle-creative/route.ts` | Modify | Task 3 |
| 4 | `lib/oracle-tools.ts` | Create | Task 4 |
| 5 | `components/creative-studio/oracle-chat-thread.tsx` | Modify | Task 5 |
| 6 | `app/dashboard/creative-studio/ad-studio/page.tsx` | Modify | Tasks 6, 9 |
| 7 | `supabase/migrations/068_oracle_chat_sessions.sql` | Create | Task 7 |
| 8 | `app/api/creative-studio/oracle-session/route.ts` | Create | Task 8 |
| 9 | `app/dashboard/creative-studio/ai-tasks/page.tsx` | Modify | Task 10 |

---

## Dependency Order

```
Task 1 (types) ← no deps
Task 2 (Sonnet prompt) ← no deps
Task 3 (Opus prompt) ← no deps
Task 4 (tool executor) ← Task 1
Task 5 (card renderers) ← Task 1
Task 6 (client wiring) ← Tasks 1, 4, 5
Task 7 (DB migration) ← no deps
Task 8 (session API) ← Task 7
Task 9 (session persistence) ← Tasks 6, 8
Task 10 (AI Tasks chats) ← Tasks 1, 8
Task 11 (verification) ← all above
```

Tasks 1, 2, 3, 7 can run in parallel.
Tasks 4 and 5 can run in parallel (both depend only on Task 1).
Task 6 depends on 4 and 5.
Tasks 8 and 10 depend on 7.
Task 9 depends on 6 and 8.
