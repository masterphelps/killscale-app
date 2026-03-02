# Oracle v2: Three-Tier Agentic System — Design Doc

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Oracle from a router into an agentic system where Haiku routes, Sonnet guides + uses tools, and Opus directs creative work + uses tools — all within an inline chat experience with persistent sessions.

**Architecture:** Client-side tool orchestration. Models return `toolRequest` JSON, the client executes API endpoints, shows results as inline context cards, and feeds results back to the model. No server-side agent loops.

**Tech Stack:** Existing creative-studio API endpoints as tools, Anthropic SDK (Haiku/Sonnet/Opus), Supabase for chat session persistence, existing MediaLibraryModal for media selection.

---

## 1. Tool System

Models return a `toolRequest` in their JSON response. The client intercepts, executes, and feeds results back.

### Available Tools (Sonnet + Opus)

| Tool | What it does | Cost | Speed | API Endpoint |
|---|---|---|---|---|
| `analyze_product` | Fetch + analyze a product URL | Free | ~5s | `POST /api/creative-studio/analyze-product-url` |
| `analyze_video` | Gemini video analysis (transcript, funnel scores, style) | Free | ~15s | `POST /api/creative-studio/analyze-video` |
| `generate_overlay` | Whisper transcribe + Claude overlay gen (hook, captions, CTA) | Free | ~10s | `POST /api/creative-studio/generate-overlay` |
| `generate_ad_copy` | Claude ad copy from product + optional competitor ref | Free | ~5s | `POST /api/creative-studio/generate-from-product` |
| `generate_image` | Gemini image gen from prompt + optional ref images | 5cr | ~10s | `POST /api/creative-studio/generate-image` |
| `generate_video` | Veo 3.1 video gen from prompt + optional ref images | 50cr | ~3min | `POST /api/creative-studio/generate-video` |
| `generate_concepts` | 4 visual metaphor concepts from product knowledge | Free | ~8s | `POST /api/creative-studio/generate-ad-concepts` |
| `detect_text` | Gemini Vision text extraction from image | Free | ~3s | `POST /api/creative-studio/detect-text` |
| `request_media` | Ask user for image/video (shows Upload + Library buttons) | Free | Instant | Client-side only |

### Tool Request Format (returned by model)

```json
{
  "message": "Let me analyze that video for you...",
  "toolRequest": {
    "tool": "analyze_video",
    "inputs": { "videoUrl": "https://..." },
    "reason": "User wants ad copy based on this video"
  }
}
```

### Client-Side Execution Loop

```
Model responds with toolRequest
  → Client shows message + spinner context card
  → If credit-costing tool: show credit-confirm card, wait for user click
  → Client calls the API endpoint
  → On success: add result as context card, append to oracleContext
  → Auto-send tool result back to model: "Tool result (analyze_video): {summary}"
  → Model responds with next message (may include another toolRequest for chaining)
```

Tools are chained one at a time. No parallel execution — keeps it simple and visible.

Credit-costing tools (`generate_image` = 5cr, `generate_video` = 50cr) ALWAYS show a confirmation card before execution.

---

## 2. Three-Tier Model Behavior

### Haiku (Router) — `oracle-route` endpoint

- **Unchanged.** Pure JSON classifier.
- Receives: user text + toggles (format, outputType, hasImage)
- Returns: `{workflow, productUrl, prompt}` — routes instantly
- Escalates to Sonnet when input is vague/exploratory
- Never calls tools. Never converses.

### Sonnet (Guide + Tool User) — `oracle-chat` endpoint

- Conversational guide that asks clarifying questions with clickable options
- **NEW:** Can return `toolRequest` to call any tool mid-conversation
- **NEW:** Can return `mediaRequest` to ask user for images/videos
- Uses tools to fulfill direct requests ("analyze this video" → calls analyze_video → shows results)
- Routes to workflows when a structured pipeline is the right path
- Escalates to Opus for creative brainstorming, rich prompt engineering, or multi-step creative work

### Opus (Creative Director + Tool User) — `oracle-creative` endpoint

- Bold, opinionated creative strategist
- **NEW:** Can call all the same tools as Sonnet
- **NEW:** When generating images/video, Opus crafts rich prompts (product knowledge, visual hooks, style cues, multiple reference images) instead of passing user's raw words
- **NEW:** Can route BACK DOWN to workflows with pre-loaded data (concepts, product knowledge, overlay configs)
- The creative differentiator: Opus has opinions and challenges safe choices

### Escalation Rules

| From | To | Trigger |
|---|---|---|
| Haiku → Sonnet | Vague input, no clear workflow match |
| Sonnet → Opus | "brainstorm", "creative", "unique", or multi-step creative pipeline detected |
| Opus → Workflow | Structured flow is better — routes with everything pre-loaded |

---

## 3. Media Request Flow

When the model needs media from the user:

```json
{
  "message": "Drop the video you want me to analyze.",
  "mediaRequest": {
    "type": "video",
    "reason": "analyze_for_ad_copy",
    "multiple": false
  }
}
```

**UI:** Oracle message renders with two action buttons:

```
┌──────────────────────────────────────────┐
│ KS: Drop the video you want me to        │
│ analyze — upload it or pick from library  │
│                                           │
│  [📁 Upload]  [🖼 Media Library]          │
└──────────────────────────────────────────┘
```

- **Upload** — opens file picker filtered by type, uploads to Supabase Storage
- **Media Library** — opens existing `MediaLibraryModal` filtered by type

Once media is provided:
- Thumbnail/preview card appears as user message in chat
- Media metadata (storageUrl, mimeType, name) added to `oracleContext.media`
- Client auto-sends follow-up to model: "User provided video: [name] at [url]"
- Model continues (typically calling a tool on that media next)

`multiple: true` allows up to 3 items (for multi-image gen, reference images). Upload and Library buttons stay active until user clicks "Done".

---

## 4. Chat Persistence + AI Tasks

### New Table: `oracle_chat_sessions`

```sql
CREATE TABLE oracle_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  ad_account_id TEXT,
  title TEXT,
  messages JSONB,                -- full OracleMessage[] array
  context JSONB,                 -- final oracleContext
  generated_assets JSONB,        -- [{type, url, mediaHash, toolUsed, creditCost}]
  highest_tier TEXT DEFAULT 'haiku',  -- 'haiku' | 'sonnet' | 'opus'
  status TEXT DEFAULT 'active',  -- 'active' | 'complete'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Session Lifecycle

- Created when Sonnet conversation starts (Haiku-only routing = no session)
- Messages array updated after each exchange (debounced)
- `generated_assets` appended when credit-costing tool completes
- `title` auto-set from product name (if analyzed) or first user message (~50 chars)
- `highest_tier` updated on escalation
- `status` = `complete` when user navigates away or clicks "Done"

### AI Tasks "Chats" Section

- New tab alongside "Ad Sessions" and "Concept Canvases"
- Cards show: title, tier badge (Sonnet/Opus colored), asset count, timestamp
- Click into session → full conversation replay (left) + generated assets gallery (right)
- "Continue" button → reopens Oracle with session restored, picks up where left off

### What Counts as a Generated Asset

- Images from `generate_image`
- Videos from `generate_video`
- Overlay configs from `generate_overlay` (link to open in RVE)
- Ad copy from `generate_ad_copy`

Free tools (analyze, detect text) don't create assets — results live as context cards in conversation.

---

## 5. Updated API Contracts

### Unified Response Type

```typescript
interface OracleAgentResponse {
  message: string
  options?: OracleOption[]
  contextCards?: OracleContextCard[]

  // Routing (existing)
  action?: { workflow: string; prefilledData?: Record<string, unknown> }
  escalate?: 'creative'
  analyzeUrl?: string  // DEPRECATED — replaced by toolRequest analyze_product

  // New: Tool system
  toolRequest?: {
    tool: string
    inputs: Record<string, unknown>
    reason: string
  }
  mediaRequest?: {
    type: 'image' | 'video' | 'any'
    reason: string
    multiple?: boolean
  }
}
```

### New Context Card Types

| Type | Shows | Source |
|---|---|---|
| `product` | Product name, price, features, image | `analyze_product` |
| `video-analysis` | Transcript snippet, funnel scores, style tags | `analyze_video` |
| `overlay-preview` | Hook text, caption count, CTA, style badge | `generate_overlay` |
| `ad-copy` | Headline, primary text, description, angle badge | `generate_ad_copy` |
| `image-result` | Generated image with Save/Edit/Download buttons | `generate_image` |
| `video-result` | Video player card with progress/complete state | `generate_video` |
| `concepts` | 4 concept cards with visual metaphor descriptions | `generate_concepts` |
| `media-attached` | User-provided media thumbnail | `request_media` flow |
| `credit-confirm` | "Generate for X credits?" with confirm button | Pre-generation gate |

---

## 6. System Prompt Updates

### Haiku — No changes

### Sonnet — Add tool awareness

Add to system prompt:
- Tool definitions (name, inputs, when to use)
- Decision matrix: use tool vs route to workflow vs escalate to Opus
- Rule: "When user gives a direct task you can handle with tools, USE THEM — don't route to a workflow"
- Rule: "Route to workflows when user needs the full guided pipeline (pill selection, style picker, etc.)"
- Rule: "Escalate to Opus when user wants creative brainstorming or rich prompt engineering"

### Opus — Add tool awareness + generation authority

Same tool definitions as Sonnet, plus:
- "When using generate_image or generate_video, YOU write the prompt with rich detail — product knowledge, visual hooks, style cues, reference images"
- "You can route back DOWN to workflows with pre-loaded data (productKnowledge, concepts, overlayConfig)"
- "Don't just execute — have opinions. Challenge safe choices."

---

## 7. Example Flows

### "Write ad copy for this video"
```
User: "I need ad copy for a video"
Sonnet: "Drop the video" → mediaRequest(video)
User: [selects from library]
Sonnet: "Analyzing..." → toolRequest(analyze_video)
[Analysis completes → context card with transcript, scores]
Sonnet: "Here's the ad copy" → toolRequest(generate_ad_copy, inputs={productInfo from transcript})
[Copy appears as ad-copy context card]
User: "Save it" → saved to session, appears in AI Tasks
```

### "Add captions to my video based on my product page"
```
User: "Add captions to my video from my product page"
Sonnet: "What's the product URL?"
User: "https://repcard.com"
Sonnet: toolRequest(analyze_product, {url})
[Product card appears]
Sonnet: "Now drop the video" → mediaRequest(video)
User: [uploads video]
Sonnet: toolRequest(generate_overlay, {videoUrl, productName, hookText from product})
[Overlay preview card with hook text, caption count, CTA]
Sonnet: "Here's the overlay — want to open it in the editor?"
User: clicks "Open in Editor"
[Routes to RVE with overlay config pre-loaded]
```

### "I want something really creative for my skincare brand"
```
User: "Make something scroll-stopping for my skincare brand at glowskin.com"
Haiku: → escalates to Sonnet (vague + creative)
Sonnet: toolRequest(analyze_product, {url: glowskin.com})
[Product card appears]
Sonnet: "This is interesting — want me to brainstorm some bold angles?" → escalate: creative
[Escalation to Opus]
Opus: "GlowSkin at $45 is premium territory. Here are 3 angles that would stop scrolls..."
[Proposes concepts with visual detail]
User: "I love the macro texture one"
Opus: toolRequest(generate_image, {prompt: [rich Opus-crafted prompt], productImages: [from analysis]})
[Credit confirm card: "Generate for 5 credits?"]
User: [confirms]
[Image result card appears in chat]
```

---

## Files Summary

| Area | Files to Create/Modify |
|---|---|
| Types | `components/creative-studio/oracle-types.ts` — add toolRequest, mediaRequest, new card types |
| Oracle Chat API | `app/api/creative-studio/oracle-chat/route.ts` — update system prompt with tools |
| Oracle Creative API | `app/api/creative-studio/oracle-creative/route.ts` — update system prompt with tools + generation |
| Client Orchestrator | `app/dashboard/creative-studio/ad-studio/page.tsx` — tool execution loop, media request handling, credit confirm, session persistence |
| Chat Thread UI | `components/creative-studio/oracle-chat-thread.tsx` — new context card renderers (video-analysis, overlay-preview, ad-copy, image-result, video-result, concepts, media-attached, credit-confirm) |
| Media Request UI | New buttons component for Upload + Media Library in chat |
| DB Migration | `supabase/migrations/XXX_oracle_chat_sessions.sql` — new table + RLS |
| AI Tasks | `app/dashboard/creative-studio/ai-tasks/page.tsx` — new "Chats" tab |
| Chat Session API | `app/api/creative-studio/oracle-session/route.ts` — CRUD for chat sessions |
