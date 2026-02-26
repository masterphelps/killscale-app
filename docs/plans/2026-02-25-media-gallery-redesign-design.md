# Media Gallery Redesign — Design

**Date:** 2026-02-25
**Status:** Approved
**Inspiration:** Creatify creative library (app.creatify.ai)

## Goal

Transform the Creative Studio media page from a performance-dashboard-hybrid into a clean, modern media gallery. Performance data remains accessible in the TheaterModal when clicking into assets — the gallery itself is purely for browsing and organizing media.

## Tab Structure

Replace the current 4-tab row (Videos / Images / Collections / Projects) with 3 tabs:

| Tab | Content |
|-----|---------|
| **Media** | All videos + images in one masonry grid, with type filter pills |
| **Collections** | Existing collections UI (unchanged) |
| **Projects** | Existing AI-generated project grid (unchanged) |

## Toolbar (Media Tab)

```
┌─────────────────────────────────────────────────────────────────┐
│  Media    Collections    Projects                               │
├─────────────────────────────────────────────────────────────────┤
│  [All] [Videos] [Images]          Sort: Date added ▼   Upload  │
└─────────────────────────────────────────────────────────────────┘
```

- **Type filter pills** — segmented control: All / Videos / Images
- **Sort dropdown** — Name, Date Added, File Size, Type (with asc/desc toggle)
- **Upload + Sync buttons** — stay as-is
- **REMOVED:** FunnelFilterBar, Source filter pills, DatePicker, Gallery/Table toggle

## Sort Options

| Sort | Field | Default Direction |
|------|-------|-------------------|
| Name | `name` | A → Z |
| Date added | `syncedAt` | Newest first |
| File size | `fileSize` | Largest first |
| Type | `mediaType` | Videos first |

## Card Design (MediaGalleryCard Overhaul)

### Removed from cards
- Score-based colored border/glow (`scoreStyles`)
- Fatigue ring SVG badge (top-left)
- Score pills row (Hook/Hold/Click/Convert)
- Revenue/spend display
- Metrics grid (thumbstop rate, hold rate, CTR, CPC)
- Ad count / adset count row

### Kept on cards
- Hover-to-play (desktop) and scroll-to-play (mobile) video behavior
- Play button overlay for videos (centered, frosted glass)
- Star button and context menu (⋯) — below card
- Click opens TheaterModal with full performance data

### Card structure
```
┌──────────────────────────┐
│                          │
│     [full-frame media]   │
│     natural aspect ratio │
│                          │
│              ▶           │  ← play button (videos only)
│                          │
│   🎬                     │  ← small media type icon, top-left
└──────────────────────────┘
  Beard Balm #3.mp4    ☆ ⋯
```

### Styling
- `rounded-xl overflow-hidden` — no visible border
- No colored glow or score-based styling
- Natural aspect ratio from media dimensions (fallback 4:3 if unknown)
- Small media type badge top-left (Film icon for video, Image icon for image) — subtle, semi-transparent backdrop
- Media type pill top-right stays but simplified
- Filename + star + menu below card (not inside card)

## Masonry Grid Changes

- Keep `react-masonry-css` (already used)
- Widen max-width from `1200px` to full available width with padding
- Column breakpoints: 5 cols on 2xl, 4 on xl, 3 on lg, 2 on md, 1 on sm
- Tighter gaps: `pl-4 mb-4` (down from `pl-6 mb-6`)

## TheaterModal — No Changes

All performance data stays in the modal:
- Performance tab: Hook/Hold/Click/Convert scores, fatigue chart, audiences
- AI Analysis tab: video analysis
- Details tab: asset info, hierarchy
- Footer actions: Star, Edit Image/Video, Build New Ads

## Files to Modify

### Heavy changes
- `app/dashboard/creative-studio/media/page.tsx` — Remove FunnelFilterBar, source filters, date picker, table view toggle, performance sort options. Restructure tabs to Media/Collections/Projects. New sort options (name, date, size, type). Type filter pills (All/Videos/Images).
- `components/creative-studio/media-gallery-card.tsx` — Strip score overlays, fatigue ring, metrics grid, revenue/spend, score pills. Natural aspect ratio. Clean minimal card with just media + type badge.

### Light changes
- `components/creative-studio/gallery-grid.tsx` — Wider max-width, 5-column breakpoint, tighter gaps.

### No changes
- `components/creative-studio/theater-modal.tsx` — Keeps all performance data
- `app/dashboard/creative-studio/layout.tsx` — Context provider unchanged
- `app/dashboard/creative-studio/creative-studio-context.tsx` — All state still needed
- `components/creative-studio/funnel-filter-bar.tsx` — Still used by other pages (active ads), just removed from media page

## What Gets Removed from media/page.tsx

- `FunnelFilterBar` import and all `funnelThresholds` / `funnelStats` state/memos
- `viewMode` state and Gallery/Table toggle
- `sourceFilter` / `sourceFilteredAssets` logic (source pills removed)
- `DatePickerButton` / `DatePicker` in media page
- `MediaTable` component usage
- Performance-oriented sort options (hookScore, holdScore, clickScore, convertScore, spend, roas, revenue, fatigue, adCount, thumbstopRate, holdRate, ctr, cpc, impressions)
- `scaleThreshold` computation
- Results count text ("24 videos filtered by hook 75+")
