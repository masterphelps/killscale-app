# KS Oracle Conversational Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the Oracle from a single-shot classifier into a three-tier conversational creative partner (Haiku router → Sonnet guide → Opus creative director).

**Architecture:** The existing Oracle route stays as a fast-path Haiku classifier. Two new API endpoints handle Sonnet (guided Q&A with clickable options) and Opus (creative brainstorming that crafts generation-ready prompts). A new chat thread component renders inline above the Oracle input. Escalation between tiers is driven by API responses.

**Tech Stack:** Next.js API routes, Anthropic SDK (Haiku/Sonnet/Opus), React state management, existing Oracle Box component (extended), Tailwind CSS.

**Design doc:** `docs/plans/2026-03-01-ks-oracle-conversational-design.md`

---

### Task 1: Add `conversation` workflow to oracle-route (Haiku)

**Files:**
- Modify: `app/api/creative-studio/oracle-route/route.ts`

**Step 1: Update the Haiku system prompt and response types**

Add `'conversation'` to the valid workflows. Update the system prompt to instruct Haiku to return `"conversation"` when the input is vague, exploratory, or doesn't match any clear workflow pattern.

In `app/api/creative-studio/oracle-route/route.ts`:

Add `'conversation'` to the `OracleResponse.workflow` union type (line 14):
```typescript
interface OracleResponse {
  workflow: 'create' | 'clone' | 'inspiration' | 'upload'
    | 'url-to-video' | 'ugc-video' | 'image-to-video'
    | 'open-prompt' | 'text-to-video' | 'conversation'
  // ... rest unchanged
}
```

Add to `validWorkflows` array (line 135):
```typescript
const validWorkflows = [
  'create', 'clone', 'inspiration', 'upload',
  'url-to-video', 'ugc-video', 'image-to-video',
  'open-prompt', 'text-to-video', 'conversation',
]
```

Add to the end of the `SYSTEM_PROMPT` routing rules (after rule 10):
```
11. If the input is vague, exploratory, a greeting, or doesn't clearly match any workflow above, return "conversation". Examples: "I need new ads", "help me make something", "what can you do?", "I have a product", "not sure where to start"
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "oracle-route|error" | head -10`
Expected: Route compiles, no type errors.

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-route/route.ts
git commit -m "feat: add 'conversation' workflow to oracle-route for ambiguous inputs"
```

---

### Task 2: Create shared Oracle types

**Files:**
- Create: `components/creative-studio/oracle-types.ts`

**Step 1: Create the types file**

```typescript
// Oracle conversation types shared between components and API routes

export type OracleMode = 'idle' | 'chat' | 'creative'

export interface OracleOption {
  label: string
  value: string
}

export interface OracleContextCard {
  type: 'product' | 'style' | 'prompt-preview'
  data: Record<string, unknown>
}

export interface OracleMessage {
  id: string
  role: 'user' | 'oracle'
  content: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  isEscalating?: boolean
  promptPreview?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
}

export interface OracleChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  context: {
    productInfo?: Record<string, unknown>
    selectedOptions?: Record<string, string>
    format?: 'image' | 'video'
    outputType?: 'ad' | 'content'
    priorConversation?: { role: string; content: string }[]
  }
}

export interface OracleChatResponse {
  message: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]
  action?: {
    workflow: string
    prefilledData: Record<string, unknown>
  }
  escalate?: 'creative'
  analyzeUrl?: string
}

export interface OracleCreativeResponse {
  message: string
  options?: OracleOption[]
  generatedPrompt?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | grep "error" | head -5`
Expected: No errors (file isn't imported yet, but shouldn't cause issues).

**Step 3: Commit**

```bash
git add components/creative-studio/oracle-types.ts
git commit -m "feat: add shared Oracle conversation types"
```

---

### Task 3: Create oracle-chat API endpoint (Sonnet guide)

**Files:**
- Create: `app/api/creative-studio/oracle-chat/route.ts`

**Step 1: Create the Sonnet chat endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { OracleChatRequest, OracleChatResponse } from '@/components/creative-studio/oracle-types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are KS, the creative guide for KillScale Ad Studio. You help users figure out what they want to create and route them to the right workflow.

PERSONALITY: Warm, friendly, efficient. Like a creative partner who respects your time. 2-3 sentences max per response. Always include clickable options.

AVAILABLE WORKFLOWS (what you can route to):
- "create": Product URL → image ads with AI copy. Needs: product URL.
- "clone": Copy a competitor's ad style. Needs: competitor reference.
- "inspiration": Browse example ads for ideas. Needs: nothing.
- "upload": User's own image → ad. Needs: image (user uploads separately).
- "url-to-video": Product URL → 4 AI video ad concepts with overlays. Needs: product URL.
- "ugc-video": UGC testimonial-style video ad. Needs: product URL.
- "image-to-video": Animate an image into video. Needs: image.
- "text-to-video": Text description → video with director's review. Needs: prompt.
- "open-prompt": Direct prompt → image or video content. Needs: prompt + format.

YOUR JOB:
1. Understand what the user wants to create
2. Ask targeted questions with 2-4 clickable options to narrow down the workflow
3. When you have enough info, return an action to route them

RULES:
- ALWAYS include an "options" array with 2-4 options in your response
- Each option has "label" (short, what the button says) and "value" (internal identifier)
- If the user mentions a URL, include "analyzeUrl" with the URL so the client can fetch product info
- If the user wants to brainstorm ideas or seems unsure about creative direction, include "escalate": "creative"
- When you have enough info to route, include "action" with the workflow and any prefilled data
- Max 5 turns before routing — don't loop forever. Make your best guess and route.
- Never ask for information the workflow will collect itself (e.g., don't ask for style if url-to-video has a style picker)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "Your friendly response text",
  "options": [{"label": "Button Text", "value": "internal_value"}],
  "analyzeUrl": "https://..." or null,
  "action": {"workflow": "create", "prefilledData": {"productUrl": "..."}} or null,
  "escalate": "creative" or null
}

Only include fields that are relevant. Omit null fields.`

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

    const fullSystem = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\nCONTEXT:\n${contextParts.join('\n')}`
      : SYSTEM_PROMPT

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: fullSystem,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON response
    let parsed: OracleChatResponse
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: text }
    } catch {
      parsed = { message: text }
    }

    // Ensure message exists
    if (!parsed.message) parsed.message = text

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[OracleChat] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Oracle chat failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "oracle-chat|error" | head -10`
Expected: Route compiles successfully.

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-chat/route.ts
git commit -m "feat: add oracle-chat Sonnet endpoint for guided conversation"
```

---

### Task 4: Create oracle-creative API endpoint (Opus creative director)

**Files:**
- Create: `app/api/creative-studio/oracle-creative/route.ts`

**Step 1: Create the Opus creative director endpoint**

```typescript
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
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "oracle-creative|error" | head -10`
Expected: Route compiles successfully.

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-creative/route.ts
git commit -m "feat: add oracle-creative Opus endpoint for brainstorming"
```

---

### Task 5: Create Oracle chat thread UI component

**Files:**
- Create: `components/creative-studio/oracle-chat-thread.tsx`

**Step 1: Create the chat thread component**

This renders the message list with all message types: text, options, context cards, prompt previews, and the escalation transition.

```typescript
'use client'

import { useRef, useEffect } from 'react'
import { Sparkles, ArrowRight, Video, ImageIcon, Pencil, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OracleMessage, OracleOption, OracleContextCard } from './oracle-types'

interface OracleChatThreadProps {
  messages: OracleMessage[]
  onOptionClick: (option: OracleOption) => void
  onPromptAction: (action: 'generate' | 'edit' | 'startOver', prompt?: string, format?: string) => void
  isSending: boolean
}

export function OracleChatThread({ messages, onOptionClick, onPromptAction, isSending }: OracleChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isSending])

  return (
    <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700/50">
      {messages.map((msg) => (
        <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
          <div className={cn(
            'max-w-[85%] rounded-2xl px-4 py-3',
            msg.role === 'user'
              ? 'bg-purple-500/20 text-white'
              : 'bg-white/[0.05] text-zinc-200 border border-white/[0.06]'
          )}>
            {/* Oracle label */}
            {msg.role === 'oracle' && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">KS</span>
              </div>
            )}

            {/* Escalation message */}
            {msg.isEscalating && (
              <div className="flex items-center gap-2 py-2 mb-2 border-b border-purple-500/20">
                <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                </div>
                <span className="text-sm text-purple-300 italic">Putting on my creative director hat...</span>
              </div>
            )}

            {/* Message text */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

            {/* Context cards */}
            {msg.contextCards && msg.contextCards.length > 0 && (
              <div className="mt-3 space-y-2">
                {msg.contextCards.map((card, i) => (
                  <ContextCardDisplay key={i} card={card} />
                ))}
              </div>
            )}

            {/* Prompt preview */}
            {msg.promptPreview && (
              <div className="mt-3 bg-black/30 border border-purple-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Ready to generate</span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{msg.promptPreview.prompt}&rdquo;</p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onPromptAction('generate', msg.promptPreview!.prompt, msg.promptPreview!.format)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
                  >
                    {msg.promptPreview.format === 'video' ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Generate {msg.promptPreview.format === 'video' ? 'Video' : 'Image'}
                  </button>
                  <button
                    onClick={() => onPromptAction('edit', msg.promptPreview!.prompt, msg.promptPreview!.format)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-sm transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => onPromptAction('startOver')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-sm transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Start Over
                  </button>
                </div>
              </div>
            )}

            {/* Clickable options */}
            {msg.options && msg.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {msg.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onOptionClick(opt)}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-sm text-purple-300 hover:bg-purple-500/25 hover:text-purple-200 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Sending indicator */}
      {isSending && (
        <div className="flex justify-start">
          <div className="bg-white/[0.05] border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            <span className="text-sm text-zinc-400">KS is thinking...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function ContextCardDisplay({ card }: { card: OracleContextCard }) {
  if (card.type === 'product') {
    const d = card.data as Record<string, string>
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <ArrowRight className="w-3 h-3 text-purple-400" />
          <span className="text-xs font-medium text-zinc-400">Product detected</span>
        </div>
        <p className="text-sm font-medium text-white">{d.name || 'Product'}</p>
        {d.price && <p className="text-xs text-zinc-400 mt-0.5">{d.price}</p>}
        {d.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{d.description}</p>}
      </div>
    )
  }
  return null
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | grep "error" | head -5`
Expected: Compiles (component not mounted yet, just needs to parse).

**Step 3: Commit**

```bash
git add components/creative-studio/oracle-chat-thread.tsx
git commit -m "feat: add Oracle chat thread UI component with message types"
```

---

### Task 6: Integrate chat state and UI into ad-studio page

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

This is the biggest task — wiring the conversational flow into the existing Oracle landing page.

**Step 1: Add imports and state**

At the top of the file, add imports:
```typescript
import { OracleChatThread } from '@/components/creative-studio/oracle-chat-thread'
import type { OracleMode, OracleMessage, OracleOption, OracleChatResponse, OracleCreativeResponse } from '@/components/creative-studio/oracle-types'
```

In the state section (near the existing Oracle state around line 451), add:
```typescript
// Oracle conversation state
const [oracleMode, setOracleMode] = useState<OracleMode>('idle')
const [oracleMessages, setOracleMessages] = useState<OracleMessage[]>([])
const [oracleContext, setOracleContext] = useState<Record<string, unknown>>({})
const [oracleSending, setOracleSending] = useState(false)
const oracleMsgIdRef = useRef(0)
```

Add a helper to create message objects:
```typescript
const makeOracleMsg = useCallback((role: 'user' | 'oracle', content: string, extra?: Partial<OracleMessage>): OracleMessage => {
  oracleMsgIdRef.current += 1
  return { id: `om-${oracleMsgIdRef.current}`, role, content, ...extra }
}, [])
```

**Step 2: Modify handleOracleSubmit to handle 'conversation' workflow**

In the existing `handleOracleSubmit` function, add a case for `workflow === 'conversation'` in the switch statement (after the default case):

```typescript
case 'conversation': {
  // Haiku couldn't classify — start Sonnet conversation
  const userMsg = makeOracleMsg('user', submission.text)
  setOracleMessages([userMsg])
  setOracleMode('chat')
  setOracleSending(true)
  // Send first turn to Sonnet
  try {
    const chatRes = await fetch('/api/creative-studio/oracle-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: submission.text }],
        context: { format: submission.format, outputType: submission.outputType },
      }),
    })
    const chatData: OracleChatResponse = await chatRes.json()
    if (!chatRes.ok) throw new Error(chatData.message || 'Chat failed')

    // If Sonnet detected a URL, analyze it
    if (chatData.analyzeUrl) {
      try {
        const urlRes = await fetch('/api/creative-studio/analyze-product-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: chatData.analyzeUrl }),
        })
        if (urlRes.ok) {
          const urlData = await urlRes.json()
          setOracleContext(prev => ({ ...prev, productInfo: urlData }))
          // Add product context card to Sonnet's message
          if (!chatData.contextCards) chatData.contextCards = []
          chatData.contextCards.push({ type: 'product', data: urlData })
        }
      } catch { /* product analysis is best-effort */ }
    }

    const oracleMsg = makeOracleMsg('oracle', chatData.message, {
      options: chatData.options,
      contextCards: chatData.contextCards,
    })
    setOracleMessages(prev => [...prev, oracleMsg])

    // If Sonnet already has an action, route immediately
    if (chatData.action) {
      handleOracleAction(chatData.action)
    }
  } catch (err) {
    const errMsg = makeOracleMsg('oracle', 'Sorry, something went wrong. Try again or pick a shortcut below.')
    setOracleMessages(prev => [...prev, errMsg])
    setOracleMode('idle')
  } finally {
    setOracleSending(false)
  }
  break
}
```

**Step 3: Add handleOracleChatSend function**

This handles subsequent turns in the Sonnet conversation (when user types or clicks an option):

```typescript
const handleOracleChatSend = useCallback(async (userText: string) => {
  const userMsg = makeOracleMsg('user', userText)
  setOracleMessages(prev => [...prev, userMsg])
  setOracleSending(true)

  // Build messages array from history
  const allMessages = [...oracleMessages, userMsg]
    .map(m => ({ role: m.role === 'oracle' ? 'assistant' as const : 'user' as const, content: m.content }))

  try {
    const endpoint = oracleMode === 'creative'
      ? '/api/creative-studio/oracle-creative'
      : '/api/creative-studio/oracle-chat'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: allMessages,
        context: oracleContext,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Chat failed')

    // Handle Sonnet response
    if (oracleMode === 'chat') {
      const chatData = data as OracleChatResponse

      // URL analysis
      if (chatData.analyzeUrl) {
        try {
          const urlRes = await fetch('/api/creative-studio/analyze-product-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: chatData.analyzeUrl }),
          })
          if (urlRes.ok) {
            const urlData = await urlRes.json()
            setOracleContext(prev => ({ ...prev, productInfo: urlData }))
            if (!chatData.contextCards) chatData.contextCards = []
            chatData.contextCards.push({ type: 'product', data: urlData })
          }
        } catch { /* best-effort */ }
      }

      const oracleMsg = makeOracleMsg('oracle', chatData.message, {
        options: chatData.options,
        contextCards: chatData.contextCards,
      })
      setOracleMessages(prev => [...prev, oracleMsg])

      // Escalate to creative mode
      if (chatData.escalate === 'creative') {
        const escMsg = makeOracleMsg('oracle', '', { isEscalating: true })
        setOracleMessages(prev => [...prev, escMsg])
        setOracleContext(prev => ({
          ...prev,
          priorConversation: allMessages,
        }))
        setOracleMode('creative')
        // Send opening turn to Opus
        const opusRes = await fetch('/api/creative-studio/oracle-creative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Start brainstorming based on the conversation so far.' }],
            context: { ...oracleContext, priorConversation: allMessages },
          }),
        })
        const opusData: OracleCreativeResponse = await opusRes.json()
        if (opusRes.ok) {
          const opusMsgObj = makeOracleMsg('oracle', opusData.message, {
            options: opusData.options,
            promptPreview: opusData.generatedPrompt || undefined,
          })
          setOracleMessages(prev => [...prev, opusMsgObj])
        }
      }

      // Route to workflow
      if (chatData.action) {
        handleOracleAction(chatData.action)
      }
    }
    // Handle Opus response
    else if (oracleMode === 'creative') {
      const creativeData = data as OracleCreativeResponse
      const opusMsg = makeOracleMsg('oracle', creativeData.message, {
        options: creativeData.options,
        promptPreview: creativeData.generatedPrompt || undefined,
      })
      setOracleMessages(prev => [...prev, opusMsg])
    }
  } catch (err) {
    const errMsg = makeOracleMsg('oracle', 'Something went wrong. Try again?', {
      options: [{ label: 'Try Again', value: '__retry' }, { label: 'Start Over', value: '__reset' }],
    })
    setOracleMessages(prev => [...prev, errMsg])
  } finally {
    setOracleSending(false)
  }
}, [oracleMessages, oracleMode, oracleContext, makeOracleMsg])
```

**Step 4: Add handleOracleAction helper**

This routes to a workflow from conversational data:
```typescript
const handleOracleAction = useCallback((action: { workflow: string; prefilledData: Record<string, unknown> }) => {
  const { workflow, prefilledData } = action
  if (prefilledData.productUrl) setProductUrl(prefilledData.productUrl as string)
  if (prefilledData.prompt) setOpenPromptText(prefilledData.prompt as string)

  // Reset conversation state
  setOracleMode('idle')
  setOracleMessages([])
  setOracleContext({})

  // Route
  switch (workflow) {
    case 'create': setMode('create'); break
    case 'clone': setMode('clone'); break
    case 'inspiration': setMode('inspiration'); break
    case 'upload': setMode('upload'); break
    case 'url-to-video': setMode('url-to-video'); break
    case 'ugc-video': setMode('ugc-video'); break
    case 'image-to-video': setMode('image-to-video'); break
    case 'text-to-video':
      router.push(`/dashboard/creative-studio/direct${prefilledData.prompt ? `?prompt=${encodeURIComponent(prefilledData.prompt as string)}` : ''}`)
      break
    case 'open-prompt':
      setOpenPromptMediaType((prefilledData.format as 'image' | 'video') || 'image')
      setMode('open-prompt')
      break
    default: setMode('create')
  }
}, [router])
```

**Step 5: Add handleOracleOptionClick and handleOraclePromptAction**

```typescript
const handleOracleOptionClick = useCallback((option: OracleOption) => {
  if (option.value === '__reset') {
    setOracleMode('idle')
    setOracleMessages([])
    setOracleContext({})
    return
  }
  if (option.value === '__retry') {
    // Remove last oracle message and resend
    setOracleMessages(prev => prev.slice(0, -1))
    return
  }
  handleOracleChatSend(option.label)
}, [handleOracleChatSend])

const handleOraclePromptAction = useCallback((action: 'generate' | 'edit' | 'startOver', prompt?: string, format?: string) => {
  if (action === 'startOver') {
    setOracleMode('idle')
    setOracleMessages([])
    setOracleContext({})
    return
  }
  if (!prompt) return
  setOpenPromptText(prompt)
  setOpenPromptMediaType((format as 'image' | 'video') || 'image')
  setOracleMode('idle')
  setOracleMessages([])
  setOracleContext({})
  if (action === 'generate') {
    oracleAutoGenRef.current = true
  }
  setMode('open-prompt')
}, [])
```

**Step 6: Modify the Oracle landing JSX**

In the `if (!mode)` block, wrap the Oracle Box + chips in a conditional on `oracleMode`:

```tsx
{/* Oracle landing page */}
{/* ... ambient gradient and noise stay unchanged ... */}

<div className="relative z-10 px-4 lg:px-8 py-6">
  <div className="max-w-3xl mx-auto space-y-10">

    {/* Header */}
    <div className="text-center pt-6 lg:pt-12">
      <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-white">Ad Studio</h1>
      <p className="text-zinc-400 text-sm mt-1.5">Create ads and content with AI</p>
    </div>

    {/* Chat thread (visible in chat/creative modes) */}
    {oracleMode !== 'idle' && (
      <OracleChatThread
        messages={oracleMessages}
        onOptionClick={handleOracleOptionClick}
        onPromptAction={handleOraclePromptAction}
        isSending={oracleSending}
      />
    )}

    {/* Oracle Box with glow — always visible */}
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-purple-500/[0.06] blur-2xl pointer-events-none" />
      <div className="relative">
        <OracleBox
          onSubmit={oracleMode === 'idle' ? handleOracleSubmit : (s) => handleOracleChatSend(s.text)}
          onDirectWorkflow={/* ... existing ... */}
          onOpenLibrary={() => setOpenPromptShowLibrary(true)}
          isLoading={oracleLoading || oracleSending}
          placeholder={oracleMode !== 'idle' ? 'Type or pick an option...' : oraclePlaceholder}
          initialImage={oraclePreloadImage}
          initialOutputType={oraclePreloadOutputType}
          initialFormat={oraclePreloadFormat}
        />
      </div>
    </div>

    {/* Chips + divider — only in idle mode */}
    {oracleMode === 'idle' && (
      <>
        {/* Hidden file input ... */}
        {/* Divider ... */}
        {/* OracleChips ... */}
      </>
    )}

    {/* Start over button in chat/creative modes */}
    {oracleMode !== 'idle' && (
      <button
        onClick={() => { setOracleMode('idle'); setOracleMessages([]); setOracleContext({}) }}
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mx-auto block"
      >
        Start over
      </button>
    )}
  </div>
</div>
```

**Step 7: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Compiles successfully.

**Step 8: Commit**

```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat: integrate conversational Oracle into Ad Studio with chat/creative modes"
```

---

### Task 7: Manual smoke test

**Step 1: Start dev server and test fast path (unchanged)**

1. Navigate to `/dashboard/creative-studio/ad-studio`
2. Click a chip (e.g., "Product → Ad") → should route directly to create mode
3. Paste a URL in Oracle → should route via Haiku as before
4. Type "clone this ad" → should route to clone mode

**Step 2: Test Sonnet conversation**

1. Type "I need to make some ads" → should trigger `conversation` from Haiku
2. Sonnet should respond with clickable options
3. Click an option → conversation continues
4. Eventually Sonnet routes to a workflow

**Step 3: Test Opus escalation**

1. Start a Sonnet conversation
2. Click "Let's Brainstorm" or type "help me think of ideas"
3. Should see "Putting on my creative director hat..."
4. Opus responds with creative angles and options
5. Continue discussing → Opus eventually crafts a prompt
6. Click "Generate" → should land in open-prompt with prompt pre-filled

**Step 4: Test edge cases**

1. Click "Start over" mid-conversation → returns to idle
2. Type while options are showing → should work (free type)
3. Empty submit in chat mode → should be ignored
4. Network error → should show error message with retry option

**Step 5: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address smoke test issues in conversational Oracle"
```

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `app/api/creative-studio/oracle-route/route.ts` | Modify — add `conversation` workflow |
| 2 | `components/creative-studio/oracle-types.ts` | Create — shared types |
| 3 | `app/api/creative-studio/oracle-chat/route.ts` | Create — Sonnet guide endpoint |
| 4 | `app/api/creative-studio/oracle-creative/route.ts` | Create — Opus creative director endpoint |
| 5 | `components/creative-studio/oracle-chat-thread.tsx` | Create — Chat thread UI |
| 6 | `app/dashboard/creative-studio/ad-studio/page.tsx` | Modify — integrate chat state + UI |

**Unchanged:** All existing mode views, generation endpoints, Oracle Box, Oracle Chips, video/image pipelines.
