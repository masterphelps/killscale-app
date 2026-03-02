# KillScale - Claude Code Context

## Project Overview

KillScale is a SaaS app for Meta and Google Ads advertisers. Users connect via Meta/Google APIs (or upload CSV exports) and get instant verdicts (Scale/Watch/Kill/Learn) based on ROAS thresholds.

**Live URLs:** Landing at killscale.com, App at app.killscale.com

**Stats (as of Feb 2026):** 55K+ LOC, 95+ API endpoints, 50+ React components, 66+ database migrations

---

## Development Commands

```bash
# All commands run from killscale-app/
npm run dev     # Start dev server at localhost:3000
npm run build   # Production build
npm run lint    # Run Next.js linter
```

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security)
- **Payments:** Stripe (subscriptions)
- **Hosting:** Vercel (auto-deploy on git push)
- **Charts:** Recharts
- **CSV Parsing:** Papaparse
- **AI:** Claude Sonnet 4 (AI chat, Health Recs, Video Concepts, Ad Copy, Overlays), OpenAI (GPT 5.2 scene planning, Whisper transcription, TTS voiceover), Google (Veo 3.1 video gen + extensions, Gemini 3 Pro image editing, Gemini 2.5 Flash image gen + text detection)
- **Video Editor:** Remotion 4.0 (@remotion/player for preview, server render needs Chromium)
- **Prompts:** Centralized in `lib/prompts/` — versioned, auditable prompt engineering library

## Key Conventions

- Ask before performing git commits
- **Use feature flags** for new integrations (`lib/feature-flags.ts`)
- Rules and alerts are scoped per workspace (not global per user)
- Mobile-first responsive design using Tailwind's `lg:` breakpoint

### Supabase Migrations

**All migrations must be idempotent** (safe to run multiple times):

```sql
-- Tables: use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS my_table (...);

-- Indexes: use IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_name ON table(column);

-- Policies: drop first, then create
DROP POLICY IF EXISTS "policy name" ON table;
CREATE POLICY "policy name" ON table ...;

-- Functions: CREATE OR REPLACE handles this
CREATE OR REPLACE FUNCTION my_func() ...;

-- Triggers: drop first, then create
DROP TRIGGER IF EXISTS trigger_name ON table;
CREATE TRIGGER trigger_name ...;
```

**Trigger functions that insert data must use `SECURITY DEFINER`** to bypass RLS during auth flows (signup has no authenticated user yet).

**Critical trigger chain for signup:**
```
auth.users → handle_new_user() → profiles → create_default_workspace() → workspaces
```
If any function in this chain fails or is missing, signup breaks entirely.

---

## Architecture

### Monorepo Structure
- `killscale-app/` - Main Next.js application
- `killscale-landing/` - Static landing page (index.html)
- `meta-integration-files/` - Reference docs for Meta API integration

### Key Files by Feature

**Dashboard & Core:**
- `app/dashboard/page.tsx` (~2800 LOC) - Main dashboard with stats, filters, action sections
- `components/performance-table.tsx` (~2000 LOC) - Campaign/adset/ad hierarchy with CBO/ABO detection
- `components/action-cards.tsx` - Verdict-grouped action sections (Kill Now, Scale, Watch, Learn)

**Campaign Creation:**
- `components/launch-wizard.tsx` (~2800 LOC) - Multi-step wizard for campaigns, ad sets, ads, and Performance Sets
- `app/dashboard/launch/page.tsx` - Launch hub

**Scoring Systems:**
- `lib/andromeda-score.ts` (474 LOC) - Account structure audit against Andromeda best practices
- `lib/health-score.ts` (734 LOC) - Performance health with fatigue detection
- `components/andromeda-score-card.tsx` - Score display with AI chat
- `components/health-score-card.tsx` - Health metrics display

**Attribution:**
- `lib/attribution.tsx` - Attribution context with waterfall logic (Shopify → Pixel → Meta)
- `app/api/shopify/attribution/route.ts` - JOIN model: pixel events + Shopify orders on order_id
- `app/api/pixel/purchase/route.ts` - Pixel purchase events with order_id

**Starred Ads / Performance Sets:**
- `app/api/starred/route.ts` - CRUD for starred ads
- `components/star-button.tsx` - Star toggle on ad rows
- `components/starred-ads-popover.tsx` - Starred ad inventory view
- Database: `starred_ads` table + `creative_star_counts` view

**Creative Studio:**
- `app/dashboard/creative-studio/page.tsx` - Main page (data loading, filters, sort, view modes)
- `components/creative-studio/media-gallery-card.tsx` - Gallery card with score glow, hover/scroll-to-play
- `components/creative-studio/funnel-filter-bar.tsx` - Hook/Hold/Click/Convert filter pills with threshold dropdowns
- `components/creative-studio/media-table.tsx` - Table view with sortable columns, mobile score pills
- `components/creative-studio/theater-modal.tsx` - Full detail modal (video player + stats panels)
- `components/creative-studio/starred-media-bar.tsx` - Fixed bottom bar for starred items + build ads
- `components/creative-studio/gallery-grid.tsx` - Masonry grid wrapper for gallery cards
- `components/creative-studio/types.ts` - StudioAsset, StudioAssetDetail, FatigueStatus, CompetitorAd types
- `app/api/creative-studio/media/route.ts` - Asset list with computed scores (lines 12-108)
- `app/api/creative-studio/media-detail/route.ts` - Per-asset detail (hierarchy, daily data, audiences)
- `app/api/creative-studio/video-source/route.ts` - Single video source URL fetch (on-demand)
- `app/api/creative-studio/download-media/route.ts` - Phase 2 sync: download files to Supabase Storage
- `app/api/creative-studio/starred/route.ts` - CRUD for starred media

**KS Oracle (AI-Powered Entry Point):**
- `components/creative-studio/oracle-box.tsx` - Main input UI (textarea, image attach, output type/format toggles, auto-suggest)
- `components/creative-studio/oracle-chips.tsx` - Two-column shortcut grid ("Make Ads" 6 chips + "Make Content" 2 chips)
- `components/creative-studio/oracle-chat-thread.tsx` - Chat message renderer with 11 context card types
- `components/creative-studio/oracle-types.ts` - Shared types: OracleMode, OracleTier, OracleMessage, OracleToolRequest, etc.
- `lib/oracle-tools.ts` - Client-side tool executor (maps OracleToolName → API calls, returns ToolExecutionResult)
- `app/api/creative-studio/oracle-route/route.ts` - Tier 1: Haiku fast intent classifier (~300-500ms)
- `app/api/creative-studio/oracle-chat/route.ts` - Tier 2: Sonnet conversational guide
- `app/api/creative-studio/oracle-creative/route.ts` - Tier 3: Opus creative director
- `app/api/creative-studio/oracle-session/route.ts` - Session CRUD (GET/POST/PATCH/DELETE)
- Database: `oracle_chat_sessions` (migration 068)

**Ad Studio (Competitor Research):**
- `app/dashboard/creative-studio/ad-studio/page.tsx` - Oracle landing + multi-mode workflow wizard
- `app/api/creative-studio/competitor-search/route.ts` - ScrapeCreators company search API
- `app/api/creative-studio/competitor-ads/route.ts` - Fetch competitor ads with stats (media mix, landing pages)
- `app/api/creative-studio/competitor-ad/route.ts` - Single ad detail endpoint
- `app/api/creative-studio/analyze-product-url/route.ts` - Extract product info + download image for AI
- `app/api/creative-studio/generate-from-competitor/route.ts` - Claude API for ad copy generation
- `app/api/creative-studio/generate-image/route.ts` - Gemini 2.5 Flash Image for ad image generation
- `components/creative-studio/competitor-search-input.tsx` - Debounced autocomplete with keyboard nav
- `components/creative-studio/competitor-ad-card.tsx` - Ad preview card with hover-to-play
- `components/creative-studio/competitor-ads-grid.tsx` - Masonry grid with infinite scroll
- `components/creative-studio/competitor-ad-modal.tsx` - Full ad detail modal with "Use as Inspiration"
- `components/creative-studio/competitor-media-mix-chart.tsx` - Recharts donut chart for media types
- `components/creative-studio/competitor-landing-pages.tsx` - Top landing pages with percentage bars
- `components/creative-studio/competitor-filters.tsx` - Media type, days active, status filters

**Video Studio (AI Video Generation):**
- `app/dashboard/creative-studio/video-studio/page.tsx` - Product → Concepts pipeline with pill selector, inline video generation
- `app/dashboard/creative-studio/video-editor/page.tsx` - Remotion overlay editor
- `app/api/creative-studio/generate-ad-concepts/route.ts` - Claude generates 4 visual metaphor concepts with angle diversity
- `app/api/creative-studio/generate-video-script/route.ts` - Claude generates video scripts per style
- `app/api/creative-studio/generate-video/route.ts` - Veo 3.1 video generation (two quality tiers)
- `app/api/creative-studio/video-status/route.ts` - Veo job polling with auto-completion + extension chaining
- `app/api/creative-studio/generate-overlay/route.ts` - Whisper transcription + Claude overlay generation
- `app/api/creative-studio/render-overlay/route.ts` - Non-destructive overlay versioning
- `app/api/creative-studio/overlay-versions/route.ts` - Version history management
- `app/api/creative-studio/generate-voiceover/route.ts` - OpenAI TTS integration
- `app/api/creative-studio/video-composition/route.ts` - Multi-clip timeline compositions
- `app/api/creative-studio/video-canvas/route.ts` - Canvas (concept set) persistence
- `lib/video-prompt-templates.ts` - AdConcept interface, ProductKnowledge type, video prompt builders
- `lib/rve-bridge.ts` - Remotion Video Engine bridge (server render — NOT on Vercel)
- `remotion/types.ts` - OverlayConfig, HookOverlay, CaptionOverlay, VideoComposition types
- `remotion/AdOverlay.tsx` - Main Remotion composition
- `components/creative-studio/video-job-card.tsx` - Video job status card
- `components/creative-studio/video-style-picker.tsx` - Grid selector for video styles (icon cards)
- Database: `video_generation_jobs`, `video_overlays`, `video_concept_canvases`, `video_compositions`

**AI Image Editor:**
- `app/dashboard/creative-studio/image-editor/page.tsx` - Full-screen AI image editing with Gemini 3 Pro
- `app/api/creative-studio/detect-text/route.ts` - Gemini Vision text extraction (returns JSON of {text, role})
- `app/api/creative-studio/adjust-image/route.ts` - Gemini 3 Pro image editing (text replacement + free-form prompts)
- `app/api/creative-studio/image-editor-session/route.ts` - Session CRUD (GET/POST/PATCH/DELETE)
- Database: `image_editor_sessions` (migration 060)

**Open Prompt / Direct Studio:**
- `app/dashboard/creative-studio/direct/page.tsx` - Direct prompt → video generation (Write Script → Director's Review → Action)
- `app/api/creative-studio/plan-scene/route.ts` - GPT 5.2 scene segmentation for Veo time chunks
- `app/api/creative-studio/generate-direct-concept/route.ts` - Direct concept generation from user prompt
- `app/api/creative-studio/generate-ugc-prompt/route.ts` - UGC prompt generation

**Prompts Library:**
- `lib/prompts/index.ts` - Barrel export with CODEOWNERS protection
- `lib/prompts/image-generation.ts` - Gemini image prompts (buildCustomPrompt, buildTextOnlyPrompt)
- `lib/prompts/adjust-image.ts` - Gemini 3 Pro adjustment instructions
- `lib/prompts/ad-copy.ts` - Ad copy generation prompts
- `lib/prompts/video-concepts.ts` - Guided Video Ads concept prompts with style guidance
- `lib/prompts/video-scripts.ts` - Script generation prompts
- `lib/prompts/video-generation.ts` - Main video gen prompts
- `lib/prompts/video-ugc.ts` - UGC-specific prompts with smart product visibility
- `lib/prompts/video-direct.ts` - Direct concept prompts
- `lib/prompts/video-overlays.ts` - Overlay generation prompts
- `lib/prompts/video-analysis.ts` - Video analysis prompts (Gemini 2.0 Flash)
- `lib/prompts/product-analysis.ts` - Product URL analysis prompts
- `lib/prompts/INTEGRITY.sha256` - Hash file for IP protection

**Onboarding & Trial:**
- `app/onboarding/page.tsx` - 3-step onboarding wizard (Profile, Connect Meta, Select Accounts)
- `app/api/onboarding/complete/route.ts` - Server-side trial creation + onboarding completion (service role, bypasses RLS)
- `supabase/migrations/043_onboarding_and_trial.sql` - Profile columns (first_name, last_name, timezone, onboarding_completed)

**Media Library:**
- `app/api/meta/media/route.ts` - Fetch images/videos from ad account
- `app/api/meta/token/route.ts` - Secure token for direct uploads
- `lib/meta-upload.ts` - Direct-to-Meta uploads (bypasses Vercel 4MB limit, supports 1GB videos)
- `components/media-library-modal.tsx` - Browse/select existing media
- `components/media-preview-modal.tsx` - Video/image lightbox

---

## Implemented Features

### Meta Ads Integration (29 API endpoints)
- Full OAuth with token refresh
- Two-step sync (discovery then date-filtered metrics)
- Campaign/AdSet/Ad creation wizard
- Bulk operations: pause/resume, budget scaling, deletion
- Direct creative upload to Meta (images to 30MB, videos to 1GB)

### Google Ads Integration
- OAuth connection and account listing
- Campaign-level sync (no ad groups due to type variations)
- Pause/resume and budget editing
- Unified dashboard with Meta (platform badges)
- **Note:** Campaign creation not supported (too complex across campaign types)

### Andromeda Optimization Score
Audits account structure against Meta's Andromeda ML best practices.

**5-Factor Scoring:**
| Factor | Weight |
|--------|--------|
| CBO adoption | 25% |
| Creative consolidation | 25% |
| Ad set count per campaign | 20% |
| Learning phase exits | 20% |
| Budget stability | 10% |

**Score Ranges:** Excellent (90+), Good (70+), Needs Work (50+), Critical (0-50)

**Files:** `lib/andromeda-score.ts`, `components/andromeda-score-card.tsx`, `app/api/andromeda-ai/route.ts`

### Health Score Analysis
Measures performance health (separate from Andromeda's structure audit).

**4-Factor Scoring:**
- Budget efficiency (30%)
- Creative health / fatigue detection (25%)
- Profitability (25%)
- Trend direction (20%)

**Fatigue Levels:** Healthy → Warning → Fatiguing → Fatigued

**Files:** `lib/health-score.ts`, `components/health-score-card.tsx`, `app/api/ai/health-recommendations/route.ts`

### Starred Ads & Performance Sets
Star winning ads, then combine into consolidated CBO campaigns.

**Flow:**
1. Star ads from performance table (tracks creative-level deduplication)
2. Open StarredAdsPopover to see inventory
3. Click "Build Performance Set" → Launch Wizard (4th entity type)
4. Creates CBO campaign with all starred creatives in one ad set

**Files:** `app/api/starred/route.ts`, `components/star-button.tsx`, `components/starred-ads-popover.tsx`

### Campaign Launcher (Multi-Path Wizard)
Creates campaigns directly from KillScale without Ads Manager.

**Entity Types:**
1. Campaign (CBO or ABO)
2. Ad Set (within existing campaign)
3. Ad (within existing ad set)
4. Performance Set (from starred ads)

**Steps:** Account → Entity Type → Campaign Selection → Details → Lead Forms → Targeting → Creatives → Copy → Review

**Features:**
- CBO "Andromeda Recommended" vs ABO "Legacy"
- Facebook Page selection
- Special Ad Categories (Housing/Credit/Employment)
- Location targeting (city + radius)
- Media Library integration (upload new or select existing)
- Campaigns created as PAUSED for review

### Media Library
Browse existing ad account media and upload new files directly to Meta.

**Features:**
- Direct-to-Meta uploads (bypasses Vercel 4MB limit)
- Large file support: images to 30MB, videos to 1GB (chunked upload)
- Browse/filter/search existing images and videos
- Multi-select for campaign creation
- Video preview with HTML5 player

**Files:** `lib/meta-upload.ts`, `components/media-library-modal.tsx`, `components/media-preview-modal.tsx`

### Shopify Integration (JOIN Model Attribution)
Industry-standard attribution model (like Northbeam/Triple Whale).

**Architecture:**
| Source | Role |
|--------|------|
| Shopify Orders (webhooks) | Revenue source of truth |
| Pixel Events (purchase endpoint) | Attribution source of truth |
| JOIN on order_id | = Attributed revenue |

**Attribution Logic:**
| Scenario | Result |
|----------|--------|
| Both pixel + order | ATTRIBUTED - use pixel's utm_content as ad_id |
| Order only (no pixel) | UNATTRIBUTED - revenue counts, no ad credit |
| Pixel only (no order) | ORPHAN - ignored (no revenue to attribute) |

**Pixel Match Rate:** Target 85%+ of orders with matching pixel events.

**Files:** `app/api/shopify/attribution/route.ts`, `app/api/pixel/purchase/route.ts`

### UpPromote Integration (Affiliate Costs for True ROAS)
Tracks affiliate commissions to calculate True ROAS = Revenue ÷ (Ad Spend + Affiliate Commission).

**Architecture:**
| Source | Role |
|--------|------|
| UpPromote API | Affiliate commission source |
| Local sync | Stores referrals in `uppromote_referrals` table |
| Dashboard | Shows "Total Costs" and "True ROAS" when connected |

**Key Files:**
- `app/api/auth/uppromote/connect/route.ts` - API key validation
- `app/api/uppromote/sync/route.ts` - Sync referrals from UpPromote
- `app/api/uppromote/disconnect/route.ts` - Remove connection
- `app/api/uppromote/attribution/route.ts` - Aggregate commissions for date range
- `lib/uppromote/types.ts` - TypeScript interfaces
- `lib/uppromote/auth.ts` - Helper functions

**Database Tables:**
- `uppromote_connections` - One per workspace (API key storage)
- `uppromote_referrals` - Synced affiliate referral data

**Tier Access:** Pro only

**Dashboard Changes:**
- Spend card → "Total Costs" (Ad Spend + Affiliate Commission)
- ROAS card → "True ROAS" (Revenue ÷ Total Costs)
- Orange gift icon for affiliate costs

### KillScale Pixel
First-party tracking pixel independent of Meta's pixel.

**Format:** `KS-XXXXXXX` (7 random chars)

**Two-Snippet Architecture:**
1. Main Pixel (`<head>`) - Tracks pageviews, captures UTMs, stores in cookie
2. Shopify Purchase Script (Order Status Page) - Fires with order_id + UTMs

### Multi-Tenant Workspaces
Virtual business containers with role-based access.

**Roles:** owner, admin, member, viewer

**Features:**
- Default workspace on signup (via trigger)
- Pro users can create additional workspaces
- Ad accounts linked to workspaces
- Workspace-scoped rules, pixels, settings
- Email invites with token-based acceptance

### Business Type Modes
Workspaces have a business type: `ecommerce` or `leadgen`

**E-commerce Mode:**
- Revenue source: Shopify orders (via `last_utm_content` UTM)
- Waterfall: Shopify UTM → KillScale Pixel → Meta API → Unattributed
- Metrics: Revenue, Orders, ROAS, AOV
- Verdicts: ROAS-based

**Lead Gen Mode:**
- Results source: Meta API `results` field (auto-maps to campaign objective)
- Metrics: Results, CPL/CPR, Conversion Rate
- Verdicts: CPR-based (target_cpr, max_cpr thresholds)

### Sales Kiosk
Public page for logging walk-in sales with ad attribution.

**URL:** `/kiosk/[workspace-slug]`

**Features:**
- No login required (public)
- Hierarchical ad picker (Campaign → Ad Set → Ad)
- Quick-log event types (purchase, lead, signup)
- Mobile-optimized

### Bulk Budget Scaling (Andromeda-Safe)
Percentage-based scaling with rate limiting to avoid Meta API issues.

**Features:**
- Configurable scale percentage in rules
- Batch processing (5 at a time with 200ms delays)
- Handles both daily and lifetime budgets
- Tracks changes in `budget_changes` table for cooldown detection

### Creative Studio Scores
Per-asset composite scores computed in `app/api/creative-studio/media/route.ts` (lines 12–108). All require **$50 minimum spend**; below that, scores return `null`.

**Hook Score** (video only): Thumbstop Rate benchmarked
- 30%+ → 75–100 (excellent), 25–30% → 50–75 (good), 15–25% → 25–50 (average), 0–15% → 0–25 (poor)

**Hold Score** (video only): 75% Hold Rate + 25% Completion Rate
- Hold Rate: ThruPlays / 3-second views × 100 (40%+ = 75–100, 30–40% = 50–75, 20–30% = 25–50, 0–20% = 0–25)
- Completion Rate: P100 / impressions × 100 (25%+ = 100pts, 5–25% = 50–100, 0–5% = 0–50)

**Click Score** (all assets): 60% CTR + 40% CPC
- CTR: 4%+ = 100pts, 2.5–4% = 75–100, 1.5–2.5% = 50–75, 0.8–1.5% = 25–50, 0–0.8% = 0–25
- CPC: ≤$0.30 = 100pts, $0.30–0.80 = 75–100, $0.80–1.50 = 50–75, $1.50–3.00 = 25–50, $3.00+ = 0–25

**Convert Score** (all assets): ROAS benchmarked
- 5x+ → 100, 3–5x → 75–100, 1.5–3x → 50–75, 1–1.5x → 25–50, 0–1x → 0–25

**Badge Colors:** ≥75 green, ≥50 amber, ≥25 orange, <25 red

### Media Resolution Architecture (CRITICAL — Read Before Touching Any Creative Display)

Three surfaces display ad creatives. They share components but have fundamentally different data sources and join strategies. All media should come from **Supabase Storage only** — never fall back to Meta CDN URLs.

**The Three Surfaces:**

| Surface | Route | Data Source | Organized By |
|---------|-------|-------------|-------------|
| **Media Library** (Media tab) | `/api/creative-studio/media` | `media_library` table → join to `ad_data` for metrics | Media asset (one card per unique video/image) |
| **Active Ads** (Ads tab) | `/api/creative-studio/active-ads` | `ad_data` table → join to `media_library` for display | Individual ad (one card per ad, may share media) |
| **Performance Dashboard** | `components/performance-table.tsx` | `ad_data` → creative thumbnails loaded on adset expand | Ad row in hierarchy table |

**The Derivative Hash Problem:**

Meta assigns **different video IDs** from different API endpoints:
- `/advideos` endpoint → returns video ID `A` (stored in `media_library.media_hash`)
- Creative object in `/ads` → returns video ID `B` (stored in `ad_data.video_id` and `ad_data.media_hash`)
- These are DIFFERENT IDs for the SAME video. There is no reliable hash-based join for videos.
- Images don't have this problem — `media_hash` is consistent across endpoints.

**How Each Surface Resolves Media:**

1. **Media Library** — Starts from `media_library` (which has `storage_url`). Joins to `ad_data` for performance metrics using a multi-pass derivative resolution (creative_id linkage, title matching). Display always works because `storage_url` comes directly from the source table.

2. **Active Ads** — Starts from `ad_data` (which has derivative hashes). Uses a **reverse lookup via `adIds`**: the media API returns which `ad_id`s use each asset, and the frontend builds an `ad_id → storage_url` map. This completely bypasses the hash mismatch.
   - Server-side waterfall (defense-in-depth): direct hash → video_id as hash → creative_id → ad.storage_url → videoId fallback
   - Frontend resolution order: direct hash match → **ad_id reverse lookup from media API** → server-side URLs → null (never Meta CDN)

3. **Performance Dashboard** — Loads creative thumbnails on-demand when adsets expand. Uses `creative_id` from `ad_data` to fetch from Meta API (one call per creative, not bulk).

**Key Data Flow:**
```
Meta /advideos → sync-media → media_library (original video ID as media_hash, storage_url from Supabase)
Meta /ads sync → ad_data (derivative video ID as media_hash/video_id)
download-media → downloads files to Supabase Storage → updates media_library.storage_url
media API → resolves derivatives, returns adIds per asset
active-ads frontend → uses adIds reverse lookup to get storage_url for each ad
```

**sync-media Derivative Resolution (Step C2):**
During media sync, the system attempts to overwrite `ad_data.media_hash` from derivative IDs to original IDs using title matching (fetches derivative titles from Meta, matches to originals). This is a best-effort process — it may not resolve all derivatives, which is why the frontend `adIds` reverse lookup is the primary resolution strategy.

**Files:**
- `app/api/creative-studio/media/route.ts` — Media API (returns `adIds` per asset)
- `app/api/creative-studio/active-ads/route.ts` — Active Ads API (server-side fallback chain)
- `app/dashboard/creative-studio/active/page.tsx` — Frontend `resolveMedia()` with `adIdMap` reverse lookup
- `app/api/meta/sync-media/route.ts` — Media sync with derivative resolution (Step C2)
- `app/api/creative-studio/download-media/route.ts` — Downloads files to Supabase Storage
- `components/creative-studio/media-gallery-card.tsx` — Shared card component (renders `<video src={storageUrl}#t=0.3>` for sharp poster frames)

**If Videos Show Low-Res Thumbnails:**
1. Check that `media_library` has `storage_url` for the video (it always should after download-media runs)
2. Check that the media API returns `adIds` arrays — if empty, the derivative resolution in `media/route.ts` failed
3. Check the frontend `adIdMap` is populated — if the media API loads after active-ads, the reverse lookup will be empty on first render
4. The `adIds` reverse lookup is the PRIMARY resolution path for videos — don't try to fix hash matching, fix `adIds` instead

### Ad Studio (Competitor Research & AI Generation)
Research competitor ads and generate new ad copy/images using AI.

**User Flow:**
1. **Step 1:** Enter product URL → Claude extracts product info + downloads product image
2. **Step 2:** Search competitor name → autocomplete dropdown → select company → view ads grid
3. **Step 3:** Click ad → "Use as Inspiration" → Claude generates ad copy → Gemini generates image

**API Integrations:**
| Service | Purpose | API Key |
|---------|---------|---------|
| ScrapeCreators | Facebook Ad Library data | `SCRAPECREATORS_API_KEY` |
| Claude (Anthropic) | Product analysis, ad copy generation | `ANTHROPIC_API_KEY` |
| Gemini 2.5 Flash Image | Image generation with product reference | `GOOGLE_GEMINI_API_KEY` |

**Competitor Search (`/api/creative-studio/competitor-search`):**
- Calls ScrapeCreators company search API
- Returns `{ companies: Array<{ name, pageId, logoUrl }> }`
- Note: Response uses `data.searchResults` not `data.data`

**Competitor Ads (`/api/creative-studio/competitor-ads`):**
- Calls ScrapeCreators company ads endpoint
- Computes stats: media mix (video/image/carousel %), top landing pages, earliest ad date
- Response structure: `data.results` contains ads, ad data nested in `snapshot` object
- Timestamps are Unix (convert with `new Date(ad.start_date * 1000)`)

**Product Analysis (`/api/creative-studio/analyze-product-url`):**
- Fetches product page HTML
- Claude extracts: name, description, price, features, imageUrl
- Downloads product image and stores as base64 for Gemini
- Returns `imageBase64` and `imageMimeType` fields

**Image Generation (`/api/creative-studio/generate-image`):**
- **Dual-Image Mode:** Sends BOTH product image AND competitor ad image to Gemini
- Gemini creates ad using YOUR product in the STYLE of the competitor ad
- Fallback: Imagen text-to-image if no product image
- Uses `responseModalities: ['IMAGE']` config

**Image Download (`/api/creative-studio/download-image`):**
- Downloads competitor ad image server-side (avoids CORS)
- Returns base64 + mimeType for Gemini input

**Key Implementation Details:**
```typescript
// Dual-image Gemini call - product image + reference ad
const response = await genAI.models.generateContent({
  model: 'gemini-2.5-flash-image',
  contents: [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: productMimeType, data: productBase64 } },  // Your product
      { inlineData: { mimeType: refAdMimeType, data: refAdBase64 } },       // Competitor ad style
      { text: prompt }  // "Make an ad using my product that looks like this ad format"
    ]
  }],
  config: { responseModalities: ['IMAGE'] }
})
```

**Bold Style Prompt:**
When "bold" style is selected, the prompt instructs Gemini to create a scroll-stopping, pattern-interrupting ad with:
- Headline text overlaid (spelled exactly as provided)
- Minimal text - only headline + brief supporting copy
- Vibrant colors, high contrast, dynamic angles
- Bold typography that demands attention

**UI Components:**
- `competitor-search-input.tsx` - Debounced (300ms) autocomplete with keyboard navigation
- `competitor-ad-card.tsx` - 4:3 media preview, days active badge, hover-to-play videos
- `competitor-ads-grid.tsx` - Masonry layout, IntersectionObserver infinite scroll
- `competitor-ad-modal.tsx` - Left media player, right ad details, "Use as Inspiration" CTA
- `competitor-media-mix-chart.tsx` - Recharts PieChart for video/image/carousel/text %
- `competitor-filters.tsx` - Media type, days active (0-7, 7-30, 30-90, 90+), status toggles

**Types Added to `components/creative-studio/types.ts`:**
- `CompetitorAd` - Full ad data structure
- `CompetitorCarouselCard` - Carousel card within ad
- `CompetitorStats` - Aggregated stats (totalAds, mediaMix, topLandingPages)
- `CompetitorSearchResult` - Company search result (name, pageId, logoUrl)

**Files:** `app/dashboard/creative-studio/ad-studio/page.tsx`, `app/api/creative-studio/competitor-*.ts`, `app/api/creative-studio/generate-image/route.ts`

### AI Tasks (Portfolio & Session Review)
Portfolio/review page for saved Ad Studio sessions and Video Studio concept canvases. No generation happens here — links to purpose-built studios for new generation.

**User Flow:**
1. Use Ad Studio to generate ad copy → session automatically saved
2. Navigate to AI Tasks page → see all saved sessions and concept canvases
3. Click session → view generated copy, browse existing images (download/save/edit/create-ad)
4. Click "Continue in Ad Studio" → opens Ad Studio at Step 3 with session data pre-populated
5. Click concept canvas → view concepts, watch completed videos, edit in Video Editor
6. Click "Continue in Video Studio" → opens Video Studio with canvas restored

**"Continue in Studio" Navigation:**
- Ad sessions: `/dashboard/creative-studio/ad-studio?sessionId={id}` — restores product info, pills, generated ads, images, jumps to step 3
- Concept canvases: `/dashboard/creative-studio/video-studio?canvasId={id}` — restores canvas with full generation controls

**What AI Tasks shows (read-only):**
- Ad copy cards with copy/save-to-library buttons
- Existing generated images with download, edit in Image Editor, save to library, create ad buttons
- Image carousel with version navigation
- Video playback with Edit Video button
- Concept card details (visual metaphor, script, overlays)
- Compositions with Edit button
- Job status/progress for in-progress generations

**What AI Tasks does NOT do (delegated to studios):**
- Image generation, adjustment, style selection, HD text toggle
- Video generation, quality selection, extend, new variation, retry

**Session Data Structure (`ad_studio_sessions` table):**
```sql
CREATE TABLE ad_studio_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  ad_account_id TEXT,
  product_url TEXT,
  product_info JSONB,          -- {name, description, price, features, imageUrl}
  competitor_company JSONB,    -- {name, pageId, logoUrl}
  competitor_ad JSONB,         -- Full ad object used as inspiration
  generated_ads JSONB,         -- Array of {headline, primaryText, description, angle, whyItWorks}
  image_style TEXT,            -- lifestyle, product, minimal, bold
  generated_images JSONB,      -- Array of {adIndex, versionIndex, storageUrl, mediaHash, mimeType}
  status TEXT DEFAULT 'complete',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Key Files:**
- `app/dashboard/creative-studio/ai-tasks/page.tsx` - AI Tasks page with collapsible sections
- `app/api/creative-studio/ad-session/route.ts` - CRUD for sessions (GET, POST, PATCH, DELETE)
- `app/api/creative-studio/save-generated-image/route.ts` - Uploads to Meta first, then Supabase Storage
- `supabase/migrations/046_ad_studio_sessions.sql` - Session table + RLS policies

**Ad Studio Session Restoration (`?sessionId=` URL param):**
- `useSearchParams` reads `sessionId` from URL
- Fetches session via `GET /api/creative-studio/ad-session?userId=X&sessionId=Y`
- Populates: `productInfo`, pill pools/selection, `generatedAds`, `generatedImages`, `sessionImages`, `selectedCompany`, mode
- Jumps to step 3 (generation/results)
- `restoredSessionRef` prevents double-restoration
- `resetToModeSelection` strips query params via `router.replace`

**Save Generated Image Flow (`/api/creative-studio/save-generated-image`):**
1. Upload base64 to Meta Ads API → get real `imageHash` (required for ads)
2. Upload to Supabase Storage → get `storageUrl` (for display)
3. Insert into `media_library` table with both hashes
4. Return `{storageUrl, mediaHash}` for client use

**Why Meta upload is required:** AI-generated images saved only to Supabase have fake MD5 hashes. Meta requires real `imageHash` from their API to use images in ads. The save flow now uploads to Meta FIRST.

### Saved Copy (Copy Library)
Save AI-generated ad copy from Ad Studio / AI Tasks to the Copy library for reuse.

**User Flow:**
1. Generate ad copy in Ad Studio or AI Tasks
2. Click FileText icon (Save Copy) on any ad copy card → saves to `saved_copy` table
3. Navigate to Creative Suite > Copy → saved copy appears with "AI" badge and zero metrics
4. Click saved copy → detail modal shows angle badge + delete button (trash icon)

**Deduplication:** If saved copy's `primaryText|||headline` key matches an existing ad_data variation, only the ad_data version shows (with real metrics).

**Key Files:**
- `supabase/migrations/048_saved_copy.sql` - Table + RLS + index
- `app/api/creative-studio/copy/route.ts` - GET (merged), POST (save), DELETE (remove)
- `app/dashboard/creative-studio/best-copy/page.tsx` - AI badge, delete in modal
- `app/dashboard/creative-studio/ad-studio/page.tsx` - Save Copy button per card
- `app/dashboard/creative-studio/ai-tasks/page.tsx` - Save Copy button per card
- `app/dashboard/creative-studio/creative-studio-context.tsx` - CopyVariation type extended

### KS Oracle (Ad Studio AI Entry Point)
Intelligent input box that replaces the old 9-mode card grid. Classifies user intent, routes to the correct workflow, or engages in multi-turn conversation for ambiguous/creative requests.

**Three-Tier Architecture:**

| Tier | Model | Role | Latency |
|------|-------|------|---------|
| 1 — Router | Haiku (`claude-haiku-4-5-20251001`) | Fast intent classification → route directly or escalate | ~300-500ms |
| 2 — Guide | Sonnet (`claude-sonnet-4-6`) | Conversational: asks clarifying questions with clickable options, calls tools | Multi-turn |
| 3 — Creative Director | Opus (`claude-opus-4-20250514`) | Bold, opinionated creative direction; crafts rich generation prompts | Multi-turn |

**Flow:**
1. User types in Oracle Box → Haiku classifies intent
2. Clear intent (e.g. "make an ad for my protein bar") → routes directly to workflow (no chat)
3. Ambiguous input → Haiku returns `workflow: 'conversation'` → Sonnet takes over
4. Sonnet asks 2-3 clarifying questions with clickable option pills
5. Sonnet can call tools (analyze product, generate concepts, etc.) and escalate to Opus
6. Opus crafts rich generation prompts → returns `generatedPrompt` for preview

**Workflow Routes (from Haiku or chips):**
`create`, `clone`, `inspiration`, `upload`, `url-to-video`, `ugc-video`, `text-to-video`, `image-to-video`, `open-prompt`

**Oracle Chips (visible in idle mode):**
- "Make Ads" column (6 chips): Product→Ad, Product→Video Ad, Clone Ad, Inspiration, UGC Video Ad, Image→Ad
- "Make Content" column (2 chips): Generate Image, Generate Video
- Chip action types: `workflow` (bypasses Haiku), `focus` (pre-configures toggles), `attach` (opens attach menu)

**Tool System (9 tools, called by Sonnet/Opus):**

| Tool | Credits | What it does |
|------|---------|-------------|
| `analyze_product` | Free | Fetch + analyze product URL |
| `analyze_video` | Free | Gemini video analysis |
| `generate_overlay` | Free | Whisper + Claude overlay gen |
| `generate_ad_copy` | Free | Claude ad copy from product |
| `generate_concepts` | Free | 4 visual metaphor concepts |
| `detect_text` | Free | Gemini Vision text extraction |
| `request_media` | Free | Triggers Upload/Library picker in chat |
| `generate_image` | 5cr | Gemini image generation |
| `generate_video` | 50cr | Veo video generation |

Credit-costing tools show a `credit-confirm` context card and wait for user confirmation before executing.

**Context Cards (11 types rendered in chat thread):**
`product`, `video-analysis`, `overlay-preview`, `ad-copy`, `image-result`, `video-result`, `concepts`, `media-attached`, `credit-confirm`, `tool-loading`, `tool-error`

**Session Persistence:**
- Sessions created when Sonnet conversation starts (2+ messages)
- Auto-saved with 2s debounce to `oracle_chat_sessions` table
- Haiku-only routing (clear intent) does NOT create sessions
- Sessions appear in AI Tasks page "Chats" section with tier badge and conversation replay

**Database (`oracle_chat_sessions`, migration 068):**
- `messages` JSONB — full OracleMessage[] array
- `context` JSONB — accumulated context (productInfo, userMedia, etc.)
- `generated_assets` JSONB — [{type, url, mediaHash, toolUsed, creditCost}]
- `highest_tier` — 'haiku' | 'sonnet' | 'opus'
- `status` — 'active' | 'complete'

**Key Files:**
- `components/creative-studio/oracle-box.tsx` — Input UI with auto-suggest
- `components/creative-studio/oracle-chips.tsx` — Shortcut chip grid
- `components/creative-studio/oracle-chat-thread.tsx` — Chat renderer + 11 card types
- `components/creative-studio/oracle-types.ts` — Complete type system
- `lib/oracle-tools.ts` — Client-side tool executor
- `app/api/creative-studio/oracle-route/route.ts` — Haiku router
- `app/api/creative-studio/oracle-chat/route.ts` — Sonnet guide
- `app/api/creative-studio/oracle-creative/route.ts` — Opus creative director
- `app/api/creative-studio/oracle-session/route.ts` — Session CRUD
- `app/dashboard/creative-studio/ad-studio/page.tsx` — Oracle state (lines 485-508), handlers (lines 1829-2570), UI (lines 3994-4082)

### AI Video Generation (Video Studio)
Generate scroll-stopping short-form video ads using Veo 3.1 (Google).

**User Flow:**
1. **Step 1: Product Input** — URL analysis → Claude extracts product knowledge → Pill selector (7 categories: name, description, features, benefits, key messages, testimonials, pain points)
2. **Step 2: Concepts + Generate** — Claude creates 4 unique visual metaphor concepts, each with different angle (Problem→Solution, Feature Spotlight, Emotional Benefit, Social Proof, etc.) and visual world. Video generation happens inline per concept card (no step 3 navigation).

**Veo 3.1 (Sole Provider):**
- Two quality tiers: Fast (720p, `veo-3.1-fast-generate-preview`) and Standard (1080p, `veo-3.1-generate-preview`)
- Durations: 8/15/22/29 seconds (base 8s + up to 3 extensions × 7s each)
- Image input: any size
- No real-time progress (0% until done)
- Jobs stored in `sora_job_id` column with `veo:` or `veoext:` prefix (legacy column name)
- **Note:** Sora and Runway code was removed. The `sora_job_id` column name is a DB artifact — renaming would require migration + widespread code changes for no functional benefit.

**Concept Generation (`generate-ad-concepts/route.ts`):**
- Claude generates 4 concepts, each rooted in a different product attribute from selected pills
- Angle pool maps pill categories: Pain Points→"Problem→Solution", Benefits→"Emotional Benefit", Features→"Feature Spotlight", Testimonials→"Social Proof", etc.
- 15 visual world categories enforced (MECHANICAL, CULINARY, AQUATIC, ARCHITECTURAL, etc.) — no repeats across 4 concepts
- Banned clichés list (desert/oasis, silk flowing, hourglass, etc.)

**Overlay System:**
- Hook overlays (2-line text), captions (auto-synced via Whisper), CTA, graphics, end cards
- Non-destructive versioning — each save increments version, rollback available
- Voiceover via OpenAI TTS with 6 voice options

**Compositions (Multi-Clip):**
- Combine sibling concept videos into single timeline
- Each clip's overlay config preserved for round-trip editing

**Credit Cost:** Standard (Fast 720p) = 20cr base + 30cr/extension. Premium (1080p) = 50cr base + 75cr/extension. Images = 5cr.

### Unified Credit System
Credits replace count-based limits for AI generation.

- **Credit costs:** Images = 5 credits, Videos = 50 credits
- **Plan limits:** Pro = 500/month (roll over), Trial = 25 total
- **Tables:** `ai_generation_usage` (tracks with `credit_cost`), `ai_credit_purchases` (top-ups), `ai_credit_overrides` (admin)
- **API response:** `{ used, planLimit, purchased, totalAvailable, remaining, status }`
- **Refund pattern:** Failed generations insert negative `credit_cost` row
- **UI:** Buttons disabled when `remaining < 5` (images) or `remaining < 50` (videos)

### Video Analysis (Gemini 2.0 Flash)
AI-powered creative analysis of video ads using Gemini's native multimodal video processing.

**Why Gemini:** Only model that can natively process video files (Claude/GPT handle text/images only). Gemini's File API handles audio transcription + visual analysis + temporal flow in one pass.

**Pipeline:**
1. User clicks "Analyze" on a video in Creative Studio
2. `POST /api/creative-studio/analyze-video` — subscription check, cache lookup
3. Performance context enrichment — queries `ad_data` for real metrics (ROAS, CTR, thumbstop rate, hold rate)
4. `analyzeVideo()` in `lib/gemini.ts`:
   - Downloads video from Supabase Storage → temp file
   - Uploads to Gemini File API (`fileManager.uploadFile`)
   - Polls until `file.state === 'ACTIVE'` (Gemini processes video server-side)
   - Sends processed video + "Creative Strategist" prompt → structured JSON response
5. Results cached in `video_analysis` table (same video never re-analyzed)

**Analysis Output:**
- Full audio/dialogue transcript
- Funnel stage scores (0-100): Hook, Hold, Click, Convert — with timestamps, elements, improvements
- Style detection: speaker style, visual style, emotional tone
- 2-3 script rewrite suggestions with hook/body/CTA
- Quick wins (actionable improvements)

**Key Files:**
- `app/api/creative-studio/analyze-video/route.ts` — orchestrator (subscription check, cache, performance context)
- `lib/gemini.ts` — `analyzeVideo()` function + creative strategist prompt
- `app/api/creative-studio/video-analyses/route.ts` — list endpoint for AI Tasks page
- Database: `video_analysis` table (migration 045), indexes (migration 054)

### AI Image Editor (Gemini 3 Pro)
Full prompt-based image editing with intelligent text detection and replacement.

**Route:** `/dashboard/creative-studio/image-editor`

**Capabilities:**
- **Smart Text Detection:** Gemini Vision auto-detects headline/subtext/CTA/other text blocks, re-detects after each edit
- **Text Editing:** Click pencil icon on detected text → inline edit → single API call: "Change text 'X' to 'Y'. Keep everything else identical."
- **Free-Form Prompts:** "Make background purple to blue", "Remove the logo", "Change aspect ratio to portrait"
- **Version History:** Original = v0 (always preserved), each edit creates new version in Supabase Storage, click thumbnail to jump to past versions, editing from past version branches history

**Entry Points:**
- Ad Studio / AI Tasks: "Edit" button on generated images
- Media Library: "Edit with AI" button on image cards
- Direct upload: Drag-drop on editor page
- Sidebar nav item under Creative Studio

**Save Actions:**
- Save to Library (Meta upload + storage + media_library table)
- Download (client-side PNG)
- Launch as Ad (opens Launch Wizard with image preloaded)

**Credit Cost:** Free (edits don't cost credits; original image generation = 5cr)

**Database:** `image_editor_sessions` (migration 060) — stores source_type, source_id, original_image_url, versions JSONB, detected_text JSONB

**Design:** Full-screen immersive layout. Floating text panel (left, collapsible → bottom sheet on mobile). Version strip (bottom, horizontally scrollable). Prompt bar (fixed bottom, full-width input).

**Files:** `app/dashboard/creative-studio/image-editor/page.tsx`, `app/api/creative-studio/detect-text/route.ts`, `app/api/creative-studio/adjust-image/route.ts`, `app/api/creative-studio/image-editor-session/route.ts`

### Open Prompt System (Ad Studio)
Two new modes for direct AI generation without forced templates.

**Image Mode:**
- Raw user text prompt → Gemini image gen
- Optional source image via icon-only dropdown (Upload / Media Library)
- No forced headline/primary text generation or ad copy curation
- Result stored as `source_type: 'open_prompt'` in sessions

**Video Mode (3-Stage Flow):**
1. **Write Script:** User enters free-form scene description
2. **Director's Review:** GPT 5.2 segments prompt into Veo time chunks. Editable per-segment prompts, overlay controls, extension management (+7s buttons, max 3 extensions = 29s total)
3. **Action!:** Generate video via Veo 3.1

**Scene Planning (`/api/creative-studio/plan-scene`):**
- GPT 5.2 segments user prompt into Veo time chunks without rewriting
- Preserves user's exact words/tone/pacing (no embellishment)
- Snaps to valid Veo durations: 8, 15, 22, 29 seconds
- Returns: `{videoPrompt, extensionPrompts[], estimatedDuration, numExtensions, overlay, adCopy}`
- "Continue from previous shot" prepended to each extension automatically

**Prompt Architecture (all non-UGC video gen):**
- Removed block headers `[Scene]`, `[Subject]`, `[Action]`, `[Technical]` that confused Veo
- All prompts now use natural flowing prose
- Balanced segmentation: evenly distributed beats per segment

**Files:** `app/dashboard/creative-studio/direct/page.tsx`, `app/api/creative-studio/plan-scene/route.ts`, `app/api/creative-studio/generate-direct-concept/route.ts`

### Veo 3.1 Multi-Extension Support
Videos longer than 8 seconds use Veo's extension API to chain segments.

**Duration System:**
- Valid durations: 8, 15, 22, 29 seconds (snapped via `snapToVeoDuration()`)
- Base: 8 seconds. Each extension: +7 seconds. Max 3 extensions.
- GPT segments prompt into main (8s) + extension prompts (7s each)
- Client submits main prompt first → get video → extend with each `extension_prompts[i]`

**Database Columns (migration 059):**
- `provider` - explicit: veo (legacy column, previously supported sora/runway)
- `target_duration_seconds` - 8, 15, 22, or 29
- `extension_step` - which extension number (starting at 0)
- `extension_total` - total extensions for this job
- `extension_video_uri` - output URI for each extension segment
- `extension_prompts` JSONB (migration 062) - per-segment prompts array

### Video Styles (Veo 3.1 Optimized)
10 video styles with per-style guidance for Veo 3.1.

**Current styles:** `talking_head`, `lifestyle`, `product_showcase`, `interview`, `unboxing`, `before_after`, `testimonial`, `product`, `macro`, `documentary`

**Removed:** `playful`, `satisfying`, `b_roll`
**Added:** `product`, `macro`, `documentary`

**UGC Product Visibility (Smart Rules):**
- Wearables stay on through all segments
- Holdables get set down after intro
- User direction notes override defaults

**Component:** `VideoStylePicker` - Grid layout (2 cols mobile, 4 cols desktop), icon + label + description cards

### AI-Powered Features
- **KS Oracle:** Three-tier AI entry point (Haiku router → Sonnet guide → Opus creative director) with tool use, context cards, and session persistence
- **Andromeda AI Chat:** Follow-up questions about account structure audit
- **Health Recommendations:** Claude-powered optimization suggestions with priority ranking
- **Ad Studio Copy Generation:** Claude generates ad copy inspired by competitor ads
- **Ad Studio Image Generation:** Gemini 3 Pro Image creates ad images using product reference
- **AI Image Editor:** Gemini 3 Pro prompt-based image editing with text detection
- **Open Prompt:** Direct user prompt → image or video without templates
- **Scene Planning:** GPT 5.2 segments prompts into Veo time chunks
- **Video Analysis:** Gemini 2.0 Flash multimodal video analysis with funnel stage scoring
- **Video Concept Generation:** Claude generates 4 visual metaphor concepts with angle diversity
- **Video Overlay Generation:** Whisper transcription + Claude generates time-synced captions
- **Voiceover:** OpenAI TTS with 6 voice options

### Onboarding Wizard & Free Trial
3-step wizard runs once after first authentication. All steps skippable. Creates a 7-day Launch trial (no credit card).

**Flow:** Signup → verify/OAuth → `/dashboard` → layout redirect → `/onboarding` → wizard completes → 7-day trial starts → `/dashboard`

**Steps:**
| # | Step | What it does | Skip behavior |
|---|------|-------------|---------------|
| 1 | Profile | First name, last name, timezone | Keeps defaults from OAuth |
| 2 | Connect Meta | OAuth to Meta Ads API | No Meta connection |
| 3 | Select Accounts | Pick ad accounts to track | Auto-skipped if ≤1 account |

**Trial Details:**
- Plan: Pro (full-featured 7-day trial, no credit card required)
- Duration: 7 days from wizard completion
- Status: `trialing` in subscriptions table
- Expiry: `lib/subscription.tsx` checks `current_period_end` — expired trials treated as no subscription
- Lockout: Redirects to `/account` page with "trial expired" messaging and subscribe CTA

**Key Architecture Decisions:**
- **Standalone page** (`app/onboarding/`) — NOT under `/dashboard/` (no sidebar, no subscription check). Gets `AuthProvider` and `SubscriptionProvider` from root layout.
- **Server-side completion** (`app/api/onboarding/complete/route.ts`) — uses service role key to bypass RLS for `subscriptions` insert and `profiles.onboarding_completed` update. Client-side supabase can't write to these tables.
- **Dashboard layout gate** (`app/dashboard/layout.tsx`) — async onboarding check runs BEFORE subscription check. Subscription gate waits for `onboardingChecked` state to prevent race condition (subscription redirect firing before onboarding query completes).
- **sessionStorage flags** — `ks_onboarding_checked` and `ks_had_valid_subscription` prevent redundant DB queries on navigation and avoid redirect flicker after wizard completion.
- **Full page reload** after completion (`window.location.href` not `router.push`) — forces subscription context to re-initialize with the new trial row.

**OAuth returnTo Support:**
Meta and Shopify OAuth routes support a `returnTo` query param (validated as safe relative path). The onboarding wizard passes `returnTo=/onboarding` so OAuth callbacks redirect back to the wizard instead of `/dashboard/connect`.

**Files:**
- `app/onboarding/page.tsx` — Wizard UI with progress indicator
- `app/api/onboarding/complete/route.ts` — Trial creation + completion (service role)
- `app/dashboard/layout.tsx` — Onboarding gate (lines 86-126)
- `lib/subscription.tsx` — Trial expiry check (lines 81-89)
- `app/api/auth/meta/route.ts` — `returnTo` param support
- `app/api/auth/meta/callback/route.ts` — `returnTo` redirect logic
- `app/api/auth/shopify/route.ts` — `returnTo` param support
- `app/api/auth/shopify/callback/route.ts` — `returnTo` redirect logic
- `app/dashboard/settings/page.tsx` — Trial badge + days remaining display
- `app/account/page.tsx` — Trial expired messaging + subscribe CTA
- `supabase/migrations/043_onboarding_and_trial.sql` — Profile columns + existing user backfill

**Migration Note:** Migration must be applied manually via Supabase SQL Editor. It backfills all existing users with `onboarding_completed = true` so they never see the wizard.

---

## Database

66+ migrations. Key tables:

**Core:**
- `profiles` - User profiles (linked to auth.users)
- `subscriptions` - Plan, Stripe IDs
- `meta_connections` - Meta OAuth tokens, ad accounts (JSONB)
- `google_connections` - Google OAuth tokens, customer IDs (JSONB)

**Workspaces:**
- `workspaces` - Business containers (includes `business_type`)
- `workspace_accounts` - Links ad accounts to workspaces (includes `platform`)
- `workspace_members` - Team with roles
- `workspace_invites` - Pending invitations
- `workspace_rules` - ROAS/CPR thresholds per workspace
- `workspace_pixels` - One pixel per workspace (KS-XXXXXXX)

**Performance:**
- `ad_data` - Meta ad performance data
- `google_ad_data` - Google Ads campaign data
- `pixel_events` - Pixel events (includes `order_id` for JOIN model)
- `shopify_orders` - Synced orders with `last_utm_content` attribution
- `uppromote_connections` - UpPromote API connections (workspace-scoped)
- `uppromote_referrals` - Affiliate referral/commission data
- `starred_ads` - Bookmarked ads for Performance Sets
- `budget_changes` - Tracking for Andromeda-safe scaling
- `saved_copy` - AI-generated ad copy saved from Ad Studio/AI Tasks

**AI Generation:**
- `video_generation_jobs` - Veo job tracking (`sora_job_id` is legacy column name, stores `veo:`/`veoext:` prefixed operation IDs). Includes `provider`, `target_duration_seconds`, `extension_step`, `extension_total`, `extension_video_uri`, `extension_prompts` JSONB, `ad_copy` JSONB
- `video_overlays` - Non-destructive overlay versions (dual parent: job or composition)
- `video_concept_canvases` - Persisted concept sets linking to all generated jobs
- `video_compositions` - Multi-clip timelines with `source_job_ids` array
- `ai_generation_usage` - Unified credit tracking (images + videos, `credit_cost` column)
- `ai_credit_purchases` - User credit top-ups
- `ai_credit_overrides` - Admin custom credit limits
- `ad_studio_sessions` - Saved ad generation sessions for AI Tasks
- `image_editor_sessions` - AI image editor sessions with version history (migration 060)
- `media_sync_log` - Tracks media sync cooldowns per user+account (migration 066)
- `oracle_chat_sessions` - KS Oracle conversation sessions with messages, context, generated assets (migration 068)

**Views:**
- `creative_star_counts` - Aggregates stars by creative (deduplication)
- `ad_sessions_strip_base64_view` - Ad sessions without base64 data (migration 055)

---

## Verdict Logic

Calculated in `lib/supabase.ts:calculateVerdict()`:

**E-commerce (ROAS-based):**
```
spend < learning_spend → LEARN
roas >= scale_roas → SCALE
roas >= min_roas → WATCH
else → KILL
```

**Lead Gen (CPR-based):**
```
spend < learning_spend → LEARN
cpr <= target_cpr → SCALE
cpr <= max_cpr → WATCH
else → KILL
```

**Defaults:** scale_roas=3.0, min_roas=1.5, learning_spend=$100

### Verdict Display (CBO vs ABO)
- **CBO campaigns:** Verdict at campaign level only
- **ABO ad sets:** Verdict at adset level only
- **Ads:** Performance arrows (up/down) instead of verdict text

---

## Recent Fixes (January–February 2026)

### Image Generation Ignoring Creative Direction (Feb 23)
**Status:** COMPLETE

**Problem:** When "Source Image" is toggled off in Ad Studio, the "adjust image" / "Describe how you want the ad to look" field (`imagePrompt`) was completely ignored during image generation.

**Root Cause:** In `lib/prompts/image-generation.ts`, when source image is excluded, `hasProductImage` and `hasReferenceAd` are both false, causing the code to skip the branch that uses `buildCustomPrompt` (which respects `imagePrompt`) and fall through to `buildTextOnlyPrompt` which had no `imagePrompt` support.

**Fix:** Added `imagePrompt` check at the top of `buildTextOnlyPrompt` — if user provided creative direction, uses it as primary guidance with product context and exact ad text requirements.

**File:** `lib/prompts/image-generation.ts`

### Ad Studio Open Prompt + Video Styles Overhaul (Feb 22)
**Status:** COMPLETE

Added Open Prompt system (image mode: raw prompt → Gemini, video mode: Write Script → Director's Review → Action). Overhauled video styles for Veo 3.1 (removed playful/satisfying/b_roll, added product/macro/documentary). Extracted all prompts to `lib/prompts/` library.

**Key Files Created:**
- `app/api/creative-studio/plan-scene/route.ts` - GPT 5.2 scene segmentation
- `app/dashboard/creative-studio/direct/page.tsx` - Direct Studio page
- `lib/prompts/*.ts` - Centralized prompt library (12+ files)
- `docs/plans/2026-02-22-ad-studio-open-prompt-design.md` - Design spec

### AI Image Editor (Feb 21)
**Status:** COMPLETE

Full AI image editor with Gemini 3 Pro editing, smart text detection via Gemini Vision, version history, and multiple entry points (Ad Studio, AI Tasks, Media Library, direct upload).

**Files Created:**
- `app/dashboard/creative-studio/image-editor/page.tsx` - Editor page
- `app/api/creative-studio/detect-text/route.ts` - Text detection
- `app/api/creative-studio/image-editor-session/route.ts` - Session CRUD
- `supabase/migrations/060_image_editor_sessions.sql` - Session table + RLS
- `docs/plans/2026-02-21-ai-image-editor-design.md` - Design spec

### AI Tasks: Remove Generation, Add Studio Navigation (Feb 22)
**Status:** COMPLETE

Removed image and video generation from AI Tasks page (~700 lines removed). AI Tasks is now a portfolio/review page that links to the purpose-built studios for any new generation.

**Changes:**
- **Ad Studio session restoration** — Added `?sessionId=X` URL param support. Fetches session, populates product info, pills, generated ads/images, mode, and jumps to Step 3.
- **AI Tasks AdSessionDetailPanel** — Removed: `imageStyle`, `hdText`, `adjustmentPrompts`, `generatingImageIndex`, `adjustingImageIndex`, `aiUsage`/`refreshCredits`, `handleGenerateImage`, `handleAdjustImage`, style selector, HD Text toggle, credits display, regenerate button, adjust input, generate button. Added: "Continue in Ad Studio" and "Generate in Ad Studio" links.
- **AI Tasks ConceptCanvasDetailPanel** — Removed: `VideoQuality` type, `conceptQuality`, quality/cost constants, helper functions, `credits` + fetch, `generatingIndex`, `generateError`, `extendingIndex`, `handleGenerate`, `handleExtend`, extend button, variation button, quality selector, generate button, error display, retry button. Added: "Continue in Video Studio", "Generate in Video Studio", "Retry in Video Studio" links.

**Files Modified:**
- `app/dashboard/creative-studio/ad-studio/page.tsx` — Added `useSearchParams`, `restoredSessionRef`, session restoration useEffect, query param strip on reset
- `app/dashboard/creative-studio/ai-tasks/page.tsx` — Removed all generation state/handlers/JSX, added studio navigation links
- `CLAUDE.md` — Updated AI Tasks section, added session restoration docs

**Key Patterns:**
- `restoredSessionRef` prevents double-restoration from React strict mode
- `router.replace('/dashboard/creative-studio/ad-studio', { scroll: false })` strips query params on reset
- `e.stopPropagation()` on Link clicks inside concept cards prevents accordion toggle

### Save Copy to Copy Library (Feb 6)
**Status:** COMPLETE

Added ability to save AI-generated ad copy from Ad Studio and AI Tasks to the Creative Suite Copy page. Saved copies appear with "AI" badge, zero metrics, and can be deleted from the detail modal. Deduplication ensures saved copies don't duplicate existing ad_data variations.

**Files Created:**
- `supabase/migrations/048_saved_copy.sql` - New table with RLS

**Files Modified:**
- `app/api/creative-studio/copy/route.ts` - Added POST, DELETE handlers; GET merges saved copies
- `app/dashboard/creative-studio/creative-studio-context.tsx` - Extended CopyVariation type
- `app/dashboard/creative-studio/best-copy/page.tsx` - AI badge, delete button in modal
- `app/dashboard/creative-studio/ad-studio/page.tsx` - Save Copy button per ad card
- `app/dashboard/creative-studio/ai-tasks/page.tsx` - Save Copy button per ad card

### Launch Wizard Hydration + Ad Studio Fixes (Feb 6)
**Status:** COMPLETE

**Problem:** Newly created campaigns/ads from Launch Wizard didn't appear in dashboard until manual sync.

**Root Causes Found & Fixed:**

1. **Timezone mismatch in hydrate API** — `hydrate-new-entity/route.ts` used UTC date (`new Date().toISOString().split('T')[0]`) but dashboard queries used local date. At 8pm EST, hydrate inserted rows for "tomorrow" (UTC) that the dashboard's "today" (local) query missed.
   - **Fix:** Changed to local date format matching dashboard queries

2. **Budget conversion missing for adset/ad flows** — Campaign hydration divided budgets by 100 (cents→dollars) but adset and ad flows didn't, showing budgets 100x too high.
   - **Fix:** Added `/100` to budget fields in adset and ad entity type handlers

3. **Ads in review not shown** — Dashboard filtered entities to only `ACTIVE` or `PAUSED` status. Newly created ads start in `PENDING_REVIEW` until Meta approves them.
   - **Fix:** Added `PENDING_REVIEW` and `WITH_ISSUES` to allowed statuses in both `loadData` and `loadDataAndCache` functions

4. **Ad Studio image prompt not passed to API** — `handleGenerateImage` callback was missing `imagePrompts` in its `useCallback` dependency array, causing stale closure that always saw empty `{}`.
   - **Fix:** Added `imagePrompts` to the dependency array

**Files Modified:**
- `app/api/meta/hydrate-new-entity/route.ts` — Local date format, budget `/100` for all entity types
- `app/dashboard/page.tsx` — Added `PENDING_REVIEW`, `WITH_ISSUES` to `activeStatuses` (lines ~1062 and ~1424)
- `app/dashboard/creative-studio/ad-studio/page.tsx` — Added `imagePrompts` to `handleGenerateImage` deps
- `components/sidebar.tsx` — Removed "Best Ads" nav item

**Key Pattern:**
- When hydrating/inserting data that will be queried by the dashboard, ensure date formats match (both should use local dates, not UTC)
- Meta returns budgets in cents — always divide by 100 when storing for display

### Creative Studio Mobile View + Stability (Feb 1)
**Status:** COMPLETE

**Problem:** Creative Studio was unusable on mobile — funnel filter pills scrolled off-screen, controls overlapped, table rows showed no scores, theater modal was cramped, and the page had severe rendering instability (content flashing, thumbnails disappearing).

**Root Causes Found & Fixed:**
1. **Funnel pills scrolled off-screen** — Changed from horizontal `overflow-x-auto` row to `grid grid-cols-2` on mobile (2x2 square), `lg:flex` on desktop
2. **Skeleton/content flash** — `isLoading` conditional swapped between a skeleton div and FunnelFilterBar, causing unmount/remount. Fixed by always rendering FunnelFilterBar (shows `0/0` stats while loading)
3. **Video thumbnails disappearing** — `loadData` callback had `[user, currentAccountId]` deps, which changed identity on every auth context re-render, triggering duplicate API calls and `setAssets()` with new object references. Every `<img>`/`<video>` element unmounted and remounted. Fixed with stable refs and `lastLoadedAccountRef` to only re-fetch on actual account changes
4. **Framer Motion staggered animations** — Four `motion.div` sections animated in at 0ms/100ms/300ms delays, looking like the page was reloading in waves on mobile. Replaced with plain `div` elements
5. **`fetchVideoSource` dep array** — Had `videoSources` state in deps, causing the callback to recreate on every video source fetch, triggering unnecessary gallery re-renders. Switched to a ref

**Mobile Layout Changes:**
- Funnel filter bar: 2x2 grid on mobile, horizontal row on desktop
- Page controls: stack vertically on mobile (`flex-col`), side-by-side on desktop
- Table rows: mobile score pills (`H:82 Hd:71 Cl:65 Cv:48`) + fatigue badge on second line (`lg:hidden`)
- Theater modal: `grid-cols-2 sm:grid-cols-3` stat grids, larger close button touch target (`p-3 sm:p-2`)
- Starred bar: compact text on mobile ("Build 5" vs "Build Ads from 5 Starred"), `max-w-[calc(100vw-2rem)]`
- Sort dropdown: `left-0 lg:left-auto lg:right-0` to stay on-screen on mobile

**Scroll-to-Play (Mobile Gallery):**
- Videos auto-play muted when 60%+ of card is visible (IntersectionObserver, threshold 0.6)
- Pauses and resets when scrolled away
- Touch detection via `ontouchstart in window || navigator.maxTouchPoints > 0`
- Desktop keeps hover-to-play behavior unchanged
- Also pre-fetches video source URLs on scroll-into-view (previously only on hover)

**Files Modified:**
- `app/dashboard/creative-studio/page.tsx` — Removed motion.div wrappers, stabilized loadData, always-render FunnelFilterBar, stable fetchVideoSource
- `components/creative-studio/funnel-filter-bar.tsx` — Grid layout on mobile, larger clear button
- `components/creative-studio/media-table.tsx` — Mobile score pills on second line
- `components/creative-studio/theater-modal.tsx` — Responsive stat grids, larger close button, added missing Layers import
- `components/creative-studio/starred-media-bar.tsx` — Compact mobile text, overflow prevention
- `components/creative-studio/media-gallery-card.tsx` — IntersectionObserver scroll-to-play on mobile
- `components/launch-wizard.tsx` — Exported `Creative` interface (was causing Vercel type error)

**Key Patterns (for future reference):**
- **Never swap between skeleton and real component** — causes unmount/remount flash. Always render the component, pass loading state as prop or show zero-state.
- **Stabilize useCallback deps for data fetching** — auth/account context objects change identity on every re-render. Use refs for values, track actual ID changes with a `lastLoadedRef`.
- **Always clean-build before pushing** — `rm -rf .next && npm run build`. Local cached builds miss type errors that Vercel's clean build catches.

### Unified Dashboard: Campaign Manager Merged (Jan 26)
**Status:** COMPLETE

**Problem Solved:** Campaign Manager was a separate page, causing orphaned entities (new/paused items not visible in Performance Dashboard) and forcing users to context-switch between pages.

**Solution:** Merged all Campaign Manager features into Performance Dashboard.

**Files Created:**
- `app/api/meta/sync-entity/route.ts` - Lightweight endpoint to sync single entity from Meta (for immediate display after create/duplicate)

**Files Modified:**
- `components/performance-table.tsx`:
  - Added overflow menu (⋯) with Edit, Info, Duplicate, Delete actions
  - Added "+ Create" button in table header
  - Added `syncingEntities` prop for loading overlay on rows
  - Exported `HierarchyNode` type
  - New callbacks: `onEditEntity`, `onInfoEntity`, `onDuplicateEntity`, `onDeleteEntity`
- `app/dashboard/page.tsx`:
  - Added modal state and handlers for Edit, Info, Duplicate, Delete
  - Integrated all modals from Campaign Manager
- `app/api/meta/duplicate-campaign/route.ts` - Added `needsSync: true` to response
- `app/api/meta/duplicate-adset/route.ts` - Added `needsSync: true` to response
- `app/api/meta/duplicate-ad/route.ts` - Added `needsSync: true` to response, `copyOverride` for ad copy editing
- `components/inline-duplicate-modal.tsx` - Added ad copy editing UI (Primary Text, Headline, Description)
- `components/edit-entity-modal.tsx` - Enhanced for unified dashboard integration
- `components/sidebar.tsx` - Removed "Manager" nav item
- `app/dashboard/campaigns/page.tsx` - Now redirects to `/dashboard` (old code preserved as `page.old.tsx`)

**Key Features:**
- All entity management (edit, duplicate, delete) available directly in Performance table rows
- Create button opens Launch Wizard for new campaigns
- Syncing overlay shows when entities are being fetched after create/duplicate
- Google Ads entities show only play/pause (no overflow menu - limited API support)
- Ad copy editing when duplicating ads (Primary Text, Headline, Description)
- Creates new creative with modified copy via Meta API (existing creatives are immutable)

### Creative Thumbnails in Performance Table (Jan 25)
**Status:** COMPLETE

**Files Modified:**
- `components/performance-table.tsx` - Added creative loading, thumbnails, preview modal
- `app/dashboard/page.tsx` - Added `creative_id` to data mapping in BOTH `loadData` and `loadDataAndCache` functions, AND in `tableData` transformation
- `lib/csv-parser.ts` - Added `creative_id` field to `CSVRow` type

**Implementation:**
- Lazy loads creatives when adsets expand (via useEffect)
- Uses `CreativePreviewTooltip` for hover preview (desktop)
- Full-screen preview modal on click
- Supports images and videos (play icon overlay)
- Skips Google Ads (no creatives)

**Key Pattern (from campaigns page):**
```typescript
const [creativesData, setCreativesData] = useState<Record<string, Creative>>({})
const [loadingCreatives, setLoadingCreatives] = useState<Set<string>>(new Set())
const loadedCreativesRef = useRef<Set<string>>(new Set())  // Prevents duplicate loads
```

**Bug Fix (Jan 25):** `creative_id` was being stripped at THREE places:
1. `loadDataAndCache` function was missing `creative_id: row.creative_id`
2. `CSVRow` type in `lib/csv-parser.ts` didn't include `creative_id` field
3. `tableData` transformation wasn't passing `creative_id` through

### Settings Page Alert Preferences Fix (Jan 25)
**File:** `app/dashboard/settings/page.tsx`

**Problem:** Alert preferences weren't saving - changes lost on refresh.

**Root Cause:** Frontend column names didn't match database schema:
- Frontend: `email_weekly_digest`, `email_alerts`, `email_product_updates`
- Database: `email_digest_enabled`, `alert_emails_enabled`, `marketing_emails_enabled`

**Fix:** Updated frontend to use correct database column names.

### Sidebar Platform Badges (Jan 25)
**File:** `components/sidebar.tsx`

Added platform badges to account selector dropdown:
- Meta accounts show blue "M" badge (`bg-[#0866FF]`)
- Google accounts show red "G" badge (`bg-[#EA4335]`)

Badges appear both in the main selector button and in the dropdown list.

### Attribution Models Simplified (Jan 24)
Removed multi-touch attribution models (Linear, Time Decay, Position Based) - only meaningful for cross-channel attribution. KillScale is Meta-only, so only First Touch and Last Touch make sense.

**Files Modified:**
- `lib/attribution-models.ts` - Simplified to only `first_touch` | `last_touch`
- `lib/attribution.tsx` - Removed `time_decay_half_life`, set `isMultiTouchModel` to always false
- `app/dashboard/settings/workspaces/page.tsx` - Removed multi-touch UI options
- `app/api/pixel/attribution/route.ts` - Simplified attribution logic

### UTM Sync Never Auto-Fetches (Jan 24)
Campaign manager no longer auto-fetches UTM status on page load or adset expand.

**Files Modified:**
- `app/dashboard/campaigns/page.tsx`
  - Removed `loadAllAdsForUtmStatus` call on page load (now always uses `loadAdSetsAndAdsOnly`)
  - Removed `fetchUtmStatus(adIds)` call in `loadAds()`
  - Manual sync button only syncs ACTIVE campaigns (skips paused)

### Trends Page Always Shows Last 30 Days (Jan 24)
**File:** `app/dashboard/trends/page.tsx`

- Data query now filters to last 30 days (independent of dashboard date selection)
- Time series chart shows all 30 days (days with no data show as 0)
- Date label always shows "Last 30 Days"

### Dashboard Paused Filter Default (Jan 24)
**File:** `app/dashboard/page.tsx:230`

Changed `includePaused` default from `true` to `false` - paused items hidden by default.

### Workspace View Empty Table Fix
**File:** `components/performance-table.tsx:806`

**Problem:** Workspace view showed correct totals in stat cards but no rows in performance table.

**Root Cause:** When `shopifyAttribution` was passed as an empty object `{}`, the truthy check `if (shopifyAttribution)` passed, entering the Shopify attribution branch which then had no data to apply - effectively hiding all rows.

**Fix:** Changed check to require actual data:
```typescript
// Before (broken):
if (shopifyAttribution) {

// After (fixed):
if (shopifyAttribution && Object.keys(shopifyAttribution).length > 0) {
```

**Why totals worked:** `shopifyTotals` comes from aggregate Shopify order data (doesn't require UTM attribution), while `shopifyAttribution` requires per-ad UTM data from pixel. When no orders have UTM attribution yet, totals show but per-ad breakdown is empty.

---

## Current Work (February 2026)

### Workspace-First Architecture (Partially Complete)
Migration 065 auto-links all existing connected accounts to user's default workspace and ensures every user has `selected_workspace_id` set. Data queries are now workspace-scoped.

### Media Sync Cooldown (Complete)
Migration 066 added `media_sync_log` table tracking when media sync last ran per user+account. Supports 24-hour cooldown between full syncs. Stores counts: `image_count`, `video_count`, `new_images`, `new_videos`.

### Shopify + Pixel JOIN Model Attribution
order_id based deduplication. API updated, pixel purchase endpoint created, migration ready.

**Attribution Waterfall (E-commerce):**
1. Shopify UTM (`last_utm_content`) - Primary
2. KillScale Pixel (`utm_content`) - Secondary
3. Meta API - Fallback
4. Unattributed - No ad credit

---

## Pricing

- **Pro ($129/mo | $83/mo yearly):** All features, 3 ad accounts, 500 AI credits/mo (roll over), first-party pixel, workspaces, Campaign Launcher, up to $100k tracked spend
- **Agency (Custom):** 10+ ad accounts, custom AI limits, unlimited tracked spend, dedicated support + Slack, white-label options (sales@killscale.com)
- **Trial:** 7-day fully functional Pro trial (no credit card required)
- **Credit Packs:** 100/$20, 250/$50, 500/$100, 1000/$200

---

## FRAGILE CODE - DO NOT MODIFY WITHOUT APPROVAL

The following code sections are critical and have been carefully tuned to avoid Meta API rate limits.
**DO NOT modify without explicit user approval and testing with large accounts (100+ ads).**

### 1. UTM Status Sync (`app/api/meta/sync-utm-status/route.ts`)
- Uses Meta Batch API to combine 50 ad requests into ONE HTTP call
- **Why fragile:** Individual fetch() calls will hit rate limits. Previous versions caused production rate limit errors.
- **If you must modify:** Keep batch size at 50, keep 1s delay between batches

### 2. UTM Cache (`app/dashboard/campaigns/page.tsx`)
- Lines 153-185: Cache get/set functions with 24-hour TTL
- Lines 429-446: `handleManualUtmSync()` - manual refresh button handler
- **Why fragile:** Reducing cache TTL or removing cache = rate limits on page navigation
- **If you must modify:** Never reduce TTL below 1 hour

### 3. Creative Loading (`app/dashboard/campaigns/page.tsx`)
- Lines ~650-670: `toggleAdSet()` - on-demand creative loading per adset
- Lines ~720-750: `loadCreative()` - uses ref to prevent stale closures
- **Why fragile:** Fixed in commit 3b3fef7. Uses refs for closure safety. Bulk loading = rate limits.
- **If you must modify:** Never load creatives for ALL ads at once

### 4. Main Sync Process (`app/api/meta/sync/route.ts`)
- Lines 413-542: Meta Batch API entity fetch (campaigns + adsets + ads in ONE call)
- Lines 358-401: Insights pagination with rate limiting
- **Why fragile:** Carefully tuned delays (3s before batch, 1s between pages) for Meta API limits
- **If you must modify:** Never remove delays, never increase batch sizes beyond 50

### 5. Creative Thumbnails & Video Playback
- **Thumbnails:** The sync batch request fetches `creative{id}`. To get high-quality thumbnails, expand to `creative{id,thumbnail_url,video_id}` with `thumbnail_width=1080&thumbnail_height=1080` — this is ZERO extra API calls (same batch).
- **Video playback:** Use `/api/creative-studio/video-source` endpoint which does a SINGLE `/{video_id}?fields=source` call when the user clicks play. Never prefetch video source URLs in bulk.
- **Creative Studio:** Reads thumbnail/video data from Supabase (populated by sync). Never calls Meta API for browsing.
- **Meta API version:** Must stay current. Meta sunsets old versions ~2 years after release. v18.0 was sunset Jan 2026. Currently using v21.0. If thumbnails go blurry or videos stop playing, check the API version FIRST.
- **If you must modify:** ONLY change the API version string. Do NOT remove the `fetchVideoDetails` function from the creative route. Do NOT add bulk video source fetching. Do NOT add in-memory caches that could serve stale data missing fields.

### 6. Creative Studio Data Loading (`app/dashboard/creative-studio/page.tsx`)
- `loadData` uses refs (`userRef`, `accountRef`) so the callback has stable identity (`[]` deps)
- `lastLoadedAccountRef` tracks which account was loaded — only re-fetches on actual account change
- FunnelFilterBar is ALWAYS rendered (never swapped for skeleton) to prevent layout flash
- `fetchVideoSource` uses `videoSourcesRef` (not state) in deps to prevent gallery re-renders
- **Why fragile:** Auth/account context objects change identity on every re-render. Any `useCallback` with `[user, currentAccountId]` deps will fire the useEffect on every context update, causing duplicate API calls and full gallery unmount/remount (thumbnails flash to placeholders).
- **If you must modify:** Never add `user` or `currentAccountId` to `loadData`'s useCallback deps. Never conditionally render FunnelFilterBar behind an `isLoading` check. Always clean-build (`rm -rf .next && npm run build`) before pushing.

### 7. Creative Studio Video Playback (`components/creative-studio/media-gallery-card.tsx`)
- Mobile: IntersectionObserver (0.6 threshold) triggers play/pause on scroll
- Desktop: hover-to-play via `onHoverStart`/`onHoverEnd`
- Touch detection: `ontouchstart in window || navigator.maxTouchPoints > 0`
- Video source URLs fetched on-demand (hover on desktop, scroll-into-view on mobile)
- **Why fragile:** Bulk-fetching video sources will hit Meta API rate limits. The on-demand pattern is intentional.
- **If you must modify:** Never prefetch all video sources at once. Keep the IntersectionObserver threshold at 0.6 (lower = too many concurrent plays).

### 8. Active Ads Video Resolution (`app/api/creative-studio/active-ads/route.ts`)
**DO NOT modify the media resolution logic without understanding this completely.**

**Account ID formats are DIFFERENT between tables:**
| Table | Format | Example |
|-------|--------|---------|
| `ad_data` | WITH prefix | `act_719655752315840` |
| `media_library` | WITHOUT prefix | `719655752315840` |

The API uses `cleanAccountId = adAccountId.replace(/^act_/, '')` for media_library queries.

**Storage URL Resolution Waterfall (order matters):**
1. `media_hash` lookup in `media_library`
2. `creative_id` fallback (if original media_hash exists in media_library)
3. `ad.storage_url` from `ad_data` (populated by download-media process)
4. `video_id` fallback from other ad_data rows with same video_id

**Why derivatives break:** Meta assigns different `media_hash` per ad placement. Only the "original" is in `media_library`. Derivatives need the fallback chain.

**The `media_library` table does NOT have a `video_id` column.** Do NOT add `video_id` to any media_library SELECT query — it will cause error 42703 (undefined column) and return 0 rows, breaking ALL video resolution.

**If Active Ads videos stop playing:**
1. Check server logs for `error: { code: '42703'` — means invalid column in query
2. Verify `cleanAccountId` is being used for media_library (not `adAccountId`)
3. Check that `videoIdToStorageUrl` fallback map is being built from ad_data
4. Ensure the enrichment uses `resolvedStorageUrl` which includes all fallbacks

**Related files that must stay in sync:**
- `app/api/creative-studio/active-ads/route.ts` — resolution logic
- `app/api/creative-studio/media/route.ts` — uses same account ID stripping
- `app/api/creative-studio/download-media/route.ts` — pushes storage_url to ad_data
- `app/dashboard/creative-studio/active/page.tsx` — `resolveMedia()` function
- `components/creative-studio/media-gallery-card.tsx` — renders video with storageUrl

### 9. Veo 3.1 Video Generation (`app/api/creative-studio/generate-video/route.ts`)
- Two quality tiers: `veo-3.1-fast-generate-preview` (standard/720p, 20cr) and `veo-3.1-generate-preview` (premium/1080p, 50cr)
- Job IDs stored with `veo:` prefix in legacy `sora_job_id` column. Extensions use `veoext:` prefix.
- **Why fragile:** The prefix pattern (`veo:`, `veoext:`) is used by video-status polling to identify job types. Changing it breaks all in-progress job polling.
- **If you must modify:** Keep prefix patterns. Test both quality tiers and extension flows end-to-end.

### 10. Veo Extension Chain (`generate-video/route.ts` + `video-status/route.ts`)
- Extensions must be submitted sequentially (each extends the previous segment's output)
- Valid durations: 8, 15, 22, 29 only — `snapToVeoDuration()` enforces this
- Each extension prompt gets "Continue from previous shot. " prepended
- **Why fragile:** Submitting extensions in parallel or out of order produces corrupted video. Changing duration snapping breaks the segmentation math.
- **If you must modify:** Never parallelize extension submissions. Never change the 8/15/22/29 snap values. Keep "Continue from previous shot" prefix.

### 11. Prompts Library (`lib/prompts/`)
- All AI prompts centralized here with `INTEGRITY.sha256` hash file
- Prompt changes affect ALL generation flows (image gen, video concepts, scripts, overlays, analysis)
- **Why fragile:** A prompt change can subtly degrade output quality across multiple features. The integrity hash tracks unauthorized modifications.
- **If you must modify:** Test the specific generation flow end-to-end. Never add block headers (`[Scene]`, `[Subject]`) back to video prompts — they confuse Veo.

### Signs You Broke Something
- "Error code 17" or "Rate limit exceeded" from Meta
- Sync takes 5+ minutes
- Campaign manager page hangs or shows spinner indefinitely
- Thumbnails are small/blurry (64x64) — check `thumbnail_width` param or API version
- Videos don't play on click — check API version or missing `videoSource` in creative response
- Creative Studio: filter pills flash between grid/row on mobile — check `isLoading` conditionals
- Creative Studio: video thumbnails flash to placeholders — check `loadData` deps for context objects
- **Active Ads: SOME videos play, others show blurry thumbnails** — check active-ads API for invalid column in media_library query (error 42703), or account ID format mismatch
- **Active Ads: NO videos play** — media_library query is failing completely. Check for Supabase error in logs, verify `cleanAccountId` is used (not `adAccountId`)

---

## Security Notes

### Signup Trigger Chain (Fixed Dec 2025)
Critical: `auth.users → handle_new_user() → profiles → create_default_workspace() → workspaces`
- Both functions MUST have `SECURITY DEFINER` to bypass RLS
- If either is missing, ALL signups break with "Database error saving new user"

### Pixel RLS (Fixed)
- `pixel_status` table had dangerous "anyone can upsert" policy
- Fixed with proper user-scoped policies + service role access

---

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
META_APP_ID=...
META_APP_SECRET=...
NEXT_PUBLIC_META_APP_ID=...
ANTHROPIC_API_KEY=...

# Feature Flags
NEXT_PUBLIC_FF_GOOGLE_ADS=true

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...

# Ad Studio (Competitor Research + Image Generation)
SCRAPECREATORS_API_KEY=...          # ScrapeCreators Facebook Ad Library API
GOOGLE_GEMINI_API_KEY=...           # Gemini 3 Pro (image editing) + Gemini 2.5 Flash (image gen + text detection) + Veo 3.1 (video gen + extensions)

# Video Generation + AI Tools
OPENAI_API_KEY=...                  # GPT 5.2 (scene planning) + Whisper transcription + TTS voiceover
```

---

## Custom Tailwind Colors

Defined in `tailwind.config.ts`:
- Verdict: `verdict-scale` (green), `verdict-watch` (yellow), `verdict-kill` (red), `verdict-learn` (gray)
- Hierarchy: `hierarchy-campaign` (blue), `hierarchy-adset` (purple)
- Theme: `bg-dark`, `bg-sidebar`, `bg-card`, `bg-hover`

---

## Plan Files Reference

Global plan files are in `~/.claude/plans/`. **Note:** This directory contains plans for both KillScale and Oppzilla projects.

### Active / In Progress (January 2026)

| Plan | Topic | Status |
|------|-------|--------|
| `gleaming-questing-crane.md` | Pixel + Shopify JOIN Model | IN PROGRESS |
| `toasty-nibbling-kitten.md` | Workspace-Centric Architecture | IN PROGRESS |
| `linked-bubbling-wilkes.md` | Multi-Mode Attribution (E-com/Lead Gen) | IN PROGRESS |
| `nested-meandering-spring.md` | First-Party Tracking & CAPI | PLANNED |

### Recently Completed (Dec 2025 - Feb 2026)

| Plan | Topic | Date |
|------|-------|------|
| Image Gen Prompt Fix | buildTextOnlyPrompt ignoring imagePrompt | Feb 23 |
| Ad Studio Open Prompt | Direct prompt → image/video, scene planning, style overhaul | Feb 22 |
| AI Image Editor | Gemini 3 Pro editing, text detection, version history | Feb 21 |
| `silly-floating-cosmos.md` | AI Tasks: Remove Generation, Add Studio Navigation | Feb 22 |
| `warm-petting-harbor.md` | Video Studio Inline Generation + Prompt Diversity | Feb 12 |
| AI Video Generation | Veo 3.1 video gen, credits, overlays, compositions | Feb 10 |
| Launch Wizard Hydration Fix | Timezone, budget conversion, review status filtering | Feb 06 |
| `prancy-moseying-pancake.md` | Ad Studio: ScrapeCreators + Gemini Image Generation | Feb 05 |
| `nested-beaming-pearl.md` | Creative Studio Mobile View + Stability + Scroll-to-Play | Feb 01 |
| `unified-dashboard-merge.md` | Unified Dashboard: Campaign Manager Merged | Jan 26 |
| `eager-hatching-minsky.md` | Creative Thumbnails in Performance Table | Jan 25 |
| Sidebar Platform Badges | M/G badges for Meta/Google accounts | Jan 25 |
| Settings Alert Preferences Fix | Column name mismatch fix | Jan 25 |
| Attribution Models Simplified | Removed multi-touch, kept First/Last Touch only | Jan 24 |
| UTM Sync / Trends / Dashboard Defaults | Various UX improvements | Jan 24 |
| `robust-dazzling-fox.md` | UpPromote Integration (True ROAS) | Jan 07 |
| `concurrent-tinkering-dusk.md` | Shopify Integration + Bug Fixes | Jan 02 |
| `cozy-humming-kazoo.md` | Priority Merge Bug Fix | Jan 01 |
| `shimmering-honking-salamander.md` | Manual Events Integration | Dec 31 |
| `synthetic-sleeping-hejlsberg.md` | Meta Sync Rate Limits Fix | Dec 30 |
| `cosmic-growing-koala.md` | Light Mode Polish | Dec 29 |
| `shiny-munching-locket.md` | Budget Display Bug (100x) Fix | Dec 26 |
| `sprightly-hopping-quill.md` | Duplicate Ad Set + Age Targeting | Dec 25 |
| `shiny-puzzling-papert.md` | Google OAuth Fix | Dec 24 |

### Core Feature Plans (Completed)

| Plan | Topic |
|------|-------|
| `abstract-cuddling-anchor.md` | Google Ads Integration |
| `melodic-weaving-kahn.md` | Starred Ads / Performance Sets |
| `eventual-swimming-tide.md` | Campaign Creation Wizard |
| `iterative-wandering-finch.md` | Attribution Pixel Security |
| `glowing-roaming-lemur.md` | Google Ads Comprehensive Plan |
| `vast-wondering-honey.md` | Landing Page + Blog Content |

---

## Session Context Files

Check `.claude/context/` for session handoff notes with specific implementation details.

Current context files:
- `shopify-revenue-session.md` - Shopify as source of truth implementation details
