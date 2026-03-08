'use client'

import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { usePathname } from 'next/navigation'
import { useAccount } from '@/lib/account'
import { tourConfig, DEMO_ACCOUNT_ID, getTourPage } from './config'
import type { DriveStep } from 'driver.js'

// Import all step sets
import { launchpadSteps } from './steps/launchpad'
import { adStudioSteps, csOverviewSteps, aiTasksSteps } from './steps/creative-suite'
import { dashboardSteps, trendsSteps, insightsSteps } from './steps/performance'
import { activeAdsSteps, mediaSteps, copySteps } from './steps/library'

const PAGE_STEPS: Record<string, DriveStep[]> = {
  'launchpad': launchpadSteps,
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

    // Respect global disable
    if (sessionStorage.getItem('ks_tours_disabled') === 'true') return

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
