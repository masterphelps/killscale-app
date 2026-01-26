# KillScale - Claude Code Context

## Project Overview

KillScale is a SaaS app for Meta and Google Ads advertisers. Users connect via Meta/Google APIs (or upload CSV exports) and get instant verdicts (Scale/Watch/Kill/Learn) based on ROAS thresholds.

**Live URLs:** Landing at killscale.com, App at app.killscale.com

**Stats (as of Jan 2026):** 45K+ LOC, 67 API endpoints, 35+ React components, 33+ database migrations

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
- **AI:** Claude API (Andromeda AI chat, Health Recommendations)

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

**Tier Access:** Scale + Pro only

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
- Pro+ can create additional workspaces
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

### AI-Powered Features
- **Andromeda AI Chat:** Follow-up questions about account structure audit
- **Health Recommendations:** Claude-powered optimization suggestions with priority ranking

---

## Database

33+ migrations. Key tables:

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

**Views:**
- `creative_star_counts` - Aggregates stars by creative (deduplication)

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

## Recent Fixes (January 2026)

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

## Current Work (January 2026)

### Shopify + Pixel JOIN Model Attribution
Implementing order_id based deduplication to prevent double counting when Meta and pixel attribute same sale to different ads.

**Status:** In progress - API updated, pixel purchase endpoint created, migration ready

**Key files:**
- `app/api/pixel/purchase/route.ts` - Pixel purchase events with order_id (NEW)
- `app/api/shopify/attribution/route.ts` - JOIN query implementation (UPDATED)
- `lib/attribution.tsx` - Added pixelMatchRate to context (UPDATED)
- `supabase/migrations/033_pixel_order_id.sql` - order_id column (NEW)

**Attribution Waterfall (E-commerce):**
1. Shopify UTM (`last_utm_content`) - Primary
2. KillScale Pixel (`utm_content`) - Secondary
3. Meta API - Fallback
4. Unattributed - No ad credit

**Plan files:** `.claude/plans/gleaming-questing-crane.md`, `.claude/plans/concurrent-tinkering-dusk.md`

### Workspace-Centric Architecture
Redesigning so same ad account can show different results in different workspaces based on attribution source.

**Plan file:** `.claude/plans/toasty-nibbling-kitten.md`

---

## Pricing Tiers

- **Launch ($29/mo):** Meta API sync, unlimited campaigns, 1 ad account, Campaign Launcher, Insights, Trends, Alerts
- **Scale ($49/mo):** Everything in Launch + First Party Pixel, Dynamic Attribution, 2 ad accounts, Workspaces, Manual Events
- **Pro ($99/mo):** Everything in Scale + unlimited ad accounts, AI recommendations, priority support

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

### Signs You Broke Something
- "Error code 17" or "Rate limit exceeded" from Meta
- Sync takes 5+ minutes
- Campaign manager page hangs or shows spinner indefinitely

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

### Recently Completed (Dec 2025 - Jan 2026)

| Plan | Topic | Date |
|------|-------|------|
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
