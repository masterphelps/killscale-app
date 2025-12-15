'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, Lock, DollarSign, TrendingUp, ShoppingCart, BarChart3,
  Plus, X, ChevronDown, ChevronRight, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Types
interface Ad {
  adId: string
  adName: string
  spend: number
  spendPercentage: number
}

interface AdSet {
  adsetId: string
  adsetName: string
  ads: Ad[]
}

interface Campaign {
  campaignId: string
  campaignName: string
  adsets: AdSet[]
}

interface PerformanceItem {
  campaignId: string
  campaignName: string
  campaignStatus: string
  isCbo: boolean
  adsetId: string
  adsetName: string
  adsetStatus: string
  dailyBudget: number
  adId: string
  adName: string
  status: string
  spend: number
  purchases: number
  revenue: number
  impressions: number
  clicks: number
  roas: number
  ctr: number
  cpc: number
  verdict: string
}

interface TrendPoint {
  date: string
  spend: number
  revenue: number
  roas: number
}

interface PortalData {
  workspace: { id: string; name: string }
  summary: {
    spend: number
    revenue: number
    purchases: number
    roas: number
    adCount: number
    verdictCounts: {
      scale: number
      watch: number
      kill: number
      learn: number
    }
  }
  performance: PerformanceItem[]
  trends: TrendPoint[]
  activeHierarchy: Campaign[]
  pixelId: string | null
  rules: {
    scaleRoas: number
    minRoas: number
    learningSpend: number
  }
}

export default function PortalPage() {
  const params = useParams()
  const token = params.token as string

  const [pin, setPin] = useState('')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [portalData, setPortalData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('7')

  // Manual event modal state
  const [showLogModal, setShowLogModal] = useState(false)
  const [logValue, setLogValue] = useState('100')
  const [logAttribution, setLogAttribution] = useState<'top' | 'select'>('top')
  const [logSelectedAd, setLogSelectedAd] = useState<string | null>(null)
  const [logNotes, setLogNotes] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())

  // Helpers for manual event
  const getAllAdsFromHierarchy = () => {
    if (!portalData) return []
    return portalData.activeHierarchy.flatMap(c =>
      c.adsets.flatMap(as => as.ads)
    ).sort((a, b) => b.spend - a.spend)
  }

  const getTopSpenderAd = () => {
    const allAds = getAllAdsFromHierarchy()
    return allAds.length > 0 ? allAds[0] : null
  }

  const getTotalAdCount = () => {
    if (!portalData) return 0
    return portalData.activeHierarchy.reduce((sum, c) =>
      sum + c.adsets.reduce((s, as) => s + as.ads.length, 0), 0
    )
  }

  // Check for existing session
  useEffect(() => {
    const stored = localStorage.getItem(`portal_session_${token}`)
    if (stored) {
      setSessionToken(stored)
    }
  }, [token])

  // Load data when authenticated
  useEffect(() => {
    if (sessionToken) {
      loadPortalData()
    }
  }, [sessionToken, dateRange])

  const handleAuth = async () => {
    if (pin.length < 4) {
      setAuthError('PIN must be at least 4 digits')
      return
    }

    setLoading(true)
    setAuthError(null)

    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      localStorage.setItem(`portal_session_${token}`, data.sessionToken)
      setSessionToken(data.sessionToken)
      setPin('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const loadPortalData = async () => {
    if (!sessionToken) return

    try {
      const res = await fetch(`/api/portal/data?dateRange=${dateRange}`, {
        headers: { 'x-portal-session': sessionToken }
      })

      if (res.status === 401) {
        localStorage.removeItem(`portal_session_${token}`)
        setSessionToken(null)
        return
      }

      const data = await res.json()
      setPortalData(data)
    } catch (err) {
      console.error('Failed to load portal data:', err)
    }
  }

  const handleLogEvent = async () => {
    const value = parseFloat(logValue)
    if (isNaN(value) || value <= 0) {
      setLogError('Please enter a valid amount')
      return
    }

    let adIdToUse: string | undefined = undefined
    const topAd = getTopSpenderAd()
    if (logAttribution === 'top' && topAd) {
      adIdToUse = topAd.adId
    } else if (logAttribution === 'select' && logSelectedAd) {
      adIdToUse = logSelectedAd
    }

    setLogLoading(true)
    setLogError(null)

    try {
      const res = await fetch('/api/pixel/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: portalData?.workspace.id,
          eventType: 'purchase',
          eventValue: value,
          adId: adIdToUse,
          notes: logNotes || undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log event')
      }

      setLogSuccess(true)
      setTimeout(() => {
        setShowLogModal(false)
        setLogSuccess(false)
        setLogValue('100')
        setLogAttribution('top')
        setLogSelectedAd(null)
        setLogNotes('')
        setExpandedCampaigns(new Set())
        setExpandedAdsets(new Set())
        loadPortalData()
      }, 1200)

    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to log event')
    } finally {
      setLogLoading(false)
    }
  }

  // PIN entry screen
  if (!sessionToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-white">Client Portal</h1>
            <p className="text-zinc-400 mt-2">Enter PIN to access dashboard</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {authError}
            </div>
          )}

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter PIN"
            maxLength={6}
            className="w-full text-center text-3xl tracking-widest py-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-accent"
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          />

          <button
            onClick={handleAuth}
            disabled={loading || pin.length < 4}
            className="w-full mt-4 py-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Access Dashboard'}
          </button>

          <p className="text-center text-zinc-600 text-xs mt-6">
            Powered by KillScale
          </p>
        </div>
      </div>
    )
  }

  // Loading state
  if (!portalData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  // Main dashboard view
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-accent">KillScale</p>
            <h1 className="text-xl font-bold text-white">{portalData.workspace.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <button
              onClick={() => setShowLogModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Log Event
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Spend
            </div>
            <p className="text-2xl font-bold text-white">
              ${portalData.summary.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <ShoppingCart className="w-4 h-4" />
              Revenue
            </div>
            <p className="text-2xl font-bold text-white">
              ${portalData.summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              ROAS
            </div>
            <p className={cn(
              "text-2xl font-bold",
              portalData.summary.roas >= portalData.rules.scaleRoas ? "text-emerald-400" :
              portalData.summary.roas >= portalData.rules.minRoas ? "text-yellow-400" : "text-red-400"
            )}>
              {portalData.summary.roas.toFixed(2)}x
            </p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <BarChart3 className="w-4 h-4" />
              Purchases
            </div>
            <p className="text-2xl font-bold text-white">
              {portalData.summary.purchases.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Trends Chart */}
        {portalData.trends.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-white mb-4">Performance Trends</h2>
            <div className="h-48 flex items-end gap-1">
              {portalData.trends.map((point, i) => {
                const maxRevenue = Math.max(...portalData.trends.map(t => t.revenue), 1)
                const height = (point.revenue / maxRevenue) * 100
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-accent/60 rounded-t transition-all hover:bg-accent"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${point.date}: $${point.revenue.toLocaleString()} revenue, ${point.roas.toFixed(2)}x ROAS`}
                    />
                    <span className="text-[10px] text-zinc-500 truncate w-full text-center">
                      {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Performance Table */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">Ad Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/50">
                <tr>
                  <th className="text-left text-zinc-400 font-medium px-4 py-3">Ad</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3">Spend</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3">Revenue</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {portalData.performance.slice(0, 20).map((item) => (
                  <tr key={item.adId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white font-medium truncate max-w-xs">{item.adName}</p>
                        <p className="text-xs text-zinc-500 truncate max-w-xs">{item.campaignName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      ${item.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      ${item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "font-medium",
                        item.roas >= portalData.rules.scaleRoas ? "text-emerald-400" :
                        item.roas >= portalData.rules.minRoas ? "text-yellow-400" : "text-red-400"
                      )}>
                        {item.roas.toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {portalData.performance.length === 0 && (
              <div className="p-8 text-center text-zinc-500">
                No ad data for this period
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Manual Event Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Log Manual Event</h2>
                <button onClick={() => setShowLogModal(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {logSuccess && (
                <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-center">
                  Event logged successfully!
                </div>
              )}

              {logError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {logError}
                </div>
              )}

              {!logSuccess && (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      <DollarSign className="w-4 h-4 inline mr-1" />
                      Event Value
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xl">$</span>
                      <input
                        type="number"
                        value={logValue}
                        onChange={(e) => setLogValue(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full pl-10 pr-4 py-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-2xl font-bold focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Attribute to
                    </label>
                    {getTotalAdCount() === 0 ? (
                      <div className="p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-500 text-center">
                        No active ads found. Event will be logged without ad attribution.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const topAd = getTopSpenderAd()
                          return topAd ? (
                            <label className={cn(
                              "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                              logAttribution === 'top' ? "border-accent bg-accent/10" : "border-zinc-700 hover:border-zinc-600"
                            )}>
                              <input type="radio" name="attribution" checked={logAttribution === 'top'}
                                onChange={() => { setLogAttribution('top'); setLogSelectedAd(topAd.adId) }}
                                className="sr-only" />
                              <div className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                                logAttribution === 'top' ? "border-accent bg-accent" : "border-zinc-500")}>
                                {logAttribution === 'top' && <div className="w-full h-full rounded-full bg-white scale-50" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-white font-medium">Top Spender</span>
                                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                                  {topAd.adName} • ${topAd.spend.toLocaleString()}
                                </p>
                              </div>
                            </label>
                          ) : null
                        })()}

                        <label className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                          logAttribution === 'select' ? "border-accent bg-accent/10" : "border-zinc-700 hover:border-zinc-600"
                        )}>
                          <input type="radio" name="attribution" checked={logAttribution === 'select'}
                            onChange={() => setLogAttribution('select')} className="sr-only" />
                          <div className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                            logAttribution === 'select' ? "border-accent bg-accent" : "border-zinc-500")}>
                            {logAttribution === 'select' && <div className="w-full h-full rounded-full bg-white scale-50" />}
                          </div>
                          <div className="flex-1">
                            <span className="text-white font-medium">Select Specific Ad</span>
                            <p className="text-xs text-zinc-500 mt-0.5">Choose which ad brought them in</p>
                          </div>
                        </label>

                        {logAttribution === 'select' && (
                          <div className="ml-4 max-h-48 overflow-y-auto bg-zinc-800/50 rounded-lg border border-zinc-700">
                            {portalData.activeHierarchy.map((campaign) => {
                              const isCampaignExpanded = expandedCampaigns.has(campaign.campaignId)
                              return (
                                <div key={campaign.campaignId}>
                                  <button type="button" onClick={() => {
                                    const newSet = new Set(expandedCampaigns)
                                    isCampaignExpanded ? newSet.delete(campaign.campaignId) : newSet.add(campaign.campaignId)
                                    setExpandedCampaigns(newSet)
                                  }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/50 text-left">
                                    {isCampaignExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                                    <span className="text-xs font-medium text-blue-400 truncate">{campaign.campaignName}</span>
                                  </button>
                                  {isCampaignExpanded && (
                                    <div className="border-l border-zinc-700 ml-5">
                                      {campaign.adsets.map((adset) => {
                                        const isAdsetExpanded = expandedAdsets.has(adset.adsetId)
                                        return (
                                          <div key={adset.adsetId}>
                                            <button type="button" onClick={() => {
                                              const newSet = new Set(expandedAdsets)
                                              isAdsetExpanded ? newSet.delete(adset.adsetId) : newSet.add(adset.adsetId)
                                              setExpandedAdsets(newSet)
                                            }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/50 text-left">
                                              {isAdsetExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
                                              <span className="text-xs font-medium text-purple-400 truncate">{adset.adsetName}</span>
                                            </button>
                                            {isAdsetExpanded && (
                                              <div className="border-l border-zinc-700 ml-5">
                                                {adset.ads.map((ad) => (
                                                  <label key={ad.adId} className={cn(
                                                    "flex items-center gap-2 px-3 py-2 cursor-pointer",
                                                    logSelectedAd === ad.adId ? "bg-accent/20" : "hover:bg-zinc-700/50"
                                                  )}>
                                                    <input type="radio" name="selectedAd" checked={logSelectedAd === ad.adId}
                                                      onChange={() => setLogSelectedAd(ad.adId)} className="sr-only" />
                                                    <div className={cn("w-3 h-3 rounded-full border-2",
                                                      logSelectedAd === ad.adId ? "border-accent bg-accent" : "border-zinc-600")}>
                                                      {logSelectedAd === ad.adId && <div className="w-full h-full rounded-full bg-white scale-50" />}
                                                    </div>
                                                    <span className="flex-1 text-xs text-white truncate">{ad.adName}</span>
                                                    <span className="text-xs text-zinc-500">${ad.spend.toLocaleString()}</span>
                                                  </label>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Notes (optional)</label>
                    <input type="text" value={logNotes} onChange={(e) => setLogNotes(e.target.value)}
                      placeholder="e.g., Walk-in customer, phone order"
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-accent" />
                  </div>

                  <button onClick={handleLogEvent}
                    disabled={logLoading || (logAttribution === 'select' && !logSelectedAd)}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors">
                    {logLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Log Event'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
