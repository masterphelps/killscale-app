'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MetaLogo, GoogleLogo } from './platform-logos'

interface Metric {
  label: string
  value: string
  meta?: string
  google?: string
}

interface SecondaryStatsPillsProps {
  metrics: Metric[]
  expandable?: boolean
  className?: string
}

export function SecondaryStatsPills({
  metrics,
  expandable = false,
  className
}: SecondaryStatsPillsProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('mb-6', className)}>
      {/* Pills row */}
      <div
        className={cn(
          'flex items-center justify-between flex-wrap gap-y-2',
          'bg-bg-card border border-border rounded-lg px-4 py-2.5'
        )}
      >
        <div className="flex items-center gap-4 lg:gap-6 flex-wrap">
          {metrics.map((metric, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 uppercase">{metric.label}</span>
              <span className="text-sm font-mono text-zinc-300">{metric.value}</span>
            </div>
          ))}
        </div>

        {expandable && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Details
            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 bg-bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((metric, i) => (
              <div key={i}>
                <span className="text-[10px] text-zinc-500 uppercase block mb-1">{metric.label}</span>
                <div className="text-lg font-mono text-white">{metric.value}</div>
                {(metric.meta || metric.google) && (
                  <div className="flex gap-3 mt-2">
                    {metric.meta && (
                      <div className="flex items-center gap-1">
                        <MetaLogo size="sm" />
                        <span className="text-xs text-zinc-400">{metric.meta}</span>
                      </div>
                    )}
                    {metric.google && (
                      <div className="flex items-center gap-1">
                        <GoogleLogo size="sm" />
                        <span className="text-xs text-zinc-400">{metric.google}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
