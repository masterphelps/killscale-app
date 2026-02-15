'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface CreditUsage {
  used: number
  planLimit: number
  purchased: number
  totalAvailable: number
  remaining: number
  status: string
}

export function CreditsGauge() {
  const { user } = useAuth()
  const [usage, setUsage] = useState<CreditUsage | null>(null)
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [purchasing, setPurchasing] = useState<string | null>(null)

  const fetchUsage = useCallback(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.totalAvailable !== undefined) setUsage(data)
      })
      .catch(() => {})
  }, [user?.id])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  if (!usage || usage.totalAvailable === 0) return null

  const pct = (usage.used / usage.totalAvailable) * 100
  const remainingPct = 100 - Math.min(100, pct)
  const color = remainingPct > 50 ? 'text-emerald-400' : remainingPct > 20 ? 'text-amber-400' : 'text-red-400'
  const bgColor = remainingPct > 50 ? 'bg-emerald-500/15' : remainingPct > 20 ? 'bg-amber-500/15' : 'bg-red-500/15'
  const barColor = remainingPct > 50 ? 'bg-emerald-500' : remainingPct > 20 ? 'bg-amber-500' : 'bg-red-500'

  const handleBuy = async (packId: string) => {
    if (!user?.id) return
    setPurchasing(packId)
    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, packId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Failed to create checkout:', err)
    } finally {
      setPurchasing(null)
    }
  }

  const PACKS = [
    { id: 'pack_100', credits: 100, price: '$20' },
    { id: 'pack_250', credits: 250, price: '$50' },
    { id: 'pack_500', credits: 500, price: '$100' },
    { id: 'pack_1000', credits: 1000, price: '$200' },
  ]

  return (
    <>
      <button
        onClick={() => setShowBuyModal(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${bgColor} ${color} hover:opacity-80`}
      >
        <Zap className="w-3 h-3" />
        <span className="tabular-nums">{usage.remaining}</span>
        <span className="text-zinc-500">/</span>
        <span className="tabular-nums text-zinc-400">{usage.totalAvailable}</span>
        <span className="hidden sm:inline text-zinc-500 ml-0.5">credits</span>
      </button>

      {/* Buy Credits Modal */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBuyModal(false)}>
          <div className="bg-bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Buy AI Credits</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Credits are used for AI image ({5} cr) and video ({50} cr) generation. Purchased credits are valid for the current billing month.
            </p>

            {/* Current usage bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                <span>Current usage</span>
                <span className="tabular-nums">{usage.used} / {usage.totalAvailable} credits used</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {usage.purchased > 0 && (
                <p className="text-xs text-zinc-500 mt-1">Includes {usage.purchased} purchased credits</p>
              )}
            </div>

            {/* Pack options */}
            <div className="space-y-2">
              {PACKS.map(pack => (
                <button
                  key={pack.id}
                  onClick={() => handleBuy(pack.id)}
                  disabled={!!purchasing}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-bg-dark hover:bg-bg-hover transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-purple-400">
                      <Zap className="w-4 h-4" />
                      <span className="font-semibold">{pack.credits}</span>
                    </div>
                    <span className="text-sm text-zinc-300">credits</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{pack.price}</span>
                    {purchasing === pack.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowBuyModal(false)}
              className="w-full mt-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
