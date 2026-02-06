'use client'

import { cn } from '@/lib/utils'
import { BarChart3, Sparkles, Info, Lock } from 'lucide-react'

export type TheaterTab = 'performance' | 'analysis' | 'details'

interface TheaterTabsProps {
  activeTab: TheaterTab
  onTabChange: (tab: TheaterTab) => void
  isVideo: boolean
  isPro: boolean
  hasAnalysis: boolean
}

export function TheaterTabs({
  activeTab,
  onTabChange,
  isVideo,
  isPro,
  hasAnalysis
}: TheaterTabsProps) {
  const tabs: { id: TheaterTab; label: string; icon: React.ReactNode; disabled?: boolean; badge?: React.ReactNode }[] = [
    {
      id: 'performance',
      label: 'Performance',
      icon: <BarChart3 className="w-4 h-4" />
    },
    {
      id: 'analysis',
      label: 'AI Analysis',
      icon: <Sparkles className="w-4 h-4" />,
      disabled: !isVideo,
      badge: !isPro ? <Lock className="w-3 h-3" /> : hasAnalysis ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : null
    },
    {
      id: 'details',
      label: 'Details',
      icon: <Info className="w-4 h-4" />
    },
  ]

  return (
    <div className="flex border-b border-border">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const isDisabled = tab.disabled

        return (
          <button
            key={tab.id}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            disabled={isDisabled}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors relative',
              isActive
                ? 'text-white'
                : isDisabled
                ? 'text-zinc-600 cursor-not-allowed'
                : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.badge && (
              <span className="ml-1">{tab.badge}</span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        )
      })}
    </div>
  )
}
