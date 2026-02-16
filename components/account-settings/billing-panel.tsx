'use client'

import { useState, useEffect } from 'react'
import { Loader2, ExternalLink, Sparkles, Zap, CheckCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface AiUsage {
  used: number
  planLimit: number
  purchased: number
  totalAvailable: number
  remaining: number
  status: string
  history?: Array<{
    generation_type: string
    generation_label: string
    credit_cost: number
    created_at: string
  }>
}

const PACKS = [
  { id: 'pack_100', credits: 100, price: '$20' },
  { id: 'pack_250', credits: 250, price: '$50' },
  { id: 'pack_500', credits: 500, price: '$100' },
  { id: 'pack_1000', credits: 1000, price: '$200' },
]

export function BillingPanel() {
  const { user } = useAuth()
  const { plan, subscription } = useSubscription()

  const [billingLoading, setBillingLoading] = useState(false)
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null)
  const [showUsageLog, setShowUsageLog] = useState(false)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    fetch(`/api/ai/usage?userId=${user.id}&includeHistory=true`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setAiUsage(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user])

  const handleOpenBillingPortal = async () => {
    if (!user) return
    setBillingLoading(true)

    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Unable to open billing portal')
      }
    } catch {
      alert('Failed to open billing portal')
    } finally {
      setBillingLoading(false)
    }
  }

  const handleBuyCredits = async (packId: string) => {
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
    } catch {
      console.error('Failed to create checkout')
    } finally {
      setPurchasing(null)
    }
  }

  const isTrialing = subscription?.status === 'trialing'
  const isActive = subscription?.status === 'active'
  const trialDaysLeft = subscription?.current_period_end
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-6">Plan & Billing</h2>

      {/* Current Plan */}
      <div className="p-4 bg-bg-card border border-border rounded-xl mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{plan || 'Free'} Plan</span>
              {isActive && (
                <span className="px-2 py-0.5 bg-verdict-scale/20 text-verdict-scale text-xs rounded">Active</span>
              )}
              {isTrialing && (
                <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded">Trial</span>
              )}
            </div>
            {isTrialing ? (
              <p className="text-sm text-amber-400 mt-1">{trialDaysLeft} days remaining</p>
            ) : subscription?.current_period_end ? (
              <p className="text-xs text-zinc-500 mt-1">
                Renews {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          <Link
            href="/pricing"
            className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            {isTrialing ? 'Subscribe' : plan === 'None' ? 'View Plans' : 'Change Plan'}
          </Link>
        </div>

        {/* Plan Features */}
        {(isActive || isTrialing) && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                Unlimited campaigns
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                3 ad accounts
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                First Party Pixel
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                Workspaces
              </div>
            </div>
          </div>
        )}

        {(isActive || isTrialing) && (
          <button
            onClick={handleOpenBillingPortal}
            disabled={billingLoading}
            className="w-full px-3 py-2.5 bg-bg-dark border border-border rounded-lg text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {billingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Manage Billing & Invoices
          </button>
        )}
      </div>

      {/* AI Credits */}
      {aiUsage && aiUsage.totalAvailable > 0 && (
        <div className="p-4 bg-bg-card border border-border rounded-xl mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium">AI Credits</span>
            </div>
            <button
              onClick={() => setShowUsageLog(!showUsageLog)}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              {showUsageLog ? 'Hide Usage' : 'See Usage'}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  aiUsage.remaining <= 0 ? 'bg-red-500'
                    : aiUsage.remaining <= aiUsage.totalAvailable * 0.2 ? 'bg-amber-500'
                    : 'bg-purple-500'
                )}
                style={{ width: `${Math.min(100, (aiUsage.used / aiUsage.totalAvailable) * 100)}%` }}
              />
            </div>
            <span className="text-sm font-mono tabular-nums text-zinc-400 whitespace-nowrap">
              {aiUsage.used} / {aiUsage.totalAvailable}
            </span>
          </div>

          {aiUsage.purchased > 0 && (
            <p className="text-xs text-zinc-500 mb-1">{aiUsage.planLimit} plan + {aiUsage.purchased} purchased</p>
          )}

          {aiUsage.remaining <= 0 && (
            <p className="text-xs text-red-400 mb-2">
              Limit reached{aiUsage.status === 'active' ? ' -- resets next month' : ''}
            </p>
          )}

          {/* Usage Log */}
          {showUsageLog && (
            <div className="mt-3">
              {aiUsage.history && aiUsage.history.length > 0 ? (
                <div className="max-h-40 overflow-y-auto border border-border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-zinc-500">
                        <th className="text-left px-3 py-1.5">Date</th>
                        <th className="text-left px-3 py-1.5">Type</th>
                        <th className="text-right px-3 py-1.5">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiUsage.history.map((entry, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-1.5 text-zinc-500 tabular-nums">
                            {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-3 py-1.5 text-zinc-300">
                            {entry.generation_label || entry.generation_type || 'Image'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">
                            {entry.credit_cost || 5}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No usage yet this period.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Buy Credits */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium">Buy More Credits</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {PACKS.map(pack => (
            <button
              key={pack.id}
              onClick={() => handleBuyCredits(pack.id)}
              disabled={purchasing === pack.id}
              className="p-3 bg-bg-dark border border-border rounded-lg hover:border-zinc-500 transition-colors text-center disabled:opacity-50"
            >
              <div className="text-sm font-medium">{pack.credits} credits</div>
              <div className="text-xs text-zinc-500">{pack.price}</div>
              {purchasing === pack.id && <Loader2 className="w-3 h-3 animate-spin mx-auto mt-1" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
