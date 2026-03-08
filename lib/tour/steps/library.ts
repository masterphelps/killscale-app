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
