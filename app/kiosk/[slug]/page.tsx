'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, DollarSign, Clock, Plus, Lock, X, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActiveAd {
  adId: string
  adName: string
  spend: number
  spendPercentage: number
}

interface AdSet {
  adsetId: string
  adsetName: string
  ads: ActiveAd[]
}

interface Campaign {
  campaignId: string
  campaignName: string
  adsets: AdSet[]
}

interface WalkinEntry {
  value: number
  notes: string | null
  time: string
}

interface KioskData {
  workspace: { id: string; name: string }
  stats: { spend: number; revenue: number; roas: number }
  recentWalkins: WalkinEntry[]
  activeHierarchy: Campaign[]
}

export default function KioskPage() {
  const params = useParams()
  const slug = params.slug as string

  const [pin, setPin] = useState('')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [kioskData, setKioskData] = useState<KioskData | null>(null)
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)

  // Manual event state
  const [logValue, setLogValue] = useState('100')
  const [logAttribution, setLogAttribution] = useState<'top' | 'select'>('top')
  const [logSelectedAd, setLogSelectedAd] = useState<string | null>(null)
  const [logNotes, setLogNotes] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())

  // Helper to get all ads from hierarchy
  const getAllAdsFromHierarchy = () => {
    if (!kioskData) return []
    return kioskData.activeHierarchy.flatMap(c =>
      c.adsets.flatMap(as => as.ads)
    ).sort((a, b) => b.spend - a.spend)
  }

  // Helper to get top spender ad
  const getTopSpenderAd = () => {
    const allAds = getAllAdsFromHierarchy()
    return allAds.length > 0 ? allAds[0] : null
  }

  // Helper to get total ad count
  const getTotalAdCount = () => {
    if (!kioskData) return 0
    return kioskData.activeHierarchy.reduce((sum, c) =>
      sum + c.adsets.reduce((s, as) => s + as.ads.length, 0), 0
    )
  }

  // Check for existing session
  useEffect(() => {
    const stored = localStorage.getItem(`kiosk_session_${slug}`)
    if (stored) {
      setSessionToken(stored)
    }
  }, [slug])

  // Load data when authenticated
  useEffect(() => {
    if (sessionToken) {
      loadKioskData()
    }
  }, [sessionToken])

  const handleAuth = async () => {
    if (pin.length < 4) {
      setAuthError('PIN must be at least 4 digits')
      return
    }

    setLoading(true)
    setAuthError(null)

    try {
      const res = await fetch('/api/kiosk/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, pin })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      localStorage.setItem(`kiosk_session_${slug}`, data.sessionToken)
      setSessionToken(data.sessionToken)
      setPin('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const loadKioskData = async () => {
    if (!sessionToken) return

    try {
      const res = await fetch('/api/kiosk/data', {
        headers: { 'x-kiosk-session': sessionToken }
      })

      if (res.status === 401) {
        // Session expired
        localStorage.removeItem(`kiosk_session_${slug}`)
        setSessionToken(null)
        return
      }

      const data = await res.json()
      setKioskData(data)
    } catch (err) {
      console.error('Failed to load kiosk data:', err)
    }
  }

  const handleLogEvent = async () => {
    const value = parseFloat(logValue)
    if (isNaN(value) || value <= 0) {
      setLogError('Please enter a valid amount')
      return
    }

    // Determine the adId based on attribution mode
    let adIdToUse: string | undefined = undefined
    const topAd = getTopSpenderAd()
    if (logAttribution === 'top' && topAd) {
      adIdToUse = topAd.adId  // Top spender
    } else if (logAttribution === 'select' && logSelectedAd) {
      adIdToUse = logSelectedAd
    }

    setLogLoading(true)
    setLogError(null)

    try {
      const res = await fetch('/api/kiosk/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-session': sessionToken!
        },
        body: JSON.stringify({
          eventValue: value,
          adId: adIdToUse,
          notes: logNotes || undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log walk-in')
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
        loadKioskData()
      }, 1200)

    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to log walk-in')
    } finally {
      setLogLoading(false)
    }
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return 'Just now'
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
            <h1 className="text-2xl font-bold text-white">Sales Kiosk</h1>
            <p className="text-zinc-400 mt-2">Enter PIN to continue</p>
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
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Unlock'}
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (!kioskData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  // Main kiosk view
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {/* Header - KillScale branding + Workspace name */}
        <div className="text-center mb-12">
          <p className="text-lg font-bold text-accent mb-2">KillScale</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">{kioskData.workspace.name}</h1>
        </div>

        {/* Log Event Button - Big and centered */}
        <button
          onClick={() => setShowLogModal(true)}
          className="w-full py-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-2xl transition-colors flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-8 h-8" />
          Log Manual Event
        </button>

        {/* Recent Walk-Ins */}
        {kioskData.recentWalkins.length > 0 && (
          <div className="mt-10">
            <h3 className="text-zinc-400 text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent
            </h3>
            <div className="space-y-2">
              {kioskData.recentWalkins.map((walkin, i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">${walkin.value.toLocaleString()}</p>
                    {walkin.notes && (
                      <p className="text-sm text-zinc-500 truncate max-w-[200px]">{walkin.notes}</p>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500">{formatTimeAgo(walkin.time)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Event Modal */}
        {showLogModal && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-6">
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Log Manual Event</h2>
                  <button onClick={() => setShowLogModal(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                </div>

                {/* Success */}
                {logSuccess && (
                  <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-center">
                    Event logged successfully!
                  </div>
                )}

                {/* Error */}
                {logError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {logError}
                  </div>
                )}

                {!logSuccess && (
                  <>
                    {/* Amount */}
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

                    {/* Attribution Selection */}
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
                          {/* Top Spender Option */}
                          {(() => {
                            const topAd = getTopSpenderAd()
                            return topAd ? (
                              <label
                                className={cn(
                                  "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                                  logAttribution === 'top'
                                    ? "border-accent bg-accent/10"
                                    : "border-zinc-700 hover:border-zinc-600"
                                )}
                              >
                                <input
                                  type="radio"
                                  name="attribution"
                                  checked={logAttribution === 'top'}
                                  onChange={() => {
                                    setLogAttribution('top')
                                    setLogSelectedAd(topAd.adId)
                                  }}
                                  className="sr-only"
                                />
                                <div className={cn(
                                  "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                                  logAttribution === 'top' ? "border-accent bg-accent" : "border-zinc-500"
                                )}>
                                  {logAttribution === 'top' && (
                                    <div className="w-full h-full rounded-full bg-white scale-50" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-white font-medium">Top Spender (last 7 days)</span>
                                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                                    {topAd.adName} • ${topAd.spend.toLocaleString()} ({topAd.spendPercentage}%)
                                  </p>
                                </div>
                              </label>
                            ) : null
                          })()}

                          {/* Select Specific Ad Option */}
                          <label
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                              logAttribution === 'select'
                                ? "border-accent bg-accent/10"
                                : "border-zinc-700 hover:border-zinc-600"
                            )}
                          >
                            <input
                              type="radio"
                              name="attribution"
                              checked={logAttribution === 'select'}
                              onChange={() => setLogAttribution('select')}
                              className="sr-only"
                            />
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                              logAttribution === 'select' ? "border-accent bg-accent" : "border-zinc-500"
                            )}>
                              {logAttribution === 'select' && (
                                <div className="w-full h-full rounded-full bg-white scale-50" />
                              )}
                            </div>
                            <div className="flex-1">
                              <span className="text-white font-medium">Select Specific Ad</span>
                              <p className="text-xs text-zinc-500 mt-0.5">Choose which ad brought them in</p>
                            </div>
                          </label>

                          {/* Hierarchical Ad Picker (shown when 'select' is chosen) */}
                          {logAttribution === 'select' && (
                            <div className="ml-4 max-h-64 overflow-y-auto bg-zinc-800/50 rounded-lg border border-zinc-700">
                              {kioskData.activeHierarchy.map((campaign) => {
                                const isCampaignExpanded = expandedCampaigns.has(campaign.campaignId)
                                return (
                                  <div key={campaign.campaignId}>
                                    {/* Campaign Row */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newExpanded = new Set(expandedCampaigns)
                                        if (isCampaignExpanded) {
                                          newExpanded.delete(campaign.campaignId)
                                        } else {
                                          newExpanded.add(campaign.campaignId)
                                        }
                                        setExpandedCampaigns(newExpanded)
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/50 text-left"
                                    >
                                      {isCampaignExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                      )}
                                      <span className="text-xs font-medium text-blue-400 truncate">{campaign.campaignName}</span>
                                      <span className="text-xs text-zinc-600 ml-auto flex-shrink-0">
                                        {campaign.adsets.reduce((sum, as) => sum + as.ads.length, 0)} ads
                                      </span>
                                    </button>

                                    {/* Ad Sets (shown when campaign is expanded) */}
                                    {isCampaignExpanded && (
                                      <div className="border-l border-zinc-700 ml-5">
                                        {campaign.adsets.map((adset) => {
                                          const isAdsetExpanded = expandedAdsets.has(adset.adsetId)
                                          return (
                                            <div key={adset.adsetId}>
                                              {/* Ad Set Row */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newExpanded = new Set(expandedAdsets)
                                                  if (isAdsetExpanded) {
                                                    newExpanded.delete(adset.adsetId)
                                                  } else {
                                                    newExpanded.add(adset.adsetId)
                                                  }
                                                  setExpandedAdsets(newExpanded)
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/50 text-left"
                                              >
                                                {isAdsetExpanded ? (
                                                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                                ) : (
                                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                                )}
                                                <span className="text-xs font-medium text-purple-400 truncate">{adset.adsetName}</span>
                                                <span className="text-xs text-zinc-600 ml-auto flex-shrink-0">
                                                  {adset.ads.length} ads
                                                </span>
                                              </button>

                                              {/* Ads (shown when adset is expanded) */}
                                              {isAdsetExpanded && (
                                                <div className="border-l border-zinc-700 ml-5">
                                                  {adset.ads.map((ad) => (
                                                    <label
                                                      key={ad.adId}
                                                      className={cn(
                                                        "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                                        logSelectedAd === ad.adId
                                                          ? "bg-accent/20"
                                                          : "hover:bg-zinc-700/50"
                                                      )}
                                                    >
                                                      <input
                                                        type="radio"
                                                        name="selectedAd"
                                                        checked={logSelectedAd === ad.adId}
                                                        onChange={() => setLogSelectedAd(ad.adId)}
                                                        className="sr-only"
                                                      />
                                                      <div className={cn(
                                                        "w-3 h-3 rounded-full border-2 flex-shrink-0",
                                                        logSelectedAd === ad.adId ? "border-accent bg-accent" : "border-zinc-600"
                                                      )}>
                                                        {logSelectedAd === ad.adId && (
                                                          <div className="w-full h-full rounded-full bg-white scale-50" />
                                                        )}
                                                      </div>
                                                      <span className="flex-1 text-xs text-white truncate">{ad.adName}</span>
                                                      <span className="text-xs text-zinc-500 flex-shrink-0">${ad.spend.toLocaleString()}</span>
                                                      <span className="text-xs text-zinc-600 flex-shrink-0">{ad.spendPercentage}%</span>
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

                    {/* Notes */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        Notes (optional)
                      </label>
                      <input
                        type="text"
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        placeholder="e.g., Walk-in customer, phone order"
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-accent"
                      />
                    </div>

                    {/* Submit */}
                    <button
                      onClick={handleLogEvent}
                      disabled={logLoading || (logAttribution === 'select' && !logSelectedAd)}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors"
                    >
                      {logLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Log Event'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
