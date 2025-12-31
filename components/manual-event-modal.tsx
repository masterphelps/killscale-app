'use client'

import { useState, useEffect } from 'react'
import { Loader2, ChevronDown, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const EVENT_TYPES = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'lead', label: 'Lead' },
  { value: 'signup', label: 'Sign Up' },
  { value: 'contact', label: 'Contact' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'quote', label: 'Quote Request' },
  { value: 'call', label: 'Phone Call' },
  { value: 'walkin', label: 'Walk-In' },
]

type AdHierarchy = {
  campaignId: string
  campaignName: string
  adsets: {
    adsetId: string
    adsetName: string
    ads: { adId: string; adName: string; spend: number; spendPercentage: number }[]
  }[]
}

interface ManualEventModalProps {
  workspaceId: string
  onClose: () => void
  onSuccess: () => void
}

export function ManualEventModal({ workspaceId, onClose, onSuccess }: ManualEventModalProps) {
  const { user } = useAuth()

  const [logEventType, setLogEventType] = useState('purchase')
  const [logEventDate, setLogEventDate] = useState(() => {
    // Default to today's date in local timezone
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [logValue, setLogValue] = useState('100')
  const [logNotes, setLogNotes] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [showEventDropdown, setShowEventDropdown] = useState(false)
  const [logHierarchy, setLogHierarchy] = useState<AdHierarchy[]>([])
  const [logAdsLoading, setLogAdsLoading] = useState(false)
  const [logAttribution, setLogAttribution] = useState<'top' | 'select'>('top')
  const [logSelectedAd, setLogSelectedAd] = useState<string | null>(null)
  const [logExpandedCampaigns, setLogExpandedCampaigns] = useState<Set<string>>(new Set())
  const [logExpandedAdsets, setLogExpandedAdsets] = useState<Set<string>>(new Set())

  // Load active ads hierarchy on mount
  useEffect(() => {
    loadActiveAds()
  }, [])

  const loadActiveAds = async () => {
    if (!user?.id) return
    setLogAdsLoading(true)
    try {
      const res = await fetch(`/api/workspace/active-hierarchy?workspaceId=${workspaceId}&userId=${user.id}`)
      const data = await res.json()
      if (res.ok && data.campaigns) {
        setLogHierarchy(data.campaigns)
        // Find top spender ad
        const allAds = data.campaigns.flatMap((c: AdHierarchy) =>
          c.adsets.flatMap((as) => as.ads)
        )
        if (allAds.length > 0) {
          const topAd = allAds.sort((a: { spend: number }, b: { spend: number }) => b.spend - a.spend)[0]
          setLogAttribution('top')
          setLogSelectedAd(topAd.adId)
        } else {
          setLogAttribution('top')
          setLogSelectedAd(null)
        }
      }
    } catch (err) {
      console.error('Failed to load active hierarchy:', err)
    } finally {
      setLogAdsLoading(false)
    }
  }

  const getAllAdsFromHierarchy = () => {
    return logHierarchy.flatMap(c =>
      c.adsets.flatMap(as => as.ads)
    ).sort((a, b) => b.spend - a.spend)
  }

  const getTopSpenderAd = () => {
    const allAds = getAllAdsFromHierarchy()
    return allAds.length > 0 ? allAds[0] : null
  }

  const getTotalAdCount = () => {
    return logHierarchy.reduce((sum, c) =>
      sum + c.adsets.reduce((s, as) => s + as.ads.length, 0), 0
    )
  }

  const handleLogEvent = async () => {
    // Only validate value for purchase events
    let numValue: number | undefined = undefined
    if (logEventType === 'purchase') {
      numValue = parseFloat(logValue)
      if (isNaN(numValue) || numValue <= 0) {
        setLogError('Please enter a valid amount')
        return
      }
    }

    // Determine the adId based on attribution mode
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
      // Convert date to ISO string (set to noon to avoid timezone issues)
      const eventDateTime = new Date(logEventDate + 'T12:00:00')

      const res = await fetch('/api/pixel/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          eventType: logEventType,
          eventValue: numValue,
          adId: adIdToUse,
          notes: logNotes || undefined,
          eventTime: eventDateTime.toISOString()
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log event')
      }

      setLogSuccess(true)
      onSuccess()

      setTimeout(() => {
        onClose()
      }, 1500)

    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to log event')
    } finally {
      setLogLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Log Manual Event</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-bg-hover rounded-lg"
            >
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
              {/* Event Type */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Event Type</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEventDropdown(!showEventDropdown)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bg-dark border border-border rounded-xl text-white focus:outline-none focus:border-accent"
                  >
                    <span>{EVENT_TYPES.find(e => e.value === logEventType)?.label || 'Select type'}</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", showEventDropdown && "rotate-180")} />
                  </button>
                  {showEventDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowEventDropdown(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                        {EVENT_TYPES.map((type) => (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => {
                              setLogEventType(type.value)
                              setShowEventDropdown(false)
                            }}
                            className={cn(
                              "w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 transition-colors",
                              logEventType === type.value && "bg-zinc-700 text-accent"
                            )}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Event Date */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Event Date</label>
                <input
                  type="date"
                  value={logEventDate}
                  onChange={(e) => setLogEventDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-bg-dark border border-border rounded-xl text-white focus:outline-none focus:border-accent [color-scheme:dark]"
                />
                <p className="text-xs text-zinc-500 mt-1">When did this event occur?</p>
              </div>

              {/* Event Value - only for purchase */}
              {logEventType === 'purchase' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Event Value</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xl">$</span>
                    <input
                      type="number"
                      value={logValue}
                      onChange={(e) => setLogValue(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="w-full pl-10 pr-4 py-4 bg-bg-dark border border-border rounded-xl text-white text-2xl font-bold focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              {/* Attribution Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Attribute to</label>
                {logAdsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                  </div>
                ) : getTotalAdCount() === 0 ? (
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
                              : "border-border hover:border-zinc-600"
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
                          : "border-border hover:border-zinc-600"
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
                      <div className="ml-4 max-h-64 overflow-y-auto bg-bg-dark rounded-lg border border-border">
                        {logHierarchy.map((campaign) => {
                          const isCampaignExpanded = logExpandedCampaigns.has(campaign.campaignId)
                          return (
                            <div key={campaign.campaignId}>
                              {/* Campaign Row */}
                              <button
                                type="button"
                                onClick={() => {
                                  const newExpanded = new Set(logExpandedCampaigns)
                                  if (isCampaignExpanded) {
                                    newExpanded.delete(campaign.campaignId)
                                  } else {
                                    newExpanded.add(campaign.campaignId)
                                  }
                                  setLogExpandedCampaigns(newExpanded)
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 text-left"
                              >
                                {isCampaignExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                )}
                                <span className="text-xs font-medium text-hierarchy-campaign truncate">{campaign.campaignName}</span>
                                <span className="text-xs text-zinc-600 ml-auto flex-shrink-0">
                                  {campaign.adsets.reduce((sum, as) => sum + as.ads.length, 0)} ads
                                </span>
                              </button>

                              {/* Ad Sets (shown when campaign is expanded) */}
                              {isCampaignExpanded && (
                                <div className="border-l border-zinc-700 ml-5">
                                  {campaign.adsets.map((adset) => {
                                    const isAdsetExpanded = logExpandedAdsets.has(adset.adsetId)
                                    return (
                                      <div key={adset.adsetId}>
                                        {/* Ad Set Row */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newExpanded = new Set(logExpandedAdsets)
                                            if (isAdsetExpanded) {
                                              newExpanded.delete(adset.adsetId)
                                            } else {
                                              newExpanded.add(adset.adsetId)
                                            }
                                            setLogExpandedAdsets(newExpanded)
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 text-left"
                                        >
                                          {isAdsetExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                          )}
                                          <span className="text-xs font-medium text-hierarchy-adset truncate">{adset.adsetName}</span>
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
                                                    : "hover:bg-zinc-800/50"
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

              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Notes (optional)</label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="e.g., Walk-in customer, phone order"
                  className="w-full px-4 py-3 bg-bg-dark border border-border rounded-xl text-white focus:outline-none focus:border-accent"
                />
              </div>

              <button
                onClick={handleLogEvent}
                disabled={logLoading || (logAttribution === 'select' && !logSelectedAd)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors"
              >
                {logLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Log ${EVENT_TYPES.find(e => e.value === logEventType)?.label || 'Event'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
