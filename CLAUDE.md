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

### Custom Attribution Pixel (Priority: Medium - Paused)

**Goal:** Independent tracking pixel for Shopify stores since Meta's pixel is unreliable.

**Status:** Paused - waiting for user to share their design

**Key Considerations:**
- First-party cookie tracking (browser restrictions)
- Shopify app integration
- Server-side vs client-side tracking
- GDPR/CCPA compliance
- Attribution models (first-touch, last-touch, multi-touch)
