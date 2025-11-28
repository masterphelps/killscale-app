# KillScale - Project Reference

## Quick Summary
KillScale is a SaaS app that helps Meta Ads advertisers quickly identify which ads to scale (keep/increase budget) or kill (turn off). Users upload CSV exports from Meta Ads Manager and get instant verdicts based on ROAS thresholds.

**Live URLs:**
- Landing: https://killscale.com
- App: https://app.killscale.com

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Styling | Tailwind CSS, custom CSS variables |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe (Subscriptions) |
| Hosting | Vercel |
| CSV Parsing | Papaparse |

---

## Project Structure

```
killscale-app/
├── app/
│   ├── layout.tsx          # Root layout with AuthProvider, SubscriptionProvider
│   ├── page.tsx             # Landing redirect
│   ├── login/page.tsx       # Login page
│   ├── signup/page.tsx      # Signup page
│   ├── pricing/page.tsx     # Pricing tiers
│   ├── account/page.tsx     # User account settings
│   ├── dashboard/
│   │   ├── layout.tsx       # Dashboard layout with Sidebar
│   │   ├── page.tsx         # Main dashboard - CSV upload, stats, verdicts
│   │   ├── settings/page.tsx # Rules configuration (ROAS thresholds)
│   │   ├── trends/page.tsx  # Trends (PRO feature - not implemented)
│   │   ├── alerts/page.tsx  # Alerts (PRO feature - not implemented)
│   │   └── connect/page.tsx # Connect Meta account (future)
│   └── api/
│       ├── checkout/route.ts # Stripe checkout session creation
│       └── webhook/route.ts  # Stripe webhook handler
├── components/
│   ├── sidebar.tsx          # Main navigation sidebar
│   ├── stat-card.tsx        # Dashboard stat cards
│   ├── performance-table.tsx # Hierarchical ad performance table
│   └── csv-upload.tsx       # CSV upload modal
├── lib/
│   ├── auth.tsx             # AuthContext, useAuth hook
│   ├── subscription.tsx     # SubscriptionContext, useSubscription hook
│   ├── csv-parser.ts        # Parse Meta Ads CSV exports
│   ├── supabase.ts          # Supabase client, types
│   └── utils.ts             # Formatting helpers (currency, ROAS, etc.)
```

---

## Database Schema (Supabase)

### Table: `subscriptions`
```sql
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT DEFAULT 'free',  -- 'free', 'starter', 'pro', 'agency'
  status TEXT DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can only view their own subscription
CREATE POLICY "Users can view own subscription" ON subscriptions 
  FOR SELECT USING (auth.uid() = user_id);
```

### Table: `ad_data`
```sql
CREATE TABLE ad_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date_start DATE,
  date_end DATE,
  campaign_name TEXT,
  adset_name TEXT,
  ad_name TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can CRUD their own ad data
```

### Table: `rules` (TODO - needs to be created)
```sql
CREATE TABLE rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scale_roas DECIMAL(5,2) DEFAULT 3.0,   -- ROAS >= this = SCALE
  watch_roas DECIMAL(5,2) DEFAULT 1.5,   -- ROAS >= this = WATCH
  min_spend DECIMAL(10,2) DEFAULT 100,   -- Min spend before verdict
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Pricing Tiers

| Plan | Price | Features |
|------|-------|----------|
| Free | $0/mo | CSV upload, 5 campaigns max |
| Starter | $9/mo | CSV upload, unlimited campaigns |
| Pro | $29/mo | Meta API, 5 accounts, daily refresh (COMING SOON) |
| Agency | $99/mo | Meta API, unlimited accounts, hourly refresh (COMING SOON) |

**Stripe Price IDs:**
- Starter: `price_1SYQDFLvvY2iVbuY0njXKK4c`
- Pro: `price_1SYOWOLvvY2iVbuYa0ovAR0G`
- Agency: `price_1SYOWlLvvY2iVbuYgxcY88pk`

---

## Key Flows

### 1. User Signup
```
/signup → Supabase Auth → Email confirmation → /login → /dashboard
```

### 2. CSV Upload
```
Dashboard → Upload CSV → Papaparse parse → Save to ad_data table → Display with verdicts
```

### 3. Verdict Logic
```
For each ad:
  - ROAS = revenue / spend
  - If spend < min_spend → "LEARNING"
  - If ROAS >= scale_roas → "SCALE" (green)
  - If ROAS >= watch_roas → "WATCH" (yellow)
  - Else → "KILL" (red)
```

### 4. Subscription Upgrade
```
/pricing → Click plan → /api/checkout → Stripe Checkout → 
Stripe webhook → Update subscriptions table → User sees new plan
```

---

## Environment Variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Current TODOs

### High Priority
- [ ] **Rules saving** - Settings page doesn't persist to database
- [ ] **Rules applied** - Verdicts use hardcoded thresholds, not user rules
- [ ] Grey out Trends/Alerts with "PRO" badge (done in sidebar)

### Medium Priority
- [ ] Password reset flow
- [ ] Stripe customer portal for subscription management
- [ ] Multiple date range uploads (append vs replace)

### Future (Pro Features)
- [ ] Meta API integration (auto-pull data)
- [ ] Email alerts for underperforming ads
- [ ] Trend analysis over time
- [ ] White-label reports

---

## Brand Assets

**Logo SVG (inline):**
```html
<svg width="180" height="36" viewBox="0 0 280 50">
  <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a"/>
  <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="55" y="33" fill="white" font-family="Inter, sans-serif" font-weight="700" font-size="24">KillScale</text>
</svg>
```

**Colors:**
- Kill/Down: `#ef4444` (red)
- Watch: `#eab308` (yellow)
- Scale/Up: `#10b981` (green)
- Background: `#0a0a0a`
- Card: `#141414`
- Border: `#262626`

---

## Commands

```bash
# Development
cd ~/Projects/killscale-app
npm run dev

# Deploy (auto on git push)
git add . && git commit -m "message" && git push
```

---

## Contact/Resources

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Vercel Dashboard:** https://vercel.com
