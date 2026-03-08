# Guided Tours with driver.js — Design Doc

## Overview

Product walkthroughs using driver.js tied to a demo workspace. Every new user gets a "Demo Store" workspace cloned on signup with realistic ad data. Selecting the demo account triggers guided tours. Tours can be dismissed per session and re-enabled via Settings.

## Demo Workspace (Complete)

- Migration 070 clones demo data on signup via `create_default_workspace` trigger
- Template: user `cab4a74f`, workspace `d0d0d0d0-1111-2222-3333-444444444444`, account `act_999888777666`
- 360 ad_data rows (dates shifted to last 30 days from signup), 13 media_library entries with real Supabase storage URLs
- Verdict mix: Scale (7 ads), Watch (2 ads), Kill (4 ads), plus Learn on low-spend days
- 5 video ads with full funnel metrics, 8 image ads, all with ad copy
- `selected_workspace_id` set to Demo Store on signup so user sees data immediately
- Users own their copy and can delete it

## Tour Architecture

### Trigger & Dismiss Logic

- Tours auto-fire when demo account (`act_999888777666`) is the active account AND user navigates to a page in that tour's section
- Dismissing (X / Skip / completing all steps) sets a `sessionStorage` flag: `ks_tour_dismissed_{section}`
- Next session (or re-selecting demo account after switching away) resets dismissal
- Settings > General shows "Guided Tour" toggle when demo workspace is active — toggling ON clears all dismiss flags for that session

### driver.js Configuration

- Theme: `animate` + `showProgress` enabled
- Purple theme matching KillScale brand (custom CSS overrides on driver.js popover)
- Progress bar shows step count (e.g. "3 of 8")
- Smooth animations between steps
- Side/position varies per step for optimal visibility

### 3 Tour Groups

#### Tour 1: Creative Suite
Fires on: `/creative-studio/ad-studio`, `/creative-studio`, `/creative-studio/ai-tasks`

| Page | Steps |
|------|-------|
| **Ad Studio** | Oracle input box ("Type anything to create ads"), Oracle chips ("Quick shortcuts for common tasks"), Output type toggle, Format toggle |
| **Overview** | Score cards (Hook/Hold/Click/Convert), Gallery/table view toggle, Funnel filter pills, Sort controls |
| **Tasks** | AI Tasks list ("Your saved sessions and canvases"), Session cards, "Continue in Studio" buttons |

#### Tour 2: Performance
Fires on: `/dashboard`, `/dashboard/trends`, `/dashboard/insights`

| Page | Steps |
|------|-------|
| **Dashboard** | Stat cards row (Spend/Revenue/ROAS/Purchases), Performance table ("Your campaigns at a glance"), Verdict badges (Scale/Watch/Kill/Learn), Paused toggle ("Show or hide paused campaigns"), Detailed view toggle, Action cards (Kill Now / Scale / Watch / Learn sections) |
| **Trends** | Time series chart, Metric selector |
| **Insights** | Andromeda score card, Health score card |

#### Tour 3: Library
Fires on: `/creative-studio/active`, `/creative-studio/media`, `/creative-studio/best-copy`

| Page | Steps |
|------|-------|
| **Ads** | Active ads grid, Status filter (Active/Paused), "Launch New Ad" button |
| **Media** | Media gallery grid, Theater modal trigger ("Click any asset for details"), Star button, "Build Ads" from starred bar |
| **Copy** | Copy variations list, AI badge on saved copy |

### File Structure

```
lib/tour/
  config.ts          — driver.js theme config, purple CSS overrides
  steps/
    creative-suite.ts — step definitions for Ad Studio, Overview, Tasks
    performance.ts    — step definitions for Dashboard, Trends, Insights
    library.ts        — step definitions for Ads, Media, Copy
  use-tour.ts         — React hook: checks demo account + dismiss state, fires driver

components/
  tour-provider.tsx   — Context provider wrapping dashboard layout
```

### CSS Theme (Purple)

Custom driver.js popover styles:
- Background: dark card (`bg-card` / `#1a1a2e` area)
- Accent/progress bar: purple (`#8B5CF6` / violet-500)
- Text: white
- Overlay: semi-transparent dark
- Buttons: purple primary, ghost secondary
- Border radius matching KillScale card style
- Progress dots or bar in purple

### Settings Integration

When demo workspace is selected, Settings > General page shows:
- "Guided Tour" section with toggle switch
- Description: "Enable guided walkthroughs when browsing the demo account"
- Toggle ON → clears all `ks_tour_dismissed_*` sessionStorage flags
- Toggle OFF → sets all dismiss flags (hides tours for session)

### Demo Account Detection

```typescript
// In use-tour hook or tour-provider
const isDemoAccount = currentAccountId === 'act_999888777666'
```

This is the single source of truth. No separate "demo mode" flag needed — if the demo account is selected, tours are available.

## What Tours Do NOT Do

- No database writes (all sessionStorage)
- No credit consumption (tours highlight UI, don't trigger actions)
- No modifications to demo data
- No blocking — user can always dismiss and use the app normally
- Tours don't fire on non-demo accounts ever
