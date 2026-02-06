'use client'

import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LandingPage {
  url: string
  domain: string
  count: number
  percentage: number
}

interface CompetitorLandingPagesProps {
  landingPages: LandingPage[]
}

export function CompetitorLandingPages({ landingPages }: CompetitorLandingPagesProps) {
  if (landingPages.length === 0) {
    return (
      <div className="text-center py-4 text-zinc-500 text-sm">
        No landing pages found
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {landingPages.map((page, index) => (
        <div key={page.domain} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <a
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-accent truncate transition-colors"
            >
              <span className="truncate">{page.domain}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
            <span className="text-xs text-zinc-500 font-mono flex-shrink-0">
              {page.count} ads ({page.percentage}%)
            </span>
          </div>
          <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                index === 0 ? 'bg-accent' : 'bg-zinc-600'
              )}
              style={{ width: `${page.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
