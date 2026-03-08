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
