# Studio Consolidation Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

Three overlapping video creation workflows exist:
- `url-to-video.tsx` (120KB component inside Ad Studio) — URL-only input, 4-concept explorer + direct script
- `/direct` page (1,682 lines) — URL or Describe input, direct script only
- `/video-studio` page (1,997 lines) — URL or Describe input, 4-concept explorer only

All three use the same APIs, same Director's Review component, same video generation pipeline. Users can't discover all capabilities from one place, and Oracle handoffs go to different destinations depending on the path.

Ad Studio is 7,922 lines because it hosts url-to-video (120KB) and image-to-video (859 lines) as inline components.

## Solution

Two studios with a shared input component:

```
Creative Suite
├── Ad Studio          (all image ad creation)
├── Video Studio       (all video creation)
├── Image Editor       (linked from Ad Studio, AI Tasks, Media)
├── Video Editor       (linked from Video Studio, Oracle)
├── Media Library, Active Ads, Best Ads, Best Copy, Collections, AI Tasks
```

### Shared Product Input Component

One input surface used by both studios. No tabs, no mode switching — just one flexible form:

```
┌─────────────────────────────────────────────┐
│  🔗 Product URL (optional)      [Analyze]   │
├─────────────────────────────────────────────┤
│  Product Images:                            │
│  [img1] [img2] [img3] [+]                  │
│                         ↑                   │
│                  Upload / Library            │
├─────────────────────────────────────────────┤
│  Product Name *        [pill] [pill] [+]    │
│  Description *         [pill] [pill] [+]    │
│  Key Features          [pill] [pill] [+]    │
│  Benefits              [pill] [pill] [+]    │
│  Key Messages          [pill] [pill] [+]    │
│  Customer Voice        [pill] [pill] [+]    │
│  Problems It Solves    [pill] [pill] [+]    │
└─────────────────────────────────────────────┘
         * = required to proceed
```

- If you enter a URL: Analyze fills everything (images, pills, all categories). Edit/deselect what you don't want.
- If you don't: Images area is empty (use + to add), pills are empty (type your own). Must fill Product Name and Description.
- If you do both: URL populates the base, you add your own images and edit pills on top.

The old URL/Describe/Image distinction disappears — it's just "how much did you fill in."

Component: `components/creative-studio/product-input.tsx`
Output: `ProductKnowledge` + `ProductImage[]` (same types both studios consume today)

### Landing Page & Chips

Oracle box + 5 chips (down from 8):

```
┌──────────────────────────────────────────────────┐
│              [Oracle Input Box]                   │
│   Mode selector: KS | Image | Video              │
├──────────────────────────────────────────────────┤
│                                                  │
│   [🎯 Create Image Ad]    [🎯 Create Video Ad]   │
│                                                  │
│      [Clone Ad]  [Inspiration]  [UGC Video]      │
│                                                  │
└──────────────────────────────────────────────────┘
```

| Chip | Action |
|------|--------|
| Create Image Ad | Stay in Ad Studio, show product-input → image pipeline |
| Create Video Ad | Navigate to `/video-studio` |
| Clone Ad | Stay in Ad Studio, clone mode |
| Inspiration | Stay in Ad Studio, inspiration mode |
| UGC Video | Navigate to `/video-studio?mode=ugc` |

No separate "Generate Image" / "Generate Video" chips — the Oracle box mode selector handles that:
- Image mode + submit → stays in Ad Studio, open-prompt → Gemini
- Video mode + submit → navigates to `/video-studio` with prompt/context
- KS mode → Haiku classifies, routes accordingly

### Video Studio Page

Route: `/dashboard/creative-studio/video-studio`

Accordion flow — each step collapses to a one-line summary when complete. Click to re-expand and edit.

**Step 1: Product Input** (shared `product-input.tsx`)
- URL + images + pills
- Collapses to: "Glow Beauty | 4 images | 7 pills selected" [Edit]

**Step 2: Choose Your Path**
- **Explore** — "Show me 4 creative angles" → Claude generates 4 concept cards. Pick one.
- **Direct** — "I know what I want" → textarea → GPT segments into Veo time chunks.
- Image-only input skips to Direct (you already have the visual).
- Collapses to summary showing concept/script headline.

**Step 3: Director's Review** (existing `directors-review.tsx`)
- Editable Veo prompt segments, overlays, quality, duration
- Per-segment reference images
- Generate button → Veo
- Video result appears inline below
- Edit in Video Editor link on result

**UGC mode** (`?mode=ugc`): Skips Step 2. Product input → UGC script gen → Director's Review with talking-head style locked.

### Oracle → Video Studio Handoff

**URL params** (simple strings):

| Param | What it pre-fills |
|-------|------------------|
| `productName` | Name pill (required) |
| `productDescription` | Description pill (required) |
| `productUrl` | URL field (already analyzed) |
| `prompt` | Direct script textarea → auto-selects Direct path |
| `style` | Video style pre-selected |
| `mode` | `ugc` or `direct` or `explore` |
| `canvasId` | AI Tasks canvas restore |
| `tab` | `image` for Haiku image-to-video routing |

**sessionStorage `ks_oracle_handoff`** (complex data):
- Product images as base64
- Full pill pools (features, benefits, etc.)
- Video intel (motionOpportunities, sensoryDetails, visualHooks)
- Prior conversation context

Presence of `prompt` param = Direct path auto-selected. No `prompt` = user chooses Explore or Direct.

### Ad Studio Page

Route: `/dashboard/creative-studio/ad-studio`

**Landing:** Oracle box + 5 chips (unchanged behavior)

**Create Image Ad flow:**

Step 1: Product Input (shared `product-input.tsx`) — collapses when complete

Step 2: Generate — style selector, ad copy cards, Generate Image → Gemini, results with Save / Edit in Image Editor / Create Ad

**CRITICAL: Zero changes to image generation pipeline.** Prompts (`lib/prompts/image-generation.ts`), Gemini API calls, ad copy generation, dual-image mode, style system — all untouched. The only change is Step 1 uses the shared `product-input.tsx` instead of inline product analysis.

**Other modes unchanged:** Clone, Inspiration, Open Prompt — all stay as-is.

**Key reduction:** All url-to-video and image-to-video state/handlers/render blocks (~3,500 lines) removed. Video chips navigate away. Ad Studio drops from ~7,900 to ~4,000 lines.

## Files

### Created

| File | What |
|------|------|
| `components/creative-studio/product-input.tsx` | Shared input (URL + images + pills + accordion) |
| `app/dashboard/creative-studio/video-studio/page.tsx` | Full rewrite — unified video page |

### Deleted

| File | Lines | Why |
|------|-------|-----|
| `components/creative-studio/url-to-video.tsx` | ~2,400 | Absorbed into Video Studio |
| `components/creative-studio/image-to-video.tsx` | 859 | Absorbed into product-input image picker |
| `app/dashboard/creative-studio/direct/page.tsx` | 1,682 | Replaced by Video Studio |

### Modified

| File | What changes |
|------|-------------|
| `ad-studio/page.tsx` | Remove ~3,500 lines of video state/handlers/render. Step 1 uses product-input. Video chips navigate away. |
| `oracle-chips.tsx` | 5 chips instead of 8. Create Video Ad → `/video-studio`. |
| `oracle-creative/route.ts` | Opus handoff URL: `/direct` → `/video-studio` |
| `oracle-box.tsx` | Video mode submit navigates to `/video-studio` |

### NOT Modified (critical)

| File | Why |
|------|-----|
| `lib/prompts/*` | All prompts untouched — sensitive |
| `app/api/creative-studio/generate-image/*` | Image gen pipeline untouched |
| `app/api/creative-studio/generate-video/*` | Video gen API untouched |
| `app/api/creative-studio/generate-ad-concepts/*` | Concept generation untouched |
| `app/api/creative-studio/plan-scene/*` | Scene planning untouched |
| `directors-review.tsx` | Already extracted, just consumed |
| `remotion/*` | Overlay system untouched |

### Net Result

~4,900 lines deleted, ~2,000 lines created. Ad Studio drops from 7,900 to ~4,000 lines. Three video workflows become one.
