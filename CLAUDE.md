# KillScale - Claude Code Context

## Project Overview
KillScale is a SaaS app for Meta Ads advertisers to monitor and manage their ad performance. Built with Next.js 14, Supabase, Stripe, and Tailwind CSS.

## Key Conventions
- Ask before performing git commits
- Rules and alerts are scoped per ad account (not global per user)
- Mobile-first responsive design using Tailwind's `lg:` breakpoint

## Important Files
- `components/performance-table.tsx` - Main dashboard table with campaign/adset/ad hierarchy
- `app/api/meta/sync/route.ts` - Syncs data from Meta Marketing API
- `app/dashboard/settings/page.tsx` - Rules configuration per account
- `app/dashboard/alerts/page.tsx` - Alert management per account
- `lib/supabase.ts` - Verdict calculation logic (SCALE/WATCH/KILL/LEARN)

## Database
- Supabase PostgreSQL
- Key tables: `ad_data`, `rules`, `alerts`, `alert_settings`, `meta_connections`
- Rules and alerts use `ad_account_id` for per-account isolation

---

## Future Enhancements

### Ad Creative Preview (Priority: Medium)
**Goal:** When clicking on an ad in the performance table, display the creative (image/video thumbnail) in a modal.

**Implementation Plan:**
1. **New API endpoint** (`/api/meta/creative/route.ts`):
   ```typescript
   // Fetch creative for an ad
   // GET /{ad-id}?fields=creative
   // GET /{ad-creative-id}?fields=thumbnail_url,image_url,object_story_spec,effective_object_story_id
   ```

2. **Creative Preview Modal** (`components/creative-preview-modal.tsx`):
   - Display image creatives directly
   - Display video thumbnails with play icon overlay
   - Show ad copy/headline from `object_story_spec`
   - Handle carousel ads (multiple images)
   - Loading state while fetching

3. **Performance Table Changes** (`components/performance-table.tsx`):
   - Make ad rows clickable (only ad level, not campaign/adset)
   - Add visual indicator (eye icon or hover state)
   - Open modal on click, pass ad ID

4. **API Fields to request:**
   - `thumbnail_url` - Works for both image and video ads
   - `image_url` - Full resolution image
   - `object_story_spec` - Contains headline, body text, CTA, link
   - `effective_object_story_id` - For dynamic creatives

**Considerations:**
- Video playback would require additional work (HLS streaming, etc.) - start with thumbnails
- Dynamic creatives may not have simple previews
- Rate limiting on Meta API - consider caching creative data
- Some creatives require `ad_account_id` in the request

**Future Extensions:**
- Cache creatives in Supabase to reduce API calls
- Show creative performance metrics alongside preview
- Allow filtering by creative type
- A/B test comparison view between ad creatives

---

### Show All Ads Regardless of Date Range (Priority: High - NEXT UP)
**Problem:** Currently, ads only appear if they had activity during the selected date range. Selecting 7 days shows 93 ads, but 30 days shows 112 ads. Users expect to see ALL ads with metrics reflecting the selected period.

**Current Behavior:**
- Meta API insights endpoint only returns ads with activity in the date range
- Ads that were paused or had no spend don't appear

**Solution - Two-Step Sync:**
1. **Step 1: Fetch all entities** (not time-bounded)
   ```
   GET /act_{ad_account_id}/campaigns?fields=id,name,status,daily_budget,lifetime_budget
   GET /act_{ad_account_id}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget
   GET /act_{ad_account_id}/ads?fields=id,name,status,adset_id,effective_status
   ```

2. **Step 2: Fetch insights for date range**
   ```
   GET /act_{ad_account_id}/insights?level=ad&fields=...&time_range={date_range}
   ```

3. **Step 3: Merge** - Join entities with insights, showing $0 for ads with no activity

**Files to modify:**
- `app/api/meta/sync/route.ts` - Update sync logic to two-step approach

**Considerations:**
- More API calls (3 entity calls + 1 insights call vs current 1 call)
- Need to handle pagination for large accounts
- Should cache entity data and only refresh insights on date change?
