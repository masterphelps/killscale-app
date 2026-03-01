# Ad Oracle — Unified Ad Studio Entry Point

## Overview

Replace the Ad Studio landing page (9 mode cards + unlabeled open prompt bar) with a single intelligent "Oracle" input box powered by Claude Haiku intent detection. Users type, paste a URL, or drop an image — the Oracle routes them into the correct existing workflow. Suggestion chips below provide direct shortcuts for users who already know what they want.

**Why:** The current landing splits by output format (Image Ads / Video Ads) instead of user intent, creating overlap, confusing naming, and an unlabeled open prompt that produces different output than everything else. The Oracle collapses all of this behind one input.

---

## The Oracle Box

A single prominent input at the top of Ad Studio. Visually similar to ChatGPT/Gemini's prompt box.

**Anatomy:**
- Large textarea with placeholder: "Describe what you want to create, paste a product URL, or drop an image..."
- Image attachment button (paperclip icon) — opens file picker or Media Library
- Two small toggle pills inside the box (bottom-right):
  - **Output type:** `Ad` / `Content` (default: Ad)
  - **Format:** `Image` / `Video` (default: Image)
- Submit button (arrow icon)
- Drag-and-drop zone for images (the entire box area)

**Auto-suggest while typing:**
- Client-side keyword matching shows a dropdown of workflow suggestions as user types
- "I want to clone..." → shows "Clone a competitor's ad" chip
- "UGC..." → shows "Create a UGC video ad" chip
- Clicking a suggestion either fills the prompt or jumps directly to that flow

---

## Suggestion Chips

Two columns below the Oracle box. Pre-built shortcuts that populate the Oracle or jump to a flow.

```
  Make Ads                    Make Content
  ─────────                   ────────────
  🎯 Product → Ad             🖼️ Generate Image
  🎯 Product → Video Ad       🎬 Generate Video
  🔄 Clone Ad                 📸 Image → Video
  ✨ Inspiration
  🎬 UGC Video Ad
  📸 Image → Ad
```

**Mobile:** Single column, two sections stacked. Chips are compact horizontal pills that wrap.

### Chip Behavior

| Chip | Action |
|---|---|
| Product → Ad | Sets Ad + Image toggles, focuses Oracle, placeholder "Paste your product URL..." |
| Product → Video Ad | Sets Ad + Video toggles, focuses Oracle, placeholder "Paste your product URL..." |
| Clone Ad | Sets Ad toggle, jumps directly to clone flow step 1 |
| Inspiration | Opens Inspiration Gallery immediately |
| UGC Video Ad | Sets Ad + Video toggles, focuses Oracle, placeholder "Paste your product URL for a UGC video..." |
| Image → Ad | Sets Ad + Image toggles, opens file picker / shows "Drop an image or paste a URL..." |
| Generate Image | Sets Content + Image toggles, focuses Oracle, placeholder "Describe the image you want..." |
| Generate Video | Sets Content + Video toggles, focuses Oracle, placeholder "Describe the video you want..." |
| Image → Video | Sets Content + Video toggles, opens file picker / shows "Drop an image and describe the animation..." |

Chips disappear once a mode is active. Back button returns to Oracle landing.

---

## Claude Routing API

**Endpoint:** `POST /api/creative-studio/oracle-route`

### Request
```typescript
{
  text: string           // user input
  outputType: 'ad' | 'content'
  format: 'image' | 'video'
  hasImage: boolean
}
```

### Response
```typescript
{
  workflow: 'create' | 'clone' | 'inspiration' | 'upload'
          | 'url-to-video' | 'ugc-video' | 'image-to-video'
          | 'open-prompt' | 'text-to-video'
  productUrl?: string
  competitorUrl?: string
  prompt?: string          // cleaned creative brief (routing intent stripped)
  format: 'image' | 'video'
  outputType: 'ad' | 'content'
}
```

### Routing Logic

| Signal | Workflow |
|---|---|
| URL + Ad + Image | `create` |
| URL + Ad + Video (no UGC keywords) | `url-to-video` |
| URL + Ad + Video + UGC keywords | `ugc-video` |
| URL + Content + any | `open-prompt` (URL analyzed for context) |
| "clone/like/similar to" + competitor mention | `clone` |
| Image attached + Ad + Image | `upload` |
| Image attached + Video | `image-to-video` |
| Text only + Ad + Image | `create` (prompt becomes product description) |
| Text only + Ad + Video | `text-to-video` |
| Text only + Content + Image | `open-prompt` (image) |
| Text only + Content + Video | `open-prompt` (video) |
| "inspiration/browse/examples" | `inspiration` |

**Model:** Claude Haiku (fast, cheap — classification only, not generation)

**Latency:** ~300-500ms. Loading shimmer on Oracle box during classification.

**Fallback:** If Claude returns ambiguous results, default to toggle states and treat text as prompt for that mode.

**Cost:** Free (not deducted from user credits — it's a routing call, not generation).

---

## Pre-Population Rules

What carries forward from Oracle input into each workflow:

| Workflow | Pre-filled data |
|---|---|
| `create` | `productUrl` → auto-triggers URL analysis |
| `clone` | `productUrl` if present → step 1 pre-filled |
| `upload` | Attached image → upload state, `prompt` → ad vision text |
| `url-to-video` | `productUrl` → auto-triggers URL analysis |
| `ugc-video` | `productUrl` → auto-triggers URL analysis |
| `text-to-video` | `prompt` → router.push to direct page with prompt as query param |
| `image-to-video` | Attached image → image state, `prompt` → animation description |
| `open-prompt` (image) | `prompt` → open prompt text, format set to image |
| `open-prompt` (video) | `prompt` → open prompt text, format set to video |
| `inspiration` | Opens gallery immediately |

---

## Complete Path Coverage

All 11 existing paths mapped to Oracle:

| # | Path | Chip | Routing |
|---|---|---|---|
| 1 | Open Prompt → Image | Generate Image | text + Content + Image → `open-prompt` |
| 2 | Open Prompt → Video | Generate Video | text + Content + Video → `open-prompt` |
| 3 | Create (URL → Image Ad) | Product → Ad | URL + Ad + Image → `create` |
| 4 | Clone (reference → Ad) | Clone Ad | "clone/like" keywords → `clone` |
| 5 | Inspiration → Ad | Inspiration | "inspiration/browse" → `inspiration` |
| 6 | Upload (Image → Image Ad) | Image → Ad | image + Ad + Image → `upload` |
| 7 | URL to Video (concepts) | Product → Video Ad | URL + Ad + Video → `url-to-video` |
| 8 | Text to Video (Director's Review) | (via routing) | text + Ad + Video → `text-to-video` |
| 9 | Image to Video | Image → Video | image + Video → `image-to-video` |
| 10 | UGC Video | UGC Video Ad | UGC keywords → `ugc-video` |
| 11 | Product Video | (shares UGC flow) | shares UGC routing |

---

## Implementation Scope

### New Files
- `app/api/creative-studio/oracle-route/route.ts` — Claude Haiku intent classification
- `components/creative-studio/oracle-box.tsx` — Oracle input component
- `components/creative-studio/oracle-chips.tsx` — Two-column suggestion chips

### Modified Files
- `app/dashboard/creative-studio/ad-studio/page.tsx` — Replace landing page (mode cards + open prompt bar) with Oracle Box + chips. All existing mode views unchanged.

### Unchanged
- All existing mode views (create steps, clone steps, upload, url-to-video, etc.)
- All existing API endpoints
- The `mode` state type — same values, set by Oracle routing instead of card clicks
- Direct/text-to-video page (separate route)
- Session restoration (`?sessionId=`, `?canvasId=`)
- AI Tasks page
