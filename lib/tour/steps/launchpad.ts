import type { DriveStep } from 'driver.js'

export const launchpadSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to KillScale!',
      description: 'This is your demo account with real-looking ad data. We\'ll walk you through the key features — starting with the most powerful one.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="launchpad-ad-studio"]',
    popover: {
      title: 'Start Here → Ad Studio',
      description: 'This is your AI command center. Generate ad images, videos, copy — all powered by Oracle AI. Click here first.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="launchpad-performance"]',
    popover: {
      title: 'Performance Dashboard',
      description: 'See all your campaigns with instant Scale/Watch/Kill verdicts. Your demo account has 6 campaigns with 30 days of data.',
      side: 'bottom',
      align: 'center',
    },
  },
]
