# Creative Studio Implementation Plan

## Overview

**Feature:** Creative Studio - A standalone page for analyzing creative and media performance with fatigue detection, AI recommendations, and build-from-winners functionality.

**Goal:** Differentiate KillScale by showing performance at the MEDIA level (not just ad level), answering "which videos/images actually work?"

**Status:** Planning

---

## Information Architecture

```
Sidebar:
├── Dashboard
├── Launch
├── Creative Studio  ← NEW
├── Insights
├── Trends
└── Settings

Creative Studio Page:
├── Creative Health Score (top banner)
├── Tabs: Creatives | Media
├── Table/Grid view with sorting/filtering
├── Detail slide-over with fatigue chart
├── AI Recommendations panel
└── Build from Starred flow
```

**URLs:**
- `/dashboard/creative-studio` → Creatives tab (default)
- `/dashboard/creative-studio?tab=media` → Media tab

---

## Phase 1: Data Foundation

### 1.1 Database Schema Changes

**New columns on `ad_data`:**
```sql
-- Migration: 037_creative_media_tracking.sql
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS media_hash TEXT;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS media_type TEXT; -- 'image' | 'video' | 'carousel' | 'dynamic'

CREATE INDEX IF NOT EXISTS idx_ad_data_media_hash ON ad_data(media_hash);
CREATE INDEX IF NOT EXISTS idx_ad_data_media_type ON ad_data(media_type);
```

**New table for starred media:**
```sql
-- Starred media (separate from starred_ads)
CREATE TABLE IF NOT EXISTS starred_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  media_hash TEXT NOT NULL,
  media_type TEXT NOT NULL, -- 'image' | 'video'
  thumbnail_url TEXT,
  media_name TEXT,
  starred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, ad_account_id, media_hash)
);

-- RLS policies
ALTER TABLE starred_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own starred media" ON starred_media;
CREATE POLICY "Users can manage own starred media" ON starred_media
  FOR ALL USING (auth.uid() = user_id);
```

**New view for creative-level aggregation:**
```sql
-- Aggregate performance by creative_id
CREATE OR REPLACE VIEW creative_performance AS
SELECT
  user_id,
  ad_account_id,
  creative_id,
  COUNT(DISTINCT ad_id) as ad_count,
  COUNT(DISTINCT adset_id) as adset_count,
  COUNT(DISTINCT campaign_id) as campaign_count,
  SUM(spend) as total_spend,
  SUM(revenue) as total_revenue,
  SUM(impressions) as total_impressions,
  SUM(clicks) as total_clicks,
  SUM(purchases) as total_purchases,
  CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas,
  CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::float / SUM(impressions)) * 100 ELSE 0 END as ctr,
  CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm,
  MIN(date_start) as first_seen,
  MAX(date_start) as last_seen,
  array_agg(DISTINCT adset_name) FILTER (WHERE adset_name IS NOT NULL) as audience_names
FROM ad_data
WHERE creative_id IS NOT NULL
GROUP BY user_id, ad_account_id, creative_id;
```

**New view for media-level aggregation:**
```sql
-- Aggregate performance by media_hash (across all creatives using that media)
CREATE OR REPLACE VIEW media_performance AS
SELECT
  user_id,
  ad_account_id,
  media_hash,
  media_type,
  COUNT(DISTINCT creative_id) as creative_count,
  COUNT(DISTINCT ad_id) as ad_count,
  COUNT(DISTINCT adset_id) as adset_count,
  COUNT(DISTINCT campaign_id) as campaign_count,
  SUM(spend) as total_spend,
  SUM(revenue) as total_revenue,
  SUM(impressions) as total_impressions,
  SUM(clicks) as total_clicks,
  SUM(purchases) as total_purchases,
  CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas,
  CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::float / SUM(impressions)) * 100 ELSE 0 END as ctr,
  CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END as cpm,
  MIN(date_start) as first_seen,
  MAX(date_start) as last_seen,
  array_agg(DISTINCT adset_name) FILTER (WHERE adset_name IS NOT NULL) as audience_names
FROM ad_data
WHERE media_hash IS NOT NULL
GROUP BY user_id, ad_account_id, media_hash, media_type;
```

**Files to create:**
- `supabase/migrations/037_creative_media_tracking.sql`

---

### 1.2 Sync Enhancement

**Modify sync to extract media identifiers from creatives.**

**File:** `app/api/meta/sync/route.ts`

**Changes:**
1. Update batch request to include creative fields:
```typescript
// Line ~446 - Change from:
`${adAccountId}/ads?fields=id,name,adset_id,effective_status,creative{id}&limit=500`

// To:
`${adAccountId}/ads?fields=id,name,adset_id,effective_status,creative{id,image_hash,video_id,object_story_spec}&limit=500`
```

2. Add media extraction logic when processing ads:
```typescript
// Helper function to extract media hash from creative
function extractMediaFromCreative(creative: any): { mediaHash: string | null, mediaType: string | null } {
  if (!creative) return { mediaHash: null, mediaType: null }

  // Direct video_id
  if (creative.video_id) {
    return { mediaHash: creative.video_id, mediaType: 'video' }
  }

  // Direct image_hash
  if (creative.image_hash) {
    return { mediaHash: creative.image_hash, mediaType: 'image' }
  }

  // Check object_story_spec
  const storySpec = creative.object_story_spec
  if (storySpec) {
    // Video in story spec
    if (storySpec.video_data?.video_id) {
      return { mediaHash: storySpec.video_data.video_id, mediaType: 'video' }
    }
    // Image in link_data
    if (storySpec.link_data?.image_hash) {
      return { mediaHash: storySpec.link_data.image_hash, mediaType: 'image' }
    }
    // Photo data
    if (storySpec.photo_data?.image_hash) {
      return { mediaHash: storySpec.photo_data.image_hash, mediaType: 'image' }
    }
    // Carousel (multi-media)
    if (storySpec.link_data?.child_attachments) {
      return { mediaHash: null, mediaType: 'carousel' }
    }
  }

  // Dynamic/Advantage+ creative
  if (creative.asset_feed_spec) {
    return { mediaHash: null, mediaType: 'dynamic' }
  }

  return { mediaHash: null, mediaType: null }
}
```

3. Include media_hash and media_type in upsert data.

**Estimated changes:** ~50 lines added/modified in sync route

---

## Phase 2: API Endpoints

### 2.1 Creative Analytics Endpoint

**File:** `app/api/creative-studio/creatives/route.ts` (NEW)

```typescript
// GET /api/creative-studio/creatives?userId=X&adAccountId=Y&dateRange=last_30d
// Returns: List of creatives with aggregated performance

interface CreativeAnalytics {
  creativeId: string
  adCount: number
  adsetCount: number
  campaignCount: number
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpm: number
  impressions: number
  clicks: number
  purchases: number
  firstSeen: string
  lastSeen: string
  audienceNames: string[]
  // Enriched from Meta API:
  thumbnailUrl?: string
  mediaType: 'image' | 'video' | 'carousel' | 'dynamic'
  headline?: string
  body?: string
  // Fatigue:
  fatigueScore: number
  fatigueStatus: 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued'
}
```

**Features:**
- Query creative_performance view
- Enrich with thumbnail/copy from Meta API (batch request)
- Calculate fatigue score for each creative
- Support sorting: roas, spend, revenue, fatigueScore
- Support filtering: mediaType, fatigueStatus, minSpend

---

### 2.2 Media Analytics Endpoint

**File:** `app/api/creative-studio/media/route.ts` (NEW)

```typescript
// GET /api/creative-studio/media?userId=X&adAccountId=Y&dateRange=last_30d
// Returns: List of media assets with aggregated performance

interface MediaAnalytics {
  mediaHash: string
  mediaType: 'image' | 'video'
  creativeCount: number
  adCount: number
  adsetCount: number
  campaignCount: number
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpm: number
  firstSeen: string
  lastSeen: string
  audienceNames: string[]
  // Enriched:
  thumbnailUrl?: string
  mediaName?: string
  // Fatigue:
  fatigueScore: number
  fatigueStatus: 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued'
  // Best copy for this media:
  topCopyVariations: {
    headline: string
    body: string
    roas: number
    spend: number
  }[]
}
```

**Features:**
- Query media_performance view
- Enrich with thumbnails from media library
- Calculate fatigue score
- Include top-performing copy variations for each media
- Support sorting and filtering

---

### 2.3 Creative/Media Detail Endpoint

**File:** `app/api/creative-studio/detail/route.ts` (NEW)

```typescript
// GET /api/creative-studio/detail?type=creative|media&id=X&userId=Y&adAccountId=Z
// Returns: Detailed data for a single creative or media asset

interface DetailResponse {
  // Basic info
  id: string
  type: 'creative' | 'media'
  thumbnailUrl: string
  mediaType: string

  // Aggregate metrics
  totalSpend: number
  totalRevenue: number
  roas: number
  adCount: number
  adsetCount: number

  // Fatigue analysis
  fatigueScore: number
  fatigueStatus: string

  // Time series for fatigue chart (last 30 days)
  dailyData: {
    date: string
    spend: number
    revenue: number
    roas: number
    impressions: number
    clicks: number
    ctr: number
    cpm: number
  }[]

  // Period comparison
  earlyPeriod: { roas: number, ctr: number, cpm: number } // First 7 days
  recentPeriod: { roas: number, ctr: number, cpm: number } // Last 7 days

  // Per-audience breakdown
  audiencePerformance: {
    adsetId: string
    adsetName: string
    spend: number
    revenue: number
    roas: number
    fatigueStatus: string
  }[]

  // Copy variations (for media detail)
  copyVariations?: {
    creativeId: string
    headline: string
    body: string
    spend: number
    revenue: number
    roas: number
  }[]

  // Ads using this creative/media
  ads: {
    adId: string
    adName: string
    adsetName: string
    campaignName: string
    status: string
    spend: number
    roas: number
  }[]
}
```

---

### 2.4 Fatigue Calculation Endpoint

**File:** `app/api/creative-studio/fatigue/route.ts` (NEW)

```typescript
// POST /api/creative-studio/fatigue
// Body: { dailyData: DailyMetrics[] }
// Returns: { fatigueScore: number, fatigueStatus: string, factors: {...} }

// Fatigue calculation logic:
function calculateFatigueScore(dailyData: DailyMetrics[]): FatigueResult {
  if (dailyData.length < 7) {
    return { score: 0, status: 'fresh', factors: {} }
  }

  const recentDays = dailyData.slice(-7)
  const earlierDays = dailyData.slice(0, Math.min(7, dailyData.length - 7))

  if (earlierDays.length === 0) {
    return { score: 0, status: 'fresh', factors: {} }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  // ROAS decline (40% weight)
  const earlyROAS = avg(earlierDays.map(d => d.roas))
  const recentROAS = avg(recentDays.map(d => d.roas))
  const roasDecline = earlyROAS > 0 ? Math.max(0, (earlyROAS - recentROAS) / earlyROAS * 100) : 0

  // CTR decline (25% weight)
  const earlyCTR = avg(earlierDays.map(d => d.ctr))
  const recentCTR = avg(recentDays.map(d => d.ctr))
  const ctrDecline = earlyCTR > 0 ? Math.max(0, (earlyCTR - recentCTR) / earlyCTR * 100) : 0

  // CPM increase (25% weight)
  const earlyCPM = avg(earlierDays.map(d => d.cpm))
  const recentCPM = avg(recentDays.map(d => d.cpm))
  const cpmIncrease = earlyCPM > 0 ? Math.max(0, (recentCPM - earlyCPM) / earlyCPM * 100) : 0

  // Age penalty (10% weight)
  const daysActive = dailyData.length
  const agePenalty = Math.min(100, daysActive * 2)

  const score = Math.min(100,
    (roasDecline * 0.4) +
    (ctrDecline * 0.25) +
    (cpmIncrease * 0.25) +
    (agePenalty * 0.1)
  )

  const status =
    score <= 25 ? 'fresh' :
    score <= 50 ? 'healthy' :
    score <= 70 ? 'warning' :
    score <= 85 ? 'fatiguing' : 'fatigued'

  return {
    score,
    status,
    factors: {
      roasDecline: { value: roasDecline, weight: 0.4 },
      ctrDecline: { value: ctrDecline, weight: 0.25 },
      cpmIncrease: { value: cpmIncrease, weight: 0.25 },
      agePenalty: { value: agePenalty, weight: 0.1 }
    }
  }
}
```

---

### 2.5 Starred Media Endpoints

**File:** `app/api/creative-studio/starred/route.ts` (NEW)

```typescript
// GET - List starred media
// POST - Star a media asset
// DELETE - Unstar a media asset

// Similar pattern to existing /api/starred/route.ts but for media_hash
```

---

### 2.6 Creative Health Score Endpoint

**File:** `app/api/creative-studio/health/route.ts` (NEW)

```typescript
// GET /api/creative-studio/health?userId=X&adAccountId=Y
// Returns: Overall creative health score for the account

interface CreativeHealthScore {
  score: number // 0-100
  status: 'excellent' | 'good' | 'warning' | 'critical'
  factors: {
    diversity: { score: number, detail: string }    // Unique media vs total ads
    fatigue: { score: number, detail: string }      // Avg fatigue of active creatives
    winnerHealth: { score: number, detail: string } // Top 5 performers' fatigue
    freshPipeline: { score: number, detail: string }// % creatives < 14 days old
  }
  recommendations: string[]
}
```

---

## Phase 3: UI Components

### 3.1 Creative Studio Page

**File:** `app/dashboard/creative-studio/page.tsx` (NEW)

**Structure:**
```tsx
export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<'creatives' | 'media'>('creatives')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Creative Studio</h1>
          <p className="text-zinc-500">Analyze creative performance and build from winners</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filters, date range, etc */}
        </div>
      </div>

      {/* Creative Health Score Banner */}
      <CreativeHealthBanner />

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg w-fit">
        <TabButton active={activeTab === 'creatives'} onClick={() => setActiveTab('creatives')}>
          Creatives
        </TabButton>
        <TabButton active={activeTab === 'media'} onClick={() => setActiveTab('media')}>
          Media
        </TabButton>
      </div>

      {/* Content */}
      {activeTab === 'creatives' ? (
        <CreativesTable onSelect={(id) => { setSelectedItem(id); setShowDetail(true) }} />
      ) : (
        <MediaTable onSelect={(id) => { setSelectedItem(id); setShowDetail(true) }} />
      )}

      {/* AI Recommendations Panel */}
      <AIRecommendationsPanel />

      {/* Detail Slide-over */}
      <DetailSlideOver
        type={activeTab === 'creatives' ? 'creative' : 'media'}
        id={selectedItem}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </div>
  )
}
```

---

### 3.2 Creative Health Banner

**File:** `components/creative-studio/creative-health-banner.tsx` (NEW)

```tsx
// Shows the Creative Health Score at top of page
// Collapsible to show factor breakdown
// Links to AI recommendations
```

---

### 3.3 Creatives Table

**File:** `components/creative-studio/creatives-table.tsx` (NEW)

**Columns:**
- Thumbnail (with video play icon if video)
- Creative ID (truncated)
- Copy preview (headline truncated)
- Media Type (image/video/carousel badge)
- Spend
- Revenue
- ROAS
- Ad Count
- Adset Count
- Fatigue Status (badge)
- Star button
- Actions (View Detail)

**Features:**
- Sortable columns
- Filter by: media type, fatigue status, min spend
- Search by headline/copy
- Bulk select for starring
- Click row to open detail

---

### 3.4 Media Table

**File:** `components/creative-studio/media-table.tsx` (NEW)

**Columns:**
- Thumbnail
- Media Name/ID
- Media Type (image/video badge)
- Spend
- Revenue
- ROAS
- Creative Count
- Ad Count
- Adset Count
- Fatigue Status (badge)
- Top Copy ROAS (shows best headline snippet)
- Star button
- Actions (View Detail)

**Features:**
- Same as creatives table
- Shows "# copy variations" instead of copy preview

---

### 3.5 Detail Slide-Over

**File:** `components/creative-studio/detail-slide-over.tsx` (NEW)

**Structure:**
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                                           ⭐ Star       │
├─────────────────────────────────────────────────────────────────┤
│  [Thumbnail]   Name / ID                                        │
│                Type badge • Uploaded date                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ FATIGUE STATUS: 62% WARNING                             │   │
│  │ ████████████░░░░░░                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Spend  │ │Revenue │ │ ROAS   │ │  Ads   │ │Ad Sets │       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
│                                                                 │
│  FATIGUE TREND                                                  │
│  [Chart - 30 day ROAS with moving average]                     │
│                                                                 │
│  PERIOD COMPARISON                                              │
│  [Early vs Recent side-by-side]                                │
│                                                                 │
│  AUDIENCE PERFORMANCE                                           │
│  [Table of ad sets using this creative/media]                  │
│                                                                 │
│  COPY VARIATIONS (Media detail only)                           │
│  [Table of copy options with ROAS]                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⭐ Star This   │   🚀 Build Ads From This              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.6 Fatigue Trend Chart

**File:** `components/creative-studio/fatigue-trend-chart.tsx` (NEW)

Uses Recharts (same style as Trends page):
- Line chart with daily ROAS
- 7-day moving average overlay
- Peak reference line
- Decline zone shading
- Tooltip with full metrics

---

### 3.7 Period Comparison Component

**File:** `components/creative-studio/period-comparison.tsx` (NEW)

Side-by-side cards:
- Early (First 7 days): ROAS, CTR, CPM
- Recent (Last 7 days): ROAS, CTR, CPM with % change indicators

---

### 3.8 AI Recommendations Panel

**File:** `components/creative-studio/ai-recommendations-panel.tsx` (NEW)

Collapsible panel at bottom:
- Priority-ranked recommendations
- Links to relevant creatives/media
- "Generate New Copy" button (future)

Uses Claude API similar to Health Recommendations.

---

### 3.9 Star Button (Media)

**File:** `components/creative-studio/media-star-button.tsx` (NEW)

Similar to existing `components/star-button.tsx` but for media_hash.

---

### 3.10 Starred Media Popover

**File:** `components/creative-studio/starred-media-popover.tsx` (NEW)

Similar to existing `components/starred-ads-popover.tsx`:
- Shows starred media assets
- "Build Ads from Starred Media" button
- Clears starred on build

---

## Phase 4: Build From Media Flow

### 4.1 Launch Wizard Modifications

**File:** `components/launch-wizard.tsx`

**Changes:**
1. Add new entry point: "Build from Starred Media"
2. When triggered, pre-load media in creative step
3. Add "Copy Pairing" step after media selection

**New Step: Copy Pairing**
```tsx
// When building from starred media, show:
{starredMedia.map(media => (
  <div key={media.mediaHash}>
    <MediaThumbnail media={media} />
    <div>
      {media.topCopyVariations.length > 0 ? (
        <>
          <p>Suggested copy (best performer):</p>
          <CopyOption copy={media.topCopyVariations[0]} selected />
          <button>Use Different Copy</button>
          <button>Write New Copy</button>
        </>
      ) : (
        <CopyEditor />
      )}
    </div>
  </div>
))}
```

---

### 4.2 Build From Media API

**File:** `app/api/meta/create-ads-from-media/route.ts` (NEW)

```typescript
// POST /api/meta/create-ads-from-media
// Body: {
//   adsetId: string,
//   mediaItems: {
//     mediaHash: string,
//     mediaType: 'image' | 'video',
//     headline: string,
//     body: string,
//     cta: string,
//     link: string
//   }[]
// }
// Creates one ad per media item in the specified ad set
```

---

## Phase 5: Sidebar & Navigation

### 5.1 Sidebar Update

**File:** `components/sidebar.tsx`

Add Creative Studio nav item:
```tsx
{
  name: 'Creative Studio',
  href: '/dashboard/creative-studio',
  icon: Palette, // or Film, or Wand2
}
```

**Placement:** After Launch, before Insights

---

### 5.2 Insights Integration

**File:** `app/dashboard/insights/page.tsx` (if exists, or create)

Add Creative Health Score card that links to Creative Studio:
```tsx
<ScoreCard
  title="Creative"
  score={creativeHealthScore}
  status={creativeHealthStatus}
  linkTo="/dashboard/creative-studio"
  linkText="Open Studio →"
/>
```

---

## Phase 6: AI Integration

### 6.1 Creative Recommendations Endpoint

**File:** `app/api/ai/creative-recommendations/route.ts` (NEW)

Uses Claude API to generate recommendations based on:
- Fatigue scores
- Creative diversity
- Performance trends
- Best/worst performers

Similar pattern to `app/api/ai/health-recommendations/route.ts`.

---

### 6.2 Copy Generation Endpoint (Future)

**File:** `app/api/ai/generate-copy/route.ts` (NEW)

Given a media asset and context (brand, top performers), generate copy variations.

---

## File Summary

### New Files to Create

**Migrations:**
- `supabase/migrations/037_creative_media_tracking.sql`

**API Routes:**
- `app/api/creative-studio/creatives/route.ts`
- `app/api/creative-studio/media/route.ts`
- `app/api/creative-studio/detail/route.ts`
- `app/api/creative-studio/fatigue/route.ts`
- `app/api/creative-studio/starred/route.ts`
- `app/api/creative-studio/health/route.ts`
- `app/api/meta/create-ads-from-media/route.ts`
- `app/api/ai/creative-recommendations/route.ts`

**Pages:**
- `app/dashboard/creative-studio/page.tsx`

**Components:**
- `components/creative-studio/creative-health-banner.tsx`
- `components/creative-studio/creatives-table.tsx`
- `components/creative-studio/media-table.tsx`
- `components/creative-studio/detail-slide-over.tsx`
- `components/creative-studio/fatigue-trend-chart.tsx`
- `components/creative-studio/period-comparison.tsx`
- `components/creative-studio/ai-recommendations-panel.tsx`
- `components/creative-studio/media-star-button.tsx`
- `components/creative-studio/starred-media-popover.tsx`

### Files to Modify

- `app/api/meta/sync/route.ts` - Add media hash extraction
- `components/launch-wizard.tsx` - Add "Build from Media" flow
- `components/sidebar.tsx` - Add Creative Studio nav item
- `lib/supabase.ts` - Add types for new tables/views

---

## Implementation Order

### Sprint 1: Foundation (Data Layer)
1. ✅ Create migration for media_hash columns and views
2. ✅ Modify sync to extract media identifiers
3. ✅ Create fatigue calculation utility
4. ✅ Run migration, test sync with media extraction

### Sprint 2: API Layer
5. ✅ Build /creative-studio/creatives endpoint
6. ✅ Build /creative-studio/media endpoint
7. ✅ Build /creative-studio/detail endpoint
8. ✅ Build /creative-studio/health endpoint
9. ✅ Build /creative-studio/starred endpoints

### Sprint 3: Core UI
10. ✅ Create Creative Studio page shell
11. ✅ Build CreativeHealthBanner component
12. ✅ Build CreativesTable component
13. ✅ Build MediaTable component
14. ✅ Add to sidebar

### Sprint 4: Detail View
15. ✅ Build DetailSlideOver component
16. ✅ Build FatigueTrendChart component
17. ✅ Build PeriodComparison component
18. ✅ Wire up detail view data loading

### Sprint 5: Star & Build Flow
19. ✅ Build starred media system (table, endpoints, UI)
20. ✅ Build StarredMediaPopover
21. ✅ Modify LaunchWizard for "Build from Media"
22. ✅ Create create-ads-from-media endpoint

### Sprint 6: AI & Polish
23. ✅ Build AI recommendations endpoint
24. ✅ Build AIRecommendationsPanel component
25. ✅ Add Insights integration (score card)
26. ✅ Polish, testing, edge cases

---

## Success Metrics

1. **Data Accuracy:** Media hash captured for >90% of ads
2. **Fatigue Detection:** Correctly identifies declining creatives
3. **User Flow:** Can go from "see fatigued media" → "build replacement ads" in <2 minutes
4. **Differentiation:** Feature that competitors don't have

---

## Open Questions

1. **Carousel handling:** Show as single item or expand child attachments?
   - Recommendation: Show as single "carousel" type, detail view shows components

2. **Dynamic Creative (DCO):** How to handle Advantage+ creatives?
   - Recommendation: Flag as "dynamic", show component assets separately in detail

3. **Historical data:** Should we backfill media_hash for existing ad_data?
   - Recommendation: Yes, create a one-time backfill script

4. **Workspace support:** Should this be workspace-scoped?
   - Recommendation: Yes, follow existing pattern with workspace_id

---

## Visual Design Vision: STUNNING Media-Rich Experience

### Design Philosophy

**This is NOT a data table with thumbnails. This is a media gallery with data.**

The goal: When users open Creative Studio, they should feel like they're browsing Netflix or Dribbble - but for their ads. The media is the HERO. Data supports it, not the other way around.

---

### View Modes

#### 1. Gallery View (Default) - The Hero Experience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Creative Studio                                    ⊞ Gallery  ☰ Table     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Creative Health: 72/100 ⚠️                    [Filters] [Sort: ROAS ▼] ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │                  │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │   ▶  VIDEO      │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│          │
│  │▓▓▓▓ IMAGE ▓▓▓▓▓▓▓│  │     PREVIEW     │  │▓▓▓▓ IMAGE ▓▓▓▓▓▓▓│          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │                  │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │                  │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│          │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤          │
│  │ 🟢 4.2x ROAS     │  │ 🟡 2.8x ROAS     │  │ 🔴 0.9x ROAS     │          │
│  │ $12.3k spend     │  │ $8.4k spend      │  │ $3.2k spend      │          │
│  │ 8 ads · 5 sets   │  │ 12 ads · 4 sets  │  │ 3 ads · 2 sets   │          │
│  │ ⭐ ···           │  │ ⭐ ···           │  │ ☆ ···            │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │                  │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │                  │          │
│  │   ▶  VIDEO      │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │   ▶  VIDEO      │          │
│  │                  │  │▓▓▓▓ IMAGE ▓▓▓▓▓▓▓│  │                  │          │
│  │                  │  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │                  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Card Design Features:**

1. **Large Media Thumbnails** (min 280px wide, 16:9 or 1:1 aspect)
   - High-quality thumbnails, not tiny icons
   - Video cards show play button overlay
   - **Hover: Video auto-plays (muted)** - like Twitter/Instagram

2. **ROAS Glow Effect**
   - Green glow/border for ROAS ≥ 3x (Scale)
   - Yellow glow for ROAS 1.5-3x (Watch)
   - Red glow for ROAS < 1.5x (Kill)
   - Subtle, not garish - like a soft LED underglow

3. **Fatigue Ring**
   - Circular progress indicator around star button OR corner badge
   - Visual at-a-glance health status
   - Animated pulse for "Warning" and "Fatiguing" status

4. **Glassmorphism Stats Overlay**
   - On hover, stats slide up over bottom of image
   - Frosted glass effect (backdrop-blur)
   - Quick stats: ROAS, Spend, Revenue, Ad Count

5. **Smooth Animations**
   - Cards have subtle scale on hover (1.02x)
   - Stats overlay slides up with spring animation
   - Stagger animation on initial load (cards appear one by one)

---

#### 2. Masonry/Pinterest Layout Option

For accounts with mixed aspect ratios (stories vs feed):

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│             │  │             │  │             │
│   SQUARE    │  │             │  │   SQUARE    │
│             │  │   9:16      │  │             │
├─────────────┤  │   STORY     │  ├─────────────┤
│             │  │             │  │             │
│             │  │             │  │             │
│    16:9     │  │             │  │    16:9     │
│    VIDEO    │  ├─────────────┤  │    VIDEO    │
│             │  │   SQUARE    │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

#### 3. Table View (For Power Users)

Still available as toggle, but NOT the default:
- Compact rows with small thumbnails
- Full data columns
- Bulk selection
- Export functionality

---

### Hover & Interaction States

#### Video Card Hover
```
┌──────────────────────────────────────┐
│                                      │
│          advancement video            │
│            PLAYING...                │  ← Auto-plays on hover (muted)
│              🔊                       │  ← Click to unmute
│                                      │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │  ← Glassmorphism overlay
│ │ 🟢 4.2x ROAS    $51.8k revenue   │ │     slides up on hover
│ │ $12.3k spend    156 purchases    │ │
│ │ ─────────────────────────────────│ │
│ │ 8 ads across 5 audiences         │ │
│ └──────────────────────────────────┘ │
│                           ⭐ ··· ↗  │  ← Star, menu, expand
└──────────────────────────────────────┘
```

#### Image Card Hover
```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│            IMAGE                     │  ← Subtle zoom (1.05x)
│           CONTENT                    │
│                                      │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ 🟡 2.1x ROAS    $18.2k revenue   │ │
│ │ Copy: "Limited time offer..."    │ │  ← Shows headline preview
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

### Detail View: Theater Mode

When clicking a card, don't just show a slide-over. Show a **theater experience**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                              ✕ Close        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │                                                                        │ │
│  │                                                                        │ │
│  │                           LARGE VIDEO                                  │ │
│  │                           PLAYER                                       │ │
│  │                           (or image)                                   │ │
│  │                                                                        │ │
│  │                              ▶                                         │ │
│  │                                                                        │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  summer-promo-2024.mp4                                       ⭐ Star Media  │
│  Uploaded Dec 15, 2024  •  0:28 duration  •  1080x1920                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │         ┌─────────┐                                                     ││
│  │         │ ⚠️ 62%  │  WARNING - Creative showing fatigue signals        ││
│  │         │ FATIGUE │  ROAS down 24% from peak • CTR declining 18%       ││
│  │         └─────────┘                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ $12,340  │ │ $51,828  │ │  4.2x    │ │   12     │ │    5     │          │
│  │  Spend   │ │ Revenue  │ │  ROAS    │ │   Ads    │ │ Ad Sets  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  FATIGUE TREND                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │     5x ┤    ╭───╮                                                   │   │
│  │        │   ╱    ╲    ╭──╮                                          │   │
│  │     4x ┤  ╱      ╲──╱   ╲                                          │   │
│  │        │ ╱               ╲                                          │   │
│  │     3x ┤╱                 ╲───╮                 Peak: 4.8x          │   │
│  │        │                      ╲────╮                                │   │
│  │     2x ┤                           ╲─────╮     Now: 3.2x           │   │
│  │        └──────────────────────────────────────────────────────     │   │
│  │         Dec 28      Jan 7       Jan 14      Jan 21      Jan 27     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────┬─────────────────────────────────────┐ │
│  │  📊 EARLY PERIOD (First 7 days) │  📊 RECENT (Last 7 days)           │ │
│  │  ROAS: 4.8x                     │  ROAS: 3.2x         ↓ 33%          │ │
│  │  CTR:  2.4%                     │  CTR:  1.8%         ↓ 25%          │ │
│  │  CPM:  $12.50                   │  CPM:  $18.40       ↑ 47%          │ │
│  └─────────────────────────────────┴─────────────────────────────────────┘ │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  BEST PERFORMING AUDIENCES                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🟢 Lookalike 2% - Purchasers           5.2x ROAS    $4,200 spend   │   │
│  │  🟢 Retargeting - 30 day                3.8x ROAS    $2,400 spend   │   │
│  │  🟡 Interest - Fitness                  2.1x ROAS    $3,800 spend   │   │
│  │  🔴 Broad - 25-45                       0.9x ROAS    $1,940 spend   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  TOP COPY VARIATIONS (for this media)                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  "Limited time: 50% off everything"              5.1x    $3,200     │   │
│  │  "Transform your summer routine"                 4.2x    $2,800     │   │
│  │  "Don't miss out on savings"                     3.4x    $2,100     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │   ⭐ Star This Media    │    🚀 Build New Ads With This Media      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Color & Styling Specifications

#### ROAS-Based Glow Effects
```css
/* Scale (≥3x) - Green glow */
.card-scale {
  box-shadow:
    0 0 20px rgba(34, 197, 94, 0.3),
    0 0 40px rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.4);
}

/* Watch (1.5-3x) - Yellow/Amber glow */
.card-watch {
  box-shadow:
    0 0 20px rgba(234, 179, 8, 0.25),
    0 0 40px rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
}

/* Kill (<1.5x) - Red glow */
.card-kill {
  box-shadow:
    0 0 20px rgba(239, 68, 68, 0.25),
    0 0 40px rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

#### Glassmorphism Overlay
```css
.stats-overlay {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
```

#### Fatigue Badge Animations
```css
/* Pulsing animation for warning/fatiguing status */
@keyframes fatigue-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.05); }
}

.fatigue-warning {
  animation: fatigue-pulse 2s ease-in-out infinite;
}
```

#### Card Hover Transitions
```css
.media-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.media-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.3),
    var(--roas-glow);
}

.media-card:hover .stats-overlay {
  transform: translateY(0);
  opacity: 1;
}
```

---

### Video Player Features

1. **Hover Autoplay**
   - Videos start playing (muted) on card hover
   - Stop when mouse leaves
   - Uses IntersectionObserver for performance

2. **Theater Mode Player**
   - Full controls (play/pause, scrub, volume, fullscreen)
   - Keyboard shortcuts (space = play/pause, f = fullscreen)
   - Picture-in-picture support

3. **Thumbnail Fallback**
   - If video fails to load, show thumbnail with play button
   - Loading skeleton while video buffers

---

### Mobile Experience

On mobile, the gallery becomes a vertical scroll with larger cards:

```
┌─────────────────────────────┐
│  Creative Studio            │
│  ┌───────────────────────┐  │
│  │                       │  │
│  │                       │  │
│  │      VIDEO/IMAGE      │  │
│  │        CARD           │  │
│  │                       │  │
│  ├───────────────────────┤  │
│  │ 🟢 4.2x   $12.3k      │  │
│  │ 8 ads · 5 audiences   │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │                       │  │
│  │      NEXT CARD        │  │
│  │                       │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

- Full-width cards
- Tap to open detail (no hover)
- Swipe gestures for navigation
- Pull-to-refresh

---

### Empty States

#### No Creatives Yet
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                         🎬                                       │
│                                                                  │
│              No creative data yet                               │
│                                                                  │
│     Sync your Meta account to see your creative                 │
│     performance visualized beautifully.                         │
│                                                                  │
│              [ Sync Now ]   [ Upload CSV ]                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Filtered to Empty
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                         🔍                                       │
│                                                                  │
│              No creatives match your filters                    │
│                                                                  │
│              [ Clear Filters ]                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Loading States

#### Skeleton Cards
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░ │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ ░░░░░░  ░░░░░░░  │  │ ░░░░░░  ░░░░░░░  │  │ ░░░░░░  ░░░░░░░  │
│ ░░░░░░░░░░░      │  │ ░░░░░░░░░░░      │  │ ░░░░░░░░░░░      │
└──────────────────┘  └──────────────────┘  └──────────────────┘

Shimmer animation across cards, staggered timing
```

---

### Micro-interactions

1. **Star Animation** - Star fills with sparkle effect
2. **ROAS Badge** - Number counts up on first reveal
3. **Fatigue Ring** - Animates from 0 to value on load
4. **Card Entry** - Fade up + scale with stagger
5. **Filter Applied** - Cards shuffle/reorganize with spring physics
6. **Detail Open** - Card expands into theater mode (shared element transition)

---

### Accessibility

- All videos have captions option
- Color coding supplemented with icons (not color-only)
- Keyboard navigation for gallery
- Screen reader labels for all interactive elements
- Reduced motion option respects prefers-reduced-motion

---

### Tech Stack for Stunning UI

1. **Framer Motion** - For smooth animations and shared element transitions
2. **React Player** - For video playback with controls
3. **Masonry Layout** - react-masonry-css or similar
4. **Intersection Observer** - For lazy loading and hover-to-play
5. **Tailwind + Custom CSS** - For glassmorphism and glow effects

---

## Notes

- Keep chart styling consistent with Trends page
- Follow existing component patterns (StatCard, tables, etc.)
- Use existing color scales (verdict colors, ROAS colors)
- Maintain rate limit safety in all Meta API calls
- Privacy mode support for masking creative names
