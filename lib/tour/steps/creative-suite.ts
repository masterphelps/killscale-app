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
