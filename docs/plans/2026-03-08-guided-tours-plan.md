# Guided Tours Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add driver.js guided tours that fire on the demo account, with 3 tour groups (Creative Suite, Performance, Library) and purple animated theme.

**Architecture:** driver.js popover tours triggered by demo account detection (`act_999888777666`). `data-tour` attributes on target elements. Session-scoped dismiss via `sessionStorage`. Settings toggle to re-enable. Tours are page-scoped — each page within a group has its own step set that fires independently.

**Tech Stack:** driver.js, React hooks, sessionStorage, Tailwind CSS

---

### Task 1: Install driver.js

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `cd /Users/masterphelps/killscale/killscale-app && npm install driver.js`

**Step 2: Verify install**

Run: `grep driver.js package.json`
Expected: `"driver.js": "^1.x.x"`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install driver.js for guided tours"
```

---

### Task 2: Tour config + purple theme CSS

**Files:**
- Create: `lib/tour/config.ts`
- Create: `app/tour-theme.css`

**Step 1: Create tour config with driver.js theme overrides**

`lib/tour/config.ts`:
```typescript
import type { Config } from 'driver.js'

export const DEMO_ACCOUNT_ID = 'act_999888777666'

export const tourConfig: Config = {
  animate: true,
  showProgress: true,
  showButtons: ['next', 'previous', 'close'],
  overlayColor: 'rgba(0, 0, 0, 0.75)',
  stagePadding: 8,
  stageRadius: 12,
  popoverClass: 'ks-tour-popover',
  progressText: '{{current}} of {{total}}',
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',
}

export const TOUR_SECTIONS = ['creative-suite', 'performance', 'library'] as const
export type TourSection = typeof TOUR_SECTIONS[number]

// Map pathnames to tour sections
export function getTourSection(pathname: string): TourSection | null {
  if (pathname.includes('/creative-studio/ad-studio')) return 'creative-suite'
  if (pathname.includes('/creative-studio/ai-tasks')) return 'creative-suite'
  if (pathname === '/dashboard/creative-studio' || pathname === '/dashboard/creative-studio/') return 'creative-suite'
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'performance'
  if (pathname.includes('/dashboard/trends')) return 'performance'
  if (pathname.includes('/dashboard/insights')) return 'performance'
  if (pathname.includes('/creative-studio/active')) return 'library'
  if (pathname.includes('/creative-studio/media')) return 'library'
  if (pathname.includes('/creative-studio/best-copy')) return 'library'
  return null
}

// Map pathnames to specific page tour keys
export function getTourPage(pathname: string): string | null {
  if (pathname.includes('/creative-studio/ad-studio')) return 'ad-studio'
  if (pathname.includes('/creative-studio/ai-tasks')) return 'ai-tasks'
  if (pathname === '/dashboard/creative-studio' || pathname === '/dashboard/creative-studio/') return 'cs-overview'
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'dashboard'
  if (pathname.includes('/dashboard/trends')) return 'trends'
  if (pathname.includes('/dashboard/insights')) return 'insights'
  if (pathname.includes('/creative-studio/active')) return 'active-ads'
  if (pathname.includes('/creative-studio/media')) return 'media'
  if (pathname.includes('/creative-studio/best-copy')) return 'copy'
  return null
}
```

**Step 2: Create purple theme CSS**

`app/tour-theme.css`:
```css
/* driver.js purple theme for KillScale */
.driver-popover.ks-tour-popover {
  background: #1e1e2f;
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(139, 92, 246, 0.15), 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #f4f4f5;
  padding: 20px;
  max-width: 360px;
}

.driver-popover.ks-tour-popover .driver-popover-title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 4px;
}

.driver-popover.ks-tour-popover .driver-popover-description {
  font-size: 14px;
  color: #a1a1aa;
  line-height: 1.5;
}

.driver-popover.ks-tour-popover .driver-popover-progress-text {
  font-size: 12px;
  color: #71717a;
  font-weight: 500;
}

/* Progress bar */
.driver-popover.ks-tour-popover .driver-popover-progress-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Next / Done button — purple */
.driver-popover.ks-tour-popover .driver-popover-next-btn,
.driver-popover.ks-tour-popover .driver-popover-done-btn {
  background: #8B5CF6;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.driver-popover.ks-tour-popover .driver-popover-next-btn:hover,
.driver-popover.ks-tour-popover .driver-popover-done-btn:hover {
  background: #7C3AED;
}

/* Back button — ghost */
.driver-popover.ks-tour-popover .driver-popover-prev-btn {
  background: transparent;
  color: #a1a1aa;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.driver-popover.ks-tour-popover .driver-popover-prev-btn:hover {
  color: #f4f4f5;
  border-color: #71717a;
}

/* Close button */
.driver-popover.ks-tour-popover .driver-popover-close-btn {
  color: #71717a;
}

.driver-popover.ks-tour-popover .driver-popover-close-btn:hover {
  color: #f4f4f5;
}

/* Arrow */
.driver-popover.ks-tour-popover .driver-popover-arrow {
  border: 5px solid transparent;
}

.driver-popover.ks-tour-popover .driver-popover-arrow-side-left {
  border-right-color: #1e1e2f;
}

.driver-popover.ks-tour-popover .driver-popover-arrow-side-right {
  border-left-color: #1e1e2f;
}

.driver-popover.ks-tour-popover .driver-popover-arrow-side-top {
  border-bottom-color: #1e1e2f;
}

.driver-popover.ks-tour-popover .driver-popover-arrow-side-bottom {
  border-top-color: #1e1e2f;
}

/* Highlighted element glow */
.driver-active-element {
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.4) !important;
  border-radius: 12px;
}
```

**Step 3: Import CSS in root layout**

Modify: `app/layout.tsx` — add `import './tour-theme.css'` alongside existing CSS imports.

**Step 4: Commit**

```bash
git add lib/tour/config.ts app/tour-theme.css app/layout.tsx
git commit -m "feat: tour config + purple theme CSS for driver.js"
```

---

### Task 3: Tour step definitions

**Files:**
- Create: `lib/tour/steps/creative-suite.ts`
- Create: `lib/tour/steps/performance.ts`
- Create: `lib/tour/steps/library.ts`

**Step 1: Creative Suite tour steps**

`lib/tour/steps/creative-suite.ts`:
```typescript
import type { DriveStep } from 'driver.js'

export const adStudioSteps: DriveStep[] = [
  {
    element: '[data-tour="oracle-box"]',
    popover: {
      title: 'Oracle AI',
      description: 'Type anything here to create ads — describe your product, paste a URL, or ask for help. Oracle figures out what you need.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="oracle-chips"]',
    popover: {
      title: 'Quick Actions',
      description: 'Shortcuts for the most common tasks. Create image ads, video ads, clone winning creatives, or get inspiration from competitors.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="oracle-mode-toggle"]',
    popover: {
      title: 'Output Mode',
      description: 'Switch between Image, Video, and KS modes. Each mode unlocks different creative tools.',
      side: 'bottom',
      align: 'center',
    },
  },
]

export const csOverviewSteps: DriveStep[] = [
  {
    element: '[data-tour="score-cards"]',
    popover: {
      title: 'Funnel Scores',
      description: 'Every creative gets scored on 4 stages: Hook (stops the scroll), Hold (keeps watching), Click (drives action), Convert (makes the sale).',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="funnel-filter-bar"]',
    popover: {
      title: 'Filter by Score',
      description: 'Click any score pill to filter your creatives. Set minimum thresholds to find your top performers.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="view-toggle"]',
    popover: {
      title: 'Gallery or Table',
      description: 'Switch between visual gallery cards and a detailed data table.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="sort-controls"]',
    popover: {
      title: 'Sort Creatives',
      description: 'Sort by any score, spend, ROAS, or date. Find your winners fast.',
      side: 'bottom',
      align: 'center',
    },
  },
]

export const aiTasksSteps: DriveStep[] = [
  {
    element: '[data-tour="ai-tasks-list"]',
    popover: {
      title: 'Your AI Sessions',
      description: 'Every ad you generate, video you create, or conversation with Oracle is saved here. Pick up where you left off anytime.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="ai-tasks-continue"]',
    popover: {
      title: 'Continue in Studio',
      description: 'Click to jump back into Ad Studio with all your previous work restored.',
      side: 'left',
      align: 'center',
    },
  },
]
```

**Step 2: Performance tour steps**

`lib/tour/steps/performance.ts`:
```typescript
import type { DriveStep } from 'driver.js'

export const dashboardSteps: DriveStep[] = [
  {
    element: '[data-tour="stat-cards"]',
    popover: {
      title: 'Key Metrics',
      description: 'Your total spend, revenue, ROAS, and purchases at a glance. These update based on the date range and account you select.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="performance-table"]',
    popover: {
      title: 'Campaign Performance',
      description: 'All your campaigns, ad sets, and ads in one place. Click any row to expand and see the hierarchy underneath.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="verdict-example"]',
    popover: {
      title: 'Verdicts',
      description: 'Scale (green) = winning. Watch (yellow) = promising. Kill (red) = cut it. Learn (gray) = needs more spend. Based on your ROAS rules.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="include-paused"]',
    popover: {
      title: 'Show Paused',
      description: 'Toggle to include or hide paused campaigns and ad sets. Hidden by default so you focus on what\'s running.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="view-mode-toggle"]',
    popover: {
      title: 'Simple vs Detailed',
      description: 'Simple shows key metrics. Detailed adds CTR, CPC, frequency, and more columns for deep analysis.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="create-campaign-btn"]',
    popover: {
      title: 'Launch Campaigns',
      description: 'Create new campaigns, ad sets, or ads directly from here. No need to open Ads Manager.',
      side: 'left',
      align: 'center',
    },
  },
]

export const trendsSteps: DriveStep[] = [
  {
    element: '[data-tour="trends-chart"]',
    popover: {
      title: 'Performance Trends',
      description: 'See how your metrics change over the last 30 days. Spot patterns before they become problems.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="trends-metrics"]',
    popover: {
      title: 'Choose Metrics',
      description: 'Pick which metrics to plot — spend, revenue, ROAS, CTR, and more.',
      side: 'bottom',
      align: 'center',
    },
  },
]

export const insightsSteps: DriveStep[] = [
  {
    element: '[data-tour="andromeda-score"]',
    popover: {
      title: 'Andromeda Score',
      description: 'Audits your account structure against Meta\'s Andromeda ML best practices. Higher score = better delivery and lower costs.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="health-score"]',
    popover: {
      title: 'Health Score',
      description: 'Measures overall performance health — budget efficiency, creative fatigue, profitability, and trend direction.',
      side: 'left',
      align: 'center',
    },
  },
]
```

**Step 3: Library tour steps**

`lib/tour/steps/library.ts`:
```typescript
import type { DriveStep } from 'driver.js'

export const activeAdsSteps: DriveStep[] = [
  {
    element: '[data-tour="active-ads-grid"]',
    popover: {
      title: 'Your Active Ads',
      description: 'Every ad currently running (or recently paused) with its creative and performance metrics. Videos play on hover.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="active-ads-status-filter"]',
    popover: {
      title: 'Filter by Status',
      description: 'Toggle between active and paused ads to review what\'s running and what you\'ve turned off.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="launch-new-ad"]',
    popover: {
      title: 'Launch New Ads',
      description: 'Create a new ad directly. Opens the Launch Wizard where you pick your campaign, targeting, and creative.',
      side: 'left',
      align: 'center',
    },
  },
]

export const mediaSteps: DriveStep[] = [
  {
    element: '[data-tour="media-gallery"]',
    popover: {
      title: 'Media Library',
      description: 'All your creative assets in one place — images and videos synced from Meta plus anything you\'ve generated with AI.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="media-card"]',
    popover: {
      title: 'Click for Details',
      description: 'Click any asset to open the Theater view with full metrics, video playback, and action buttons.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="starred-bar"]',
    popover: {
      title: 'Star & Build',
      description: 'Star your best creatives, then click "Build Ads" to combine them into a new Performance Set campaign.',
      side: 'top',
      align: 'center',
    },
  },
]

export const copySteps: DriveStep[] = [
  {
    element: '[data-tour="copy-list"]',
    popover: {
      title: 'Ad Copy Library',
      description: 'All your ad copy variations ranked by performance. AI-generated copy shows an "AI" badge.',
      side: 'top',
      align: 'center',
    },
  },
]
```

**Step 4: Commit**

```bash
git add lib/tour/steps/
git commit -m "feat: tour step definitions for all 3 sections"
```

---

### Task 4: useTour hook

**Files:**
- Create: `lib/tour/use-tour.ts`

**Step 1: Create the hook**

`lib/tour/use-tour.ts`:
```typescript
'use client'

import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { usePathname } from 'next/navigation'
import { useAccount } from '@/lib/account'
import { tourConfig, DEMO_ACCOUNT_ID, getTourPage } from './config'
import type { DriveStep } from 'driver.js'

// Import all step sets
import { adStudioSteps, csOverviewSteps, aiTasksSteps } from './steps/creative-suite'
import { dashboardSteps, trendsSteps, insightsSteps } from './steps/performance'
import { activeAdsSteps, mediaSteps, copySteps } from './steps/library'

const PAGE_STEPS: Record<string, DriveStep[]> = {
  'ad-studio': adStudioSteps,
  'cs-overview': csOverviewSteps,
  'ai-tasks': aiTasksSteps,
  'dashboard': dashboardSteps,
  'trends': trendsSteps,
  'insights': insightsSteps,
  'active-ads': activeAdsSteps,
  'media': mediaSteps,
  'copy': copySteps,
}

function isDismissed(page: string): boolean {
  if (typeof window === 'undefined') return true
  return sessionStorage.getItem(`ks_tour_dismissed_${page}`) === 'true'
}

function dismiss(page: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(`ks_tour_dismissed_${page}`, 'true')
}

export function clearAllDismissals(): void {
  if (typeof window === 'undefined') return
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith('ks_tour_dismissed_')) {
      sessionStorage.removeItem(key)
    }
  })
}

export function dismissAllTours(): void {
  if (typeof window === 'undefined') return
  Object.keys(PAGE_STEPS).forEach(page => {
    sessionStorage.setItem(`ks_tour_dismissed_${page}`, 'true')
  })
}

export function useTour() {
  const pathname = usePathname()
  const { currentAccountId } = useAccount()
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)
  const lastPageRef = useRef<string | null>(null)

  useEffect(() => {
    // Only fire on demo account
    if (currentAccountId !== DEMO_ACCOUNT_ID) return

    const page = getTourPage(pathname)
    if (!page) return
    if (isDismissed(page)) return

    // Don't re-fire if we already showed this page's tour
    if (lastPageRef.current === page) return
    lastPageRef.current = page

    const steps = PAGE_STEPS[page]
    if (!steps || steps.length === 0) return

    // Wait for page elements to render
    const timer = setTimeout(() => {
      // Verify at least the first element exists in DOM
      const firstEl = steps[0].element
      if (typeof firstEl === 'string' && !document.querySelector(firstEl)) return

      // Filter steps to only those with existing DOM elements
      const availableSteps = steps.filter(step => {
        if (typeof step.element === 'string') {
          return document.querySelector(step.element) !== null
        }
        return true
      })

      if (availableSteps.length === 0) return

      driverRef.current = driver({
        ...tourConfig,
        steps: availableSteps,
        onDestroyStarted: () => {
          dismiss(page)
          driverRef.current?.destroy()
        },
        onDestroyed: () => {
          dismiss(page)
        },
      })

      driverRef.current.drive()
    }, 800) // Wait for content to load

    return () => {
      clearTimeout(timer)
      if (driverRef.current) {
        driverRef.current.destroy()
        driverRef.current = null
      }
    }
  }, [pathname, currentAccountId])

  return { clearAllDismissals, dismissAllTours }
}
```

**Step 2: Commit**

```bash
git add lib/tour/use-tour.ts
git commit -m "feat: useTour hook with demo account detection + session dismiss"
```

---

### Task 5: Add data-tour attributes to target elements

This is the largest task — adding `data-tour` attributes to existing components.

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`
- Modify: `app/dashboard/creative-studio/page.tsx`
- Modify: `app/dashboard/creative-studio/ai-tasks/page.tsx`
- Modify: `app/dashboard/creative-studio/active/page.tsx`
- Modify: `app/dashboard/creative-studio/media/page.tsx` (if exists) or `app/dashboard/creative-studio/page.tsx` media section
- Modify: `app/dashboard/creative-studio/best-copy/page.tsx`
- Modify: `app/dashboard/trends/page.tsx`
- Modify: `app/dashboard/insights/page.tsx` (if exists)
- Modify: `components/creative-studio/oracle-box.tsx`
- Modify: `components/creative-studio/oracle-chips.tsx`
- Modify: `components/creative-studio/funnel-filter-bar.tsx`

**Step 1: Dashboard — add data-tour attributes**

In `app/dashboard/page.tsx`, find and wrap these elements:

1. Stat cards grid (`grid grid-cols-2 lg:grid-cols-4 gap-3`) → add `data-tour="stat-cards"`
2. Performance table wrapper → add `data-tour="performance-table"`
3. First verdict badge in table (or wrapper) → add `data-tour="verdict-example"`
4. Include paused checkbox → add `data-tour="include-paused"`
5. Simple/Detailed toggle → add `data-tour="view-mode-toggle"`
6. "+ Create" button → add `data-tour="create-campaign-btn"`

**Step 2: Ad Studio — add data-tour attributes**

In `app/dashboard/creative-studio/ad-studio/page.tsx`:
- Oracle box wrapper → add `data-tour="oracle-box"` (or in `oracle-box.tsx`)
- Oracle chips wrapper → add `data-tour="oracle-chips"` (or in `oracle-chips.tsx`)
- Mode toggle area → add `data-tour="oracle-mode-toggle"`

In `components/creative-studio/oracle-box.tsx`:
- Outer container div → add `data-tour="oracle-box"`

In `components/creative-studio/oracle-chips.tsx`:
- Outer container div → add `data-tour="oracle-chips"`

**Step 3: Creative Studio Overview — add data-tour attributes**

In `app/dashboard/creative-studio/page.tsx`:
- Score cards grid → add `data-tour="score-cards"`
- Gallery/table toggle → add `data-tour="view-toggle"`
- Sort controls → add `data-tour="sort-controls"`

In `components/creative-studio/funnel-filter-bar.tsx`:
- Outer container → add `data-tour="funnel-filter-bar"`

**Step 4: AI Tasks — add data-tour attributes**

In `app/dashboard/creative-studio/ai-tasks/page.tsx`:
- Tasks list container → add `data-tour="ai-tasks-list"`
- First "Continue in Studio" link → add `data-tour="ai-tasks-continue"`

**Step 5: Active Ads — add data-tour attributes**

In `app/dashboard/creative-studio/active/page.tsx`:
- Ads gallery grid → add `data-tour="active-ads-grid"`
- Status filter → add `data-tour="active-ads-status-filter"`
- Launch new ad button → add `data-tour="launch-new-ad"`

**Step 6: Media — add data-tour attributes**

In the media page:
- Gallery grid → add `data-tour="media-gallery"`
- First gallery card → add `data-tour="media-card"` (only first card)
- Starred bar → add `data-tour="starred-bar"`

**Step 7: Best Copy — add data-tour attributes**

In `app/dashboard/creative-studio/best-copy/page.tsx`:
- Copy list container → add `data-tour="copy-list"`

**Step 8: Trends — add data-tour attributes**

In `app/dashboard/trends/page.tsx`:
- Chart container → add `data-tour="trends-chart"`
- Metric selector → add `data-tour="trends-metrics"`

**Step 9: Insights — add data-tour attributes**

In `app/dashboard/insights/page.tsx`:
- Andromeda score card → add `data-tour="andromeda-score"`
- Health score card → add `data-tour="health-score"`

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add data-tour attributes to all tour target elements"
```

---

### Task 6: Wire useTour into dashboard layout

**Files:**
- Modify: `app/dashboard/layout.tsx`

**Step 1: Add useTour call to dashboard layout**

In `app/dashboard/layout.tsx`, inside the main layout component, add:

```typescript
import { useTour } from '@/lib/tour/use-tour'

// Inside the component body:
useTour()
```

This fires the hook on every page navigation within the dashboard. The hook internally checks if the demo account is active and if the current page has a tour.

**Step 2: Run build to verify no type errors**

Run: `cd /Users/masterphelps/killscale/killscale-app && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat: wire useTour hook into dashboard layout"
```

---

### Task 7: Settings guided tour toggle

**Files:**
- Modify: `app/dashboard/settings/page.tsx`

**Step 1: Add guided tour toggle to Settings > General**

Find the General section in settings. When the demo workspace is active (`currentAccountId === 'act_999888777666'`), render a toggle:

```tsx
import { clearAllDismissals, dismissAllTours } from '@/lib/tour/use-tour'

// In the General section, when demo account is active:
{currentAccountId === DEMO_ACCOUNT_ID && (
  <div data-tour="guided-tour-toggle" className="flex items-center justify-between p-4 bg-bg-card rounded-xl border border-border">
    <div>
      <h3 className="text-sm font-semibold text-zinc-100">Guided Tour</h3>
      <p className="text-xs text-zinc-500 mt-0.5">
        Enable walkthroughs when browsing the demo account
      </p>
    </div>
    <button
      onClick={() => {
        const isCurrentlyOn = !sessionStorage.getItem('ks_tours_disabled')
        if (isCurrentlyOn) {
          dismissAllTours()
          sessionStorage.setItem('ks_tours_disabled', 'true')
        } else {
          clearAllDismissals()
          sessionStorage.removeItem('ks_tours_disabled')
        }
        // Force re-render
        setTourEnabled(!isCurrentlyOn)
      }}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors',
        tourEnabled ? 'bg-violet-500' : 'bg-zinc-700'
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
        tourEnabled && 'translate-x-5'
      )} />
    </button>
  </div>
)}
```

Add state: `const [tourEnabled, setTourEnabled] = useState(() => !sessionStorage.getItem('ks_tours_disabled'))`

Also import `DEMO_ACCOUNT_ID` from `@/lib/tour/config`.

**Step 2: Update useTour hook to respect global disable**

In `lib/tour/use-tour.ts`, add check:

```typescript
// At the top of the useEffect, after demo account check:
if (sessionStorage.getItem('ks_tours_disabled') === 'true') return
```

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/dashboard/settings/page.tsx lib/tour/use-tour.ts
git commit -m "feat: guided tour toggle in Settings when demo account active"
```

---

### Task 8: Test end-to-end

**Step 1: Start dev server**

Run: `lsof -ti:3000 | xargs kill -9 2>/dev/null; cd /Users/masterphelps/killscale/killscale-app && npm run dev`

**Step 2: Manual testing checklist**

1. Log in → Demo Store should be selected → navigate to Dashboard → tour should fire with purple theme
2. Click through all dashboard tour steps → verify progress bar shows "1 of 6", etc.
3. Dismiss tour → navigate away and back → tour should NOT fire again (session dismissed)
4. Navigate to Ad Studio → different tour should fire (Oracle box, chips steps)
5. Navigate to Creative Studio Overview → tour for score cards should fire
6. Switch to a real account → no tours should fire on any page
7. Switch back to demo account → tours should fire again (new session context)
8. Go to Settings > General → guided tour toggle should be visible
9. Toggle OFF → navigate to any page → no tours
10. Toggle ON → navigate → tours fire again

**Step 3: Final build check**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: guided tours with driver.js — complete implementation"
```
