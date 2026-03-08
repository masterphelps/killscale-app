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
  if (pathname.includes('/dashboard/launchpad')) return 'creative-suite'
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
  if (pathname.includes('/dashboard/launchpad')) return 'launchpad'
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
