'use client'

import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'

export default function TrendsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Trends</h1>
        <p className="text-zinc-500">Track performance over time</p>
      </div>

      {/* Coming Soon State */}
      <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 bg-bg-dark rounded-full flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
        <p className="text-zinc-500 max-w-md mx-auto mb-6">
          Track your ROAS, spend, and revenue trends over time. Compare date ranges and spot patterns.
        </p>
        <div className="flex items-center justify-center gap-4 text-sm text-zinc-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Week over week
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-verdict-scale" />
            Growth tracking
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-verdict-cut" />
            Drop alerts
          </div>
        </div>
      </div>

      {/* Placeholder Charts */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="bg-bg-card border border-border rounded-xl p-6">
          <h3 className="font-medium mb-4">ROAS Over Time</h3>
          <div className="h-48 bg-bg-dark rounded-lg flex items-center justify-center text-zinc-600">
            Chart coming soon
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-6">
          <h3 className="font-medium mb-4">Spend vs Revenue</h3>
          <div className="h-48 bg-bg-dark rounded-lg flex items-center justify-center text-zinc-600">
            Chart coming soon
          </div>
        </div>
      </div>
    </div>
  )
}
