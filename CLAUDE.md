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

## Architecture

### Monorepo Structure
- `killscale-app/` - Main Next.js application
- `killscale-landing/` - Static landing page (index.html)
- `meta-integration-files/` - Reference docs for Meta API integration

### Important Files

**Dashboard & Tables:**
- `app/dashboard/page.tsx` - Main dashboard with stats, filters, date picker
- `components/performance-table.tsx` - Campaign/adset/ad hierarchy table with CBO/ABO detection

**API Routes - Meta:**
- `app/api/meta/sync/route.ts` - Syncs data from Meta Marketing API (two-step: discovery + date-filtered)
- `app/api/meta/update-status/route.ts` - Pause/resume campaigns, adsets, ads
- `app/api/meta/update-budget/route.ts` - Edit budgets via Meta API
- `app/api/meta/create-campaign/route.ts` - Create campaigns via Meta API
- `app/api/alerts/` - Alert generation and settings

**API Routes - Workspaces:**
- `app/api/workspace/route.ts` - Workspace CRUD
- `app/api/workspace/members/route.ts` - Member management
- `app/api/workspace/invite/route.ts` - Send invites
- `app/api/workspace/invite/accept/route.ts` - Accept invites
- `app/api/workspace/active-hierarchy/route.ts` - Campaign > Ad Set > Ad tree (ACTIVE only)

**API Routes - Pixel & Events:**
- `app/api/pixel/events/route.ts` - Receive pixel events
- `app/api/pixel/events/manual/route.ts` - Log manual/offline events
- `app/api/kiosk/settings/route.ts` - Kiosk configuration
- `app/api/kiosk/data/route.ts` - Kiosk active ads data

**Settings & Config:**
- `app/dashboard/settings/page.tsx` - Rules configuration per account
- `app/dashboard/settings/workspaces/page.tsx` - Workspace management
- `app/dashboard/settings/pixel/page.tsx` - Pixel setup & manual event logging
- `app/dashboard/alerts/page.tsx` - Alert management per account
- `app/dashboard/trends/page.tsx` - Performance trends and charts

**Public Pages:**
- `app/kiosk/[slug]/page.tsx` - Sales kiosk for walk-in attribution
- `app/invite/[token]/page.tsx` - Workspace invite acceptance

**Core Logic:**
- `lib/supabase.ts` - DB clients + TypeScript types + verdict calculation
- `lib/auth.tsx` - AuthContext & useAuth hook
- `lib/subscription.tsx` - SubscriptionContext & useSubscription hook
- `components/launch-wizard.tsx` - Campaign creation wizard

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

**Core:**
- `profiles` - User profiles, linked to auth.users
- `subscriptions` - User subscription status (plan, Stripe IDs)
- `meta_connections` - OAuth tokens and ad account list

**Workspaces (multi-tenant):**
- `workspaces` - Virtual containers for businesses (each user gets default "My Business")
- `workspace_accounts` - Links ad accounts to workspaces
- `workspace_rules` - ROAS/CPR thresholds per workspace
- `workspace_pixels` - One tracking pixel per workspace (KS-XXXXXXX format)
- `workspace_members` - Team members with roles (owner/admin/member/viewer)
- `workspace_invites` - Pending invitations with tokens

**Performance:**
- `ad_data` - Raw ad performance data with status and budget fields
- `pixel_events` - Events tracked by KillScale pixel (purchases, leads, manual events)

**Legacy (being migrated to workspace-scoped):**
- `rules` - ROAS thresholds, scoped by `ad_account_id`
- `alerts` - Generated alerts, scoped by `ad_account_id`
- `alert_settings` - Alert preferences per account

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

## Implemented Features

### Workspaces System

Multi-tenant workspace architecture allowing users to organize ad accounts by business/client.

**Key concepts:**
- Every user gets a default "My Business" workspace on signup (via trigger)
- Pro+ users can create additional workspaces
- Ad accounts are linked to workspaces, not directly to users
- Rules, pixels, and settings are workspace-scoped

**Files:**
- `app/dashboard/settings/workspaces/page.tsx` - Workspace management UI
- `app/api/workspace/` - Workspace CRUD APIs
- `supabase/migrations/015_workspaces.sql` - Schema

### Workspace Members & Invites

Team collaboration with role-based access.

**Roles:**
- `owner` - Full access, can delete workspace
- `admin` - Can manage members and settings
- `member` - Can view and take actions on ads
- `viewer` - Read-only access

**Invite flow:**
1. Owner/admin sends invite via email
2. Invite stored in `workspace_invites` with unique token
3. Recipient clicks link → `/invite/[token]` page
4. If new user: signup flow, then auto-added to workspace
5. If existing user: directly added to workspace

**Files:**
- `app/invite/[token]/page.tsx` - Invite acceptance page
- `app/api/workspace/invite/route.ts` - Send invites
- `app/api/workspace/invite/accept/route.ts` - Accept invites
- `app/api/workspace/members/route.ts` - Manage members

### KillScale Pixel & Attribution

First-party tracking pixel for attribution independent of Meta's pixel.

**Pixel format:** `KS-XXXXXXX` (7 random chars)

**Attribution logic:**
- Pixel fires on page load with UTM params
- `utm_content` contains ad_id for attribution
- Events (purchases, leads) attributed to the ad that drove the visit
- Attribution window configurable (default 7 days)

**Files:**
- `app/dashboard/settings/pixel/page.tsx` - Pixel settings & code snippet
- `app/api/pixel/events/route.ts` - Receive pixel events
- `app/api/pixel/attribution/route.ts` - Query attributed conversions

### Manual Events System

Log offline conversions (walk-ins, phone sales, manual leads) and attribute to ads.

**Key concepts:**
- Events are discrete results - you can't split a "result" across multiple ads
- Each event is attributed to ONE ad (or unattributed if source unknown)
- Event types: purchase, lead, signup, or custom
- Uses hierarchical ad picker: Campaign → Ad Set → Ad

**Hierarchical Ad Picker:**
- Only shows ACTIVE items (ad, adset, AND campaign must all be ACTIVE)
- Collapsible tree: expand campaign → see adsets → expand adset → see ads
- Sorted by spend (highest first)
- Used in both Pixel Settings modal and Kiosk

**Files:**
- `app/api/pixel/events/manual/route.ts` - Log manual events
- `app/api/workspace/active-hierarchy/route.ts` - Fetch Campaign > Ad Set > Ad tree

### Sales Kiosk

Public-facing page for in-store staff to log walk-in sales with ad attribution.

**URL:** `/kiosk/[workspace-slug]`

**Features:**
- No login required (public page)
- Shows workspace name and business context
- Same hierarchical ad picker as dashboard
- Quick-log common event types
- Mobile-optimized for tablet/phone use

**Files:**
- `app/kiosk/[slug]/page.tsx` - Kiosk UI
- `app/api/kiosk/settings/route.ts` - Fetch kiosk config by slug
- `app/api/kiosk/data/route.ts` - Fetch active ads for kiosk

### Campaign Launcher

Create Meta campaigns directly from KillScale without touching Ads Manager.

**Implemented:**
- Multi-step wizard: Account → Budget Type → Details → Targeting → Creative → Copy → Review
- CBO "Andromeda Recommended" vs ABO "Legacy" selection
- ABO option to add to existing campaign
- Facebook Page selection
- Special Ad Categories (Housing/Credit/Employment)
- Location targeting (city + radius for local businesses)
- Creative enhancements toggle (KillScale Recommended = off, Meta Advantage+ = on)
- Image/video upload to Meta
- Campaign created as PAUSED for review

**In Progress:** Lead Generation objective (need lead form selection)

**Files:**
- `app/dashboard/launch/page.tsx` - Launch hub page
- `components/launch-wizard.tsx` - Multi-step wizard
- `app/api/meta/create-campaign/route.ts` - Create campaign via Meta API
- `app/api/meta/upload-creative/route.ts` - Upload images/videos
- `app/api/meta/pages/route.ts` - Fetch Facebook Pages
- `app/api/meta/campaigns/route.ts` - Fetch existing campaigns (for ABO)
- `app/api/meta/locations/route.ts` - Search cities for targeting

### Landing Page

Static landing page with outcome-focused messaging.

**Implemented:**
- Outcome headline: "Stop Wasting Ad Spend. Start Scaling What Works."
- Video walkthrough (Supabase Storage) replacing static screenshot
- Results section with 3 outcome cards
- Features with outcome-focused headlines
- Email confirmation success page at `/auth/confirm`

**Files:**
- `killscale-landing/index.html` - Main landing page

---

## Current Work / In Progress

### Lead Generation for Campaign Launcher

**Problem:** Lead generation objective is broken - campaigns created without forms attached.

**Solution:**
1. Add `/api/meta/lead-forms/route.ts` - Fetch Instant Forms from Page
2. Add lead form selection step to wizard
3. Update `create-campaign/route.ts` with `promoted_object` for leads
4. Click-to-Call CTA support

**Plan file:** `~/.claude/plans/snug-roaming-seal.md`

---

## Security Notes / Past Issues

### Pixel RLS (Fixed)
- `pixel_status` table had dangerous "anyone can upsert" policy
- Fixed with proper user-scoped policies + service role access

### Signup Trigger Chain (Fixed Dec 2024)
Critical trigger chain: `auth.users → handle_new_user() → profiles → create_default_workspace() → workspaces`
- Both functions MUST have `SECURITY DEFINER` to bypass RLS
- If either function is missing or lacks proper permissions, ALL signups break
- Symptom: "Database error saving new user"

### Pixel Security Punch List
Some items from `~/.claude/plans/iterative-wandering-finch.md` may still need attention:
- Add authentication to `/api/pixel/events` and `/api/pixel/attribution` (require userId)
- Add pixel_secret validation to event ingestion
- Add rate limiting and deduplication to event ingestion

---

## Future Enhancements

### Live Ad Preview in Launch Wizard (Priority: High)

**Goal:** Show real-time ad preview while building ads in the Launch Wizard.

**Two-part system:**
1. **Live Mock Preview** - Custom component renders realistic FB/IG ad mockup as user types (zero latency)
2. **Real Meta Previews** - "Preview on Meta" button fetches actual iframe previews

**Plan file:** `~/.claude/plans/bubbly-greeting-wombat.md`

### Ad Creative Preview (Priority: Medium)

**Goal:** Click an ad in the performance table to see its creative (image/video thumbnail) in a modal.

**Considerations:**
- Start with thumbnails (video playback requires HLS streaming)
- Cache creatives in Supabase to reduce API calls
- Handle dynamic creatives and carousels

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

---

## Holy Shit Features (Priority: Critical)

The missing emotional element: **Urgency. Fear. Regret.**

The user needs to feel: *"Every day I'm NOT using this is costing me money."*

---

### 1. The Bleed Counter (Priority: Critical)

**Goal:** Show users the real cost of their inaction on KILL ads.

Every KILL ad shows a running "bleed" number:
```
🔴 KILL
Bleeding: $847 total ($23/day)
Since: Nov 22 (17 days)
```

**Holy Shit Moment:** First sync, first thing they see:
```
"You have 4 ads actively bleeding $127/day. That's $3,810/month."
```

**Data Requirements:**
- `verdict_changed_at` - When did this ad cross into KILL?
- Daily spend tracking since verdict change
- Bleed calculation: spend accumulated since verdict = KILL

---

### 2. The Opportunity Cost Calculator (Priority: Critical)

**Goal:** Show users the money they're leaving on the table by not scaling winners.

Every SCALE ad that hasn't been touched:
```
🟢 SCALE
ROAS: 4.2x
Budget: $50/day (unchanged 14 days)
💰 Missed opportunity: ~$2,100
   (if scaled 20% every 3 days)
```

**Data Requirements:**
- `last_action_at` - When did user last touch this ad?
- Projected revenue if scaled at safe rate (20% every 3 days)
- Budget change history (already have from Andromeda-safe scaling)

---

### 3. The Action Center Dashboard (Priority: Critical)

**Goal:** Replace "here's your data" with "here's what to do + instant insights into where you're losing/leaving money."

**Current:** Data dashboard with verdicts
**Better:** Action-first view that creates holy shit moments on every login

```
┌─────────────────────────────────────────────────────────────────────────┐
│  💸 YOUR MONEY SNAPSHOT                                    Dec 10, 2024 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  BLEEDING   │  │  LEFT ON    │  │   TOTAL     │  │   ROAS      │    │
│  │   $127/day  │  │   TABLE     │  │   SPEND     │  │   TODAY     │    │
│  │  $3.8k/mo   │  │   $2,100    │  │   $4,230    │  │    2.4x     │    │
│  │  4 KILL ads │  │  2 SCALE    │  │   7 days    │  │  vs 2.1 avg │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  🧠 ANDROMEDA SCORE: 72/100 "Needs Work"              [ View Audit → ] │
│  └ 3 critical issues found                                             │
├─────────────────────────────────────────────────────────────────────────┤
│  🔴 KILL NOW (3)                                         -$127/day     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ☐ Summer Sale - Image 3       $45/day bleeding    14 days      │   │
│  │ ☐ Holiday Promo - Video 2     $52/day bleeding    8 days       │   │
│  │ ☐ Retargeting - Carousel      $30/day bleeding    21 days      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    [ Kill Selected ]  [ Kill All ]     │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  🟢 READY TO SCALE (2)                               +$89/day est      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ☐ Winner Ad - UGC Video       4.2x ROAS   $50/day → $60 (+20%) │   │
│  │ ☐ Best Performer - Static     3.8x ROAS   $75/day → $90 (+20%) │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                  [ Scale Selected ]  [ Scale All 20% ] │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  👀 WATCH LIST (4)                                      Monitoring...  │
│  │ 4 ads hovering near thresholds                        [ Expand ▼ ] │
├─────────────────────────────────────────────────────────────────────────┤
│  📚 LEARNING (6)                                        $340 to go     │
│  │ 6 ads still gathering data                            [ Expand ▼ ] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  📊 TRENDS THIS WEEK                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [Mini sparkline: ROAS trend]                                   │   │
│  │  Mon: 2.1x  Tue: 2.3x  Wed: 2.0x  Thu: 2.4x  Fri: 2.6x         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ⚡ RECENT ACTIVITY                                                     │
│  │ • You killed "Bad Ad" 2 days ago - saved $90 so far                 │
│  │ • You scaled "Winner" 5 days ago - earned +$340 since               │
│  │ • "Watch Ad" dropped from SCALE → WATCH yesterday                   │
│                                                          [ View All ]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [View Full Performance Table →]                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Sections:**

| Section | Purpose |
|---------|---------|
| **Money Snapshot** | 4 key metrics: Bleeding, Left on Table, Total Spend, Current ROAS |
| **Andromeda Score** | Quick score + link to full audit |
| **Kill Now** | Expandable list with checkboxes, bulk kill, shows bleed/day |
| **Ready to Scale** | Expandable list with checkboxes, bulk scale 20%, shows opportunity |
| **Watch List** | Collapsed by default, count + "monitoring" |
| **Learning** | Collapsed, shows "$ to go" until verdict threshold |
| **Trends This Week** | Mini sparkline showing ROAS trajectory |
| **Recent Activity** | Feed showing actions taken + money saved/earned |
| **Link to Full Table** | For power users who want the data view |

**Key Insight:** Not "here's your data." It's "here's what's costing you, here's what to do about it, with one button."

**Implementation:**
- New route: `app/dashboard/action-center/page.tsx` (or replace main dashboard)
- New component: `components/action-center.tsx`
- Bulk actions with confirmation modals
- Integrates Andromeda Score, Bleed Counter, Opportunity Calculator

---

### 4. The Weekly Guilt Email (Priority: High)

**Goal:** Make NOT logging in feel expensive.

Every Monday:
```
Subject: Last week cost you $892

You had 3 KILL ads that ran all week: -$612
You had 2 SCALE ads you didn't touch: -$280 opportunity

Total cost of inaction: $892

[Open KillScale]
```

**Implementation:**
- Scheduled job (Supabase Edge Function or Vercel Cron)
- Track weekly bleed + opportunity costs
- Email via Resend/SendGrid

---

### 5. Push Notifications That Matter (Priority: Medium)

**Goal:** Money-focused alerts, not status updates.

Examples:
- 🔴 "Top performer just dropped below WATCH. Take a look."
- 🟢 "Winner alert: Summer Ad hit 5.1x ROAS. Ready to scale."
- 💸 "Your KILL list bled $45 today."

Not "here's an update." It's "here's money moving."

---

### 6. The Hindsight Report (Priority: Medium)

**Goal:** Monthly accountability showing the real cost of delay.

Monthly email:
```
If you had acted on every KILL within 24 hours: Saved $2,340
If you had scaled every SCALE on schedule: +$4,200 revenue

Cost of delay: $6,540
```

---

## Architectural Requirements for Holy Shit Features

### New Data to Track

| Field | Purpose |
|-------|---------|
| `verdict_changed_at` | When did this ad cross into KILL/SCALE? |
| `last_action_at` | When did user last touch this ad? |
| Daily snapshots | Spend/revenue for bleed/opportunity calcs |

### New Calculations

| Metric | Formula |
|--------|---------|
| Bleed | Spend accumulated since verdict = KILL |
| Opportunity | Projected revenue if scaled at safe rate since verdict = SCALE |

### New Surfaces

1. Action Dashboard (the "do this now" view)
2. Bleed counter on KILL badges
3. Opportunity counter on SCALE badges
4. Weekly email digest
5. Push notifications

---

## The One-Liner Test

**Current:** "Know what to scale, watch, and kill in 30 seconds."

**Better options:**
- "Stop bleeding money on bad ads. Stop leaving money on winners."
- "KillScale shows you what your inaction costs. Every day."

---

## Andromeda Optimization Score (Priority: Critical)

**Goal:** Audit account structure against Meta's Andromeda ML best practices. No other tool does this.

**The Problem:** Users fragment their accounts - too many campaigns, too many ad sets, 1 creative per ad set, ABO instead of CBO. Andromeda can't optimize fragmented accounts.

**The Insight:** "Your account structure is sabotaging Meta's algorithm."

---

### Andromeda Best Practices (What We Audit)

| Rule | Why It Matters |
|------|----------------|
| Consolidation over fragmentation | Fewer campaigns/ad sets = more data per entity |
| CBO over ABO | Let Meta allocate budget across ad sets |
| Broad targeting | Small audiences fragment learning |
| 50+ conversions/week/ad set | The learning phase threshold |
| 15-25% budget changes max | Prevents algorithm destabilization |
| Multiple creatives per ad set | Don't split creatives into separate ad sets |

---

### Anti-Patterns We Detect

| Anti-Pattern | Detection Method | Recommendation |
|--------------|------------------|----------------|
| Too many campaigns | Count active campaigns | "You have 12 active campaigns. Consolidate to 2-3." |
| ABO instead of CBO | `campaign_budget_optimization` field | "3 campaigns using ABO. Switch to CBO." |
| 1 ad per ad set | Count ads per ad set | "8 ad sets with only 1 ad. Consolidate creatives." |
| Too many ad sets | Count ad sets per campaign | "Campaign X has 15 ad sets. Aim for 3-5 max." |
| Stuck in learning | Results per ad set per week | "4 ad sets below 50 conversions/week." |
| Audience fragmentation | Audience size / overlap | "Multiple ad sets targeting similar audiences." |

---

### Score Card UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🧠 ANDROMEDA OPTIMIZATION SCORE                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                        72 / 100                                         │
│                    ████████████░░░░                                     │
│                      "Needs Work"                                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ✅ PASSING                                                             │
│  • Using CBO on 4/5 campaigns                                          │
│  • Budget changes within safe range                                     │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ⚠️ WARNINGS                                                            │
│  • 3 ad sets with only 1 creative each                    [ Fix → ]    │
│    "Consolidate into fewer ad sets with 3-5 creatives"                 │
│                                                                         │
│  • 2 ad sets below 50 conversions/week                    [ Fix → ]    │
│    "Consider pausing or merging - stuck in learning"                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  🔴 CRITICAL                                                            │
│  • Campaign "Holiday Sale" has 12 ad sets                 [ Fix → ]    │
│    "Too fragmented. Consolidate to 3-4 ad sets max."                   │
│                                                                         │
│  • 1 campaign using ABO with $500/day budget              [ Fix → ]    │
│    "Switch to CBO to let Meta optimize allocation"                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Score Weighting

| Factor | Weight | Scoring Logic |
|--------|--------|---------------|
| CBO adoption | 25% | % of spend on CBO campaigns |
| Creative consolidation | 25% | Avg ads per ad set (target: 3-6) |
| Ad set count per campaign | 20% | Penalty for >5 ad sets per campaign |
| Learning phase exits | 20% | % of ad sets hitting 50 conv/week |
| Budget stability | 10% | No aggressive scaling (from budget_changes) |

**Score Ranges:**
- 90-100: "Excellent" - Andromeda-optimized
- 70-89: "Good" - Minor improvements possible
- 50-69: "Needs Work" - Significant issues
- 0-49: "Critical" - Account structure hurting performance

---

### Data Requirements

**Already Have:**
- Campaign count, ad set count, ad count
- CBO vs ABO detection
- Budget info and change history
- Results/conversions per entity

**Need to Add:**
- `targeting` field from ad sets (for audience overlap detection)
- Weekly conversion aggregation per ad set
- Audience size estimates

**API Fields to Fetch:**
```
GET /{adset_id}?fields=targeting,optimization_goal,daily_budget,lifetime_budget
```

---

### Implementation

**New Files:**
- `lib/andromeda-score.ts` - Score calculation logic
- `components/andromeda-score-card.tsx` - The score card UI component

**Integration:**
- Calculate score on sync completion
- Store in new `andromeda_scores` table or as JSON in `ad_accounts`
- Display on Action Center dashboard
- "Fix →" buttons open relevant Ads Manager deep links

**Database:**
```sql
CREATE TABLE andromeda_audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  factors JSONB NOT NULL,  -- Breakdown of each factor
  issues JSONB NOT NULL,   -- Array of detected issues
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_andromeda_audits_account ON andromeda_audits(ad_account_id, created_at DESC);
```

---

### Future Enhancements

- **Score history** - Track improvement over time
- **Automated fix suggestions** - "Merge these 3 ad sets" with one click
- **Competitor benchmarks** - "Your score is higher than 65% of accounts"
- **Alerts** - "Your Andromeda score dropped 15 points this week"
