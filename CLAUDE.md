# KillScale - Claude Code Context

## Project Overview

KillScale is a SaaS app for Meta Ads advertisers. Users connect via Meta API (or upload CSV exports) and get instant verdicts (Scale/Watch/Kill/Learn) based on ROAS thresholds.

**Live URLs:** Landing at killscale.com, App at app.killscale.com

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

## Key Conventions

- Ask before performing git commits
- Rules and alerts are scoped per ad account (not global per user)
- Mobile-first responsive design using Tailwind's `lg:` breakpoint

## Architecture

### Monorepo Structure
- `killscale-app/` - Main Next.js application
- `killscale-landing/` - Static landing page (index.html)
- `meta-integration-files/` - Reference docs for Meta API integration

### Important Files

**Dashboard & Tables:**
- `app/dashboard/page.tsx` - Main dashboard with stats, filters, date picker
- `components/performance-table.tsx` - Campaign/adset/ad hierarchy table with CBO/ABO detection

**API Routes:**
- `app/api/meta/sync/route.ts` - Syncs data from Meta Marketing API (two-step: discovery + date-filtered)
- `app/api/meta/update-status/route.ts` - Pause/resume campaigns, adsets, ads
- `app/api/meta/update-budget/route.ts` - Edit budgets via Meta API
- `app/api/alerts/` - Alert generation and settings

**Settings & Config:**
- `app/dashboard/settings/page.tsx` - Rules configuration per account
- `app/dashboard/alerts/page.tsx` - Alert management per account
- `app/dashboard/trends/page.tsx` - Performance trends and charts

**Core Logic:**
- `lib/supabase.ts` - DB clients + TypeScript types + verdict calculation
- `lib/auth.tsx` - AuthContext & useAuth hook
- `lib/subscription.tsx` - SubscriptionContext & useSubscription hook

## Verdict Logic

Verdicts are calculated in `lib/supabase.ts:calculateVerdict()`:
```
spend < learning_spend → LEARN
roas >= scale_roas → SCALE
roas >= min_roas → WATCH
else → KILL
```

Default thresholds: scale_roas=3.0, min_roas=1.5, learning_spend=$100

### Verdict Display (CBO vs ABO)

Verdict badges only show where the budget lives:
- **CBO campaigns:** Verdict badge at campaign level only
- **ABO ad sets:** Verdict badge at adset level only
- **Ads:** Show performance arrows (up/down) instead of verdict text

## Database

Supabase PostgreSQL. Key tables:
- `ad_data` - Raw ad performance data with status and budget fields
- `rules` - ROAS thresholds, scoped by `ad_account_id`
- `alerts` - Generated alerts, scoped by `ad_account_id`
- `alert_settings` - Alert preferences per account
- `meta_connections` - OAuth tokens and ad account list
- `subscriptions` - User subscription status (plan, Stripe IDs)

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
```

## Pricing Tiers

- **Free:** Meta API sync, 2 campaigns (auto-selected), 1 ad account
- **Starter ($9/mo):** Meta API sync, 10 campaigns, 1 ad account, custom rules
- **Pro ($29/mo):** Meta API sync, unlimited campaigns, 2 ad accounts, pause/resume, budget editing, alerts
- **Agency ($99/mo):** Unlimited campaigns, unlimited ad accounts, priority support

## Custom Tailwind Colors

Defined in `tailwind.config.ts`:
- Verdict: `verdict-scale` (green), `verdict-watch` (yellow), `verdict-kill` (red), `verdict-learn` (gray)
- Hierarchy: `hierarchy-campaign` (blue), `hierarchy-adset` (purple)
- Theme: `bg-dark`, `bg-sidebar`, `bg-card`, `bg-hover`

---

## Future Enhancements

### Ad Creative Preview (Priority: Medium)

**Goal:** Click an ad in the performance table to see its creative (image/video thumbnail) in a modal.

**Implementation Plan:**
1. New API endpoint `/api/meta/creative/route.ts` to fetch creative data
2. Modal component `components/creative-preview-modal.tsx`
3. Make ad rows clickable in performance table

**API Fields:** `thumbnail_url`, `image_url`, `object_story_spec`, `effective_object_story_id`

**Considerations:**
- Start with thumbnails (video playback requires HLS streaming)
- Cache creatives in Supabase to reduce API calls
- Handle dynamic creatives and carousels

---

### CBO Scaling (Priority: High)

**Goal:** Let users star/bookmark winning ads over time, then combine them into new CBO campaigns via a modal wizard—without touching Ads Manager.

**User Workflow:**
1. Mark ads as "winners" via star icon in performance table (ongoing during daily checks)
2. Click "Build CBO" button when ready to scale
3. Modal wizard: Name campaign → Select starred ads → Pick targeting source → Set budget → Review → Create (paused)

**Database:** New `starred_ads` table to persist stars across syncs (ad_data gets rebuilt on sync)

```sql
CREATE TABLE starred_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  spend DECIMAL(10,2) DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(5,2) DEFAULT 0,
  starred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ad_account_id, ad_id)
);
```

**New API Endpoints:**
- `/api/starred/route.ts` - CRUD for starred ads
- `/api/meta/targeting/route.ts` - Fetch targeting from source ad set
- `/api/meta/creative/route.ts` - Fetch creative specs from source ads
- `/api/meta/create-campaign/route.ts` - Create CBO campaign + ad set + ads

**New Components:**
- `components/star-button.tsx` - Star toggle for ad rows
- `components/scale-builder-modal.tsx` - 5-step wizard modal

**Key Decisions:**
- Star/bookmark system (mark winners during daily workflow, pull from pool later)
- User explicitly picks which ad set's targeting to copy
- Campaigns created as PAUSED so user can review before going live
- Pro+ tier only (requires Meta API write access)

**Meta API Calls:**
```
# Read
GET /{adset_id}?fields=targeting,optimization_goal,billing_event,bid_strategy
GET /{ad_id}?fields=creative{id,name,object_story_spec}

# Write
POST /{ad_account_id}/campaigns (CBO, status=PAUSED)
POST /{ad_account_id}/adsets (with copied targeting)
POST /{ad_account_id}/ads (one per selected creative)
```

**Files to Modify:**
- `components/performance-table.tsx` - Add star button to ad rows
- `app/dashboard/page.tsx` - Starred ads state, Build CBO button, modal
- `lib/supabase.ts` - Add StarredAd type

---

### Results-Based Tracking (Priority: High)

**Goal:** Replace hardcoded "purchases" tracking with generic "results" that adapt to campaign objectives.

**Problem:** Currently KillScale only tracks purchases. If a campaign is optimized for website registrations, leads, or other objectives, those results don't show up.

**Solution:** Use Meta's native "results" concept which automatically maps to whatever the campaign is optimized for.

**Current Model:**
```
Spend → Purchases → Revenue → ROAS → Verdict
```

**New Model:**
```
Spend → Results → Result Value (if applicable) → ROAS or CPR → Verdict
```

**Meta API Details:**
- Every campaign has an `objective` / optimization goal
- The `actions` array returns all actions, but `cost_per_result` and `result` fields auto-map to the campaign's objective
- Purchase campaigns → Results = purchases (has value, use ROAS)
- Lead campaigns → Results = leads (no value, use CPL/CPR)
- Registration campaigns → Results = registrations (no value, use CPR)

**Database Changes:**

| Current Column | New Column | Notes |
|----------------|------------|-------|
| `purchases` | `results` | Integer count of results |
| `revenue` | `result_value` | Nullable - only populated if result has monetary value |
| - | `result_type` | String: "purchase", "lead", "registration", etc. |

**Rules Table Changes:**
- Keep `scale_roas`, `min_roas` for value-based results
- Add `target_cpr`, `max_cpr` for non-value results (Cost Per Result thresholds)

**New Verdict Logic:**
```
if result_value exists (purchases, etc):
    Use ROAS thresholds (scale_roas, min_roas)

if result_value is null (leads, registrations, etc):
    Use CPR thresholds (target_cpr, max_cpr)

if results < minimum threshold:
    LEARN
```

**UI Changes:**
- Show "Results" column instead of "Purchases"
- Show "ROAS" when there's revenue, "Cost/Result" when there isn't
- Display result type label (Lead, Purchase, Registration, etc.)
- Settings page: Add CPR threshold inputs alongside ROAS thresholds

**Benefits:**
- Works for eCommerce (purchases) AND lead-gen (forms, registrations, leads)
- No account-level toggle needed - adapts automatically per campaign
- Solves agency request for lead-gen businesses (roofers, landscapers, etc.)

---

### Andromeda-Safe Scaling (Priority: High)

**Goal:** Help users scale budgets safely without destabilizing Meta's Andromeda algorithm.

**Problem:** Users see SCALE verdict and 3x the budget. Andromeda freaks out, CPMs spike, ROAS tanks. They killed their winner.

**The Rule:** No more than 15-25% budget increase every 2-3 days.

**Solution:** One-tap percentage-based scaling with cooldown tracking.

**Settings/Rules (new field):**
```
scale_percentage DECIMAL(5,2) DEFAULT 20.0
```

User sets their preferred scaling increment once in Settings (default 20%).

**Enhanced Budget Edit Modal:**
```
┌─────────────────────────────────────────────┐
│  Edit Budget                            ✕   │
├─────────────────────────────────────────────┤
│                                             │
│  Campaign: Summer Sale 2024                 │
│  Current Budget: $50.00/day                 │
│                                             │
│  Last changed: Dec 8 (1 day ago)            │
│  ⏳ Recommended wait: 2 more days           │
│                                             │
│  ┌─────────┐           ┌─────────┐          │
│  │  ↓ 20%  │           │  ↑ 20%  │          │
│  │  $40.00 │           │  $60.00 │          │
│  └─────────┘           └─────────┘          │
│                                             │
│  ─────────── OR SET MANUAL ───────────      │
│                                             │
│  New Budget: [$_______]/day                 │
│                                             │
│             [ Cancel ]  [ Apply ]           │
└─────────────────────────────────────────────┘
```

**Cooldown Warning (if scaling before recommended wait):**
```
⚠️ Budget was changed 1 day ago.
   Scaling too fast can destabilize Andromeda.

   [ Wait ] [ Scale Anyway ]
```

**Database: New Table**
```sql
CREATE TABLE budget_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- 'campaign' or 'adset'
  entity_id TEXT NOT NULL,
  old_budget DECIMAL(10,2) NOT NULL,
  new_budget DECIMAL(10,2) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_budget_changes_entity ON budget_changes(entity_type, entity_id);

-- RLS
ALTER TABLE budget_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own budget changes" ON budget_changes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budget changes" ON budget_changes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**Rules Table Addition:**
```sql
ALTER TABLE rules ADD COLUMN scale_percentage DECIMAL(5,2) DEFAULT 20.0;
```

**Logic:**
1. On budget modal open, query `budget_changes` for most recent change to this entity
2. Calculate days since last change
3. Display recommendation: "Wait X more days" (default cooldown: 3 days)
4. If user clicks ↑/↓ before cooldown, show warning but allow override
5. On budget change via KillScale, insert record into `budget_changes`

**Implementation Files:**
- `components/budget-edit-modal.tsx` - Add percentage buttons, cooldown display
- `app/api/meta/update-budget/route.ts` - Log change to `budget_changes` table after successful Meta API call
- `app/dashboard/settings/page.tsx` - Add scale_percentage input

**Future Enhancements:**
- Detect external changes: On sync, compare current budget to last known. If different with no KillScale record, flag "Changed outside KillScale"
- Scaling history view: Show log of all changes with ROAS at time of change
- Pattern detection: "Every time you scale past $100, ROAS drops"

---

### Lead-Gen Mode Enhancements (Priority: Medium - Future)

**Goal:** Additional features for agencies serving local/service businesses.

**Features to consider:**
- Manual lead entry (log a lead, assign to campaign)
- Call tracking integrations (CallRail, CallTrackingMetrics, WhatConverts)
- CRM integrations (GoHighLevel, HubSpot)
- Lead → Closed deal tracking with deal values

---

### Custom Attribution Pixel (Priority: Medium - Paused)

**Goal:** Independent tracking pixel for Shopify stores since Meta's pixel is unreliable.

**Status:** Paused - waiting for user to share their design

**Key Considerations:**
- First-party cookie tracking (browser restrictions)
- Shopify app integration
- Server-side vs client-side tracking
- GDPR/CCPA compliance
- Attribution models (first-touch, last-touch, multi-touch)
