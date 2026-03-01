# KS Oracle — Conversational Creative Partner

## Overview

Evolve the Oracle from a single-shot classifier into a three-tier conversational creative partner. Users can paste a URL and get routed instantly (like today), ask vague questions and get guided to the right workflow, or brainstorm creative concepts with an AI creative director that crafts generation-ready prompts.

**Why:** The current Oracle routes well for users who know what they want, but falls short for users who are exploring, unsure, or want creative guidance. The conversational Oracle meets users where they are.

**Name:** "KS" in chat messages. "The Oracle" as the feature name. Chips and existing workflows unchanged.

---

## Three-Tier Model

| Tier | Model | Trigger | Role | Cost |
|---|---|---|---|---|
| **Router** | Haiku | Clear intent (URL, keywords, chip click, image) | Classify and route immediately | Free |
| **Guide** | Sonnet | Vague/exploratory input, Haiku returns `conversation` | Ask targeted questions with clickable options, gather info, route to workflow with pre-filled data | Free |
| **Creative Director** | Opus (cheap) | User chooses "Let's brainstorm" or Sonnet detects exploration | Real creative brainstorming partner. Discusses concepts, challenges ideas, crafts a generation-ready prompt | Free |

**All tiers are free** — the Oracle is routing and guidance, not generation. Credits only charged when the final generation pipeline runs (images = 5cr, videos = 50cr).

---

## Escalation Flow

```
User Input
    │
    ▼
Haiku (oracle-route) ──── clear intent ──── Route to Workflow
    │
    │ ambiguous / vague
    ▼
Sonnet (oracle-chat) ──── gathered enough ──── Route to Workflow (pre-filled)
    │
    │ user wants to brainstorm
    │ "putting on my creative director hat..."
    ▼
Opus (oracle-creative) ──── agreed on concept ──── Pre-fill Open Prompt ──── Generate
```

**Haiku decision boundary:** URL present + clear format → route. Keywords match → route. Image attached → route. Everything else → `workflow: 'conversation'`.

**Sonnet → Opus trigger:** User clicks "Let's Brainstorm" option, or types something like "help me think", "I'm not sure", "what would you suggest", "give me ideas".

**Opus → Generation:** When conversation lands on an agreed concept, Opus returns a `generatedPrompt` crafted for the target pipeline (Veo prompt style for video, Gemini prompt style for image). This pre-fills open-prompt, and the user clicks Generate.

---

## Chat UI

The Oracle landing page transforms inline when conversation starts:

```
┌─────────────────────────────────────────────┐
│   (ambient gradient background)             │
│                                             │
│   ┌─ Chat Thread (scrollable) ────────┐     │
│   │                                   │     │
│   │  KS: Hey! What are we making      │     │
│   │      today?                       │     │
│   │                                   │     │
│   │  You: I need video ads for my     │     │
│   │       skincare line fff.com/prod  │     │
│   │                                   │     │
│   │  KS: Nice, checking that out...   │     │
│   │  ┌──────────────────────────┐     │     │
│   │  │ 🧴 FFF Skincare          │     │     │
│   │  │ Hydrating Face Serum     │     │     │
│   │  │ $34.99                   │     │     │
│   │  └──────────────────────────┘     │     │
│   │                                   │     │
│   │  KS: What would you like to do?   │     │
│   │  [Jump to Concept Studio]         │     │
│   │  [Let's Brainstorm]               │     │
│   │                                   │     │
│   └───────────────────────────────────┘     │
│                                             │
│   ┌─ Oracle Input ────────────────────┐     │
│   │ Type or pick an option...     [→] │     │
│   └───────────────────────────────────┘     │
│                                             │
│   ── or jump to ──  (hidden during chat)    │
│   [Product→Ad] [Clone] [UGC] ...           │
└─────────────────────────────────────────────┘
```

### UI Elements

- **Chat messages** stack above Oracle input, scrollable
- **Context cards** appear inline when Oracle gathers data (product info, style preview, prompt preview)
- **Clickable option pills** after Oracle questions — one click advances the conversation. User can also type freely.
- **Oracle input** stays at bottom, same box, still supports images/drag-drop
- **Chips** visible in `idle` mode, hidden during `chat`/`creative`, reappear on reset
- **Escalation indicator**: "One sec while I put on my creative director hat..." with a brief animation/transition when moving from Sonnet → Opus
- **"KS"** as the Oracle's name in messages

### Message Types

- **Text message** — plain Oracle response
- **Options message** — text + 2-4 clickable pills
- **Context card** — inline card showing gathered data (product info, selected style, etc.)
- **Prompt preview** — special card showing the crafted prompt with [Generate] [Edit] [Start Over] actions
- **Escalation message** — transition indicator when switching tiers

---

## API Architecture

### Existing: `POST /api/creative-studio/oracle-route`

Unchanged. Haiku classifier. New addition: returns `workflow: 'conversation'` when confidence is low.

### New: `POST /api/creative-studio/oracle-chat`

Sonnet-powered guided conversation.

**Request:**
```typescript
{
  messages: { role: 'user' | 'assistant', content: string }[]
  context: {
    productInfo?: ProductInfo
    selectedOptions?: Record<string, string>
    format?: 'image' | 'video'
    outputType?: 'ad' | 'content'
  }
}
```

**Response:**
```typescript
{
  message: string
  options?: { label: string, value: string }[]
  contextCards?: {
    type: 'product' | 'style' | 'prompt-preview'
    data: Record<string, any>
  }[]
  action?: {
    workflow: string
    prefilledData: Record<string, any>
  }
  escalate?: 'creative'
  analyzeUrl?: string  // Oracle detected a URL — client should call analyze-product-url
}
```

**Sonnet system prompt responsibilities:**
- Knows all 11 workflows and what inputs each needs
- Asks targeted questions with 2-4 concrete options per turn
- Warm but efficient personality — never more than 2-3 sentences + options
- When it has enough info, returns `action` with workflow + pre-filled data
- When user wants to brainstorm, returns `escalate: 'creative'`
- When it detects a URL in user text, returns `analyzeUrl` so client can call the existing product analysis endpoint

### New: `POST /api/creative-studio/oracle-creative`

Opus-powered creative director brainstorming.

**Request:** Same shape as oracle-chat, plus:
```typescript
{
  messages: { role: 'user' | 'assistant', content: string }[]
  context: {
    productInfo?: ProductInfo
    selectedOptions?: Record<string, string>
    format?: 'image' | 'video'
    outputType?: 'ad' | 'content'
    priorConversation?: { role: string, content: string }[]  // Sonnet conversation history
  }
}
```

**Response:**
```typescript
{
  message: string
  options?: { label: string, value: string }[]
  generatedPrompt?: {
    prompt: string
    format: 'image' | 'video'
    style?: string
    duration?: number
  }
}
```

**Opus system prompt responsibilities:**
- Receives product knowledge + Sonnet conversation context
- Thinks like a performance creative strategist — opinionated, proposes unexpected angles
- Challenges obvious choices ("before/after is overdone, what about...")
- When conversation lands on an agreed concept, crafts a generation-ready prompt
- Prompt is styled for target pipeline (Veo prose for video, Gemini style for image)
- Returns `generatedPrompt` — client shows as prompt preview card with [Generate Video/Image] [Edit] [Start Over]

---

## Client State

```typescript
type OracleMode = 'idle' | 'chat' | 'creative'

interface OracleMessage {
  id: string
  role: 'user' | 'oracle'
  content: string
  options?: { label: string, value: string }[]
  contextCards?: ContextCard[]
  isEscalating?: boolean   // "putting on creative director hat..."
  promptPreview?: {        // crafted prompt ready for generation
    prompt: string
    format: 'image' | 'video'
  }
}

interface ContextCard {
  type: 'product' | 'style' | 'prompt-preview'
  data: Record<string, any>
}

// State in ad-studio page
const [oracleMode, setOracleMode] = useState<OracleMode>('idle')
const [oracleMessages, setOracleMessages] = useState<OracleMessage[]>([])
const [oracleContext, setOracleContext] = useState<OracleContext>({})
const [oracleSending, setOracleSending] = useState(false)
```

**Transitions:**
- `idle` → submit → Haiku → clear intent → route to workflow (no chat)
- `idle` → submit → Haiku → ambiguous → `chat` (Sonnet conversation starts)
- `chat` → Sonnet returns `action` → route to workflow with pre-filled data
- `chat` → Sonnet returns `escalate` → show escalation message → `creative`
- `creative` → Opus returns `generatedPrompt` → show prompt preview card
- Prompt preview → [Generate] → pre-fill open-prompt → set mode → generate
- Any state → "Start over" / back → `idle` (messages cleared)

Chips visible only in `idle`. Hidden in `chat` and `creative`.

---

## Sonnet System Prompt (Guide)

Key behaviors:
- Opens with: "Hey! What are we making today?" (only if no initial input)
- When user provides info, acknowledges warmly and asks the next question with options
- Always provides 2-4 clickable options. Never asks open-ended questions without options.
- Workflow-aware question sequences (adapted per workflow):
  - **Video ads:** URL → (analyze) → style? → duration preference? → [action: url-to-video]
  - **Image ads:** URL → (analyze) → [action: create]
  - **Clone:** What ad to clone? → [action: clone]
  - **UGC:** URL → (analyze) → [action: ugc-video]
  - **Open prompt:** What to create? → format? → [action: open-prompt]
- Max 5 turns before routing (prevent infinite loops)
- If user says anything suggesting brainstorming, returns `escalate: 'creative'`

## Opus System Prompt (Creative Director)

Key behaviors:
- Opens with a creative take on the product based on injected context
- Opinionated and bold — proposes specific visual concepts, not generic suggestions
- Challenges safe choices and offers unexpected angles
- References performance marketing principles (scroll-stopping hooks, pattern interrupts)
- When the user agrees on a direction, crafts the prompt in the correct style for the target pipeline
- Prompt crafting: Veo-style prose for video (no block headers), Gemini-style for images
- Returns the prompt with explanation of why it should work

---

## Workflow Integration

When the conversation results in an `action` (Sonnet) or `generatedPrompt` (Opus):

### Sonnet → Workflow Handoff
Same as current Oracle routing. `action.workflow` maps to existing `setMode()` calls. `action.prefilledData` populates the relevant state (productUrl, productInfo, style, etc.).

### Opus → Open Prompt Handoff
1. `generatedPrompt.prompt` → `setOpenPromptText(prompt)`
2. `generatedPrompt.format` → `setOpenPromptMediaType(format)`
3. Set `mode('open-prompt')` + `oracleAutoGenRef` if user clicked [Generate]
4. Or just set mode without auto-gen if user clicked [Edit] (lets them tweak first)

---

## What Stays Unchanged

- All 11 existing workflow modes and their views
- All existing generation endpoints
- Chip definitions and chip behavior
- Oracle Box component (extended, not replaced)
- The ambient gradient background and visual design
- Session restoration (`?sessionId=`, `?canvasId=`)
- Credit system (Oracle is free, generation costs credits)

---

## Implementation Scope

### New Files
- `app/api/creative-studio/oracle-chat/route.ts` — Sonnet conversation endpoint
- `app/api/creative-studio/oracle-creative/route.ts` — Opus creative director endpoint
- `components/creative-studio/oracle-chat-thread.tsx` — Chat message list + context cards
- `components/creative-studio/oracle-message.tsx` — Individual message bubble (text, options, cards)

### Modified Files
- `app/api/creative-studio/oracle-route/route.ts` — Add `conversation` workflow for ambiguous inputs
- `app/dashboard/creative-studio/ad-studio/page.tsx` — Add `oracleMode`, `oracleMessages` state, chat UI rendering, escalation logic
- `components/creative-studio/oracle-box.tsx` — Adapt input for chat mode (placeholder changes, enter behavior)

### Unchanged
- All existing mode views (create, clone, upload, url-to-video, etc.)
- All existing generation API endpoints
- Oracle chips component
- Video/image generation pipelines
