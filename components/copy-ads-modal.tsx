'use client'

import { useState, useEffect } from 'react'
import { X, Copy, ChevronRight, ChevronDown, Plus, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdToCopy {
  id: string
  name: string
  adsetId: string
  adsetName: string
  campaignId: string
  campaignName: string
}

interface Campaign {
  id: string
  name: string
  adsets?: AdSet[]
}

interface AdSet {
  id: string
  name: string
  campaignId: string
}

interface CopyAdsModalProps {
  isOpen: boolean
  onClose: () => void
  selectedAds: AdToCopy[]
  userId: string
  adAccountId: string
  onComplete: () => void
}

type Step = 'destinations' | 'review' | 'progress'

interface Destination {
  type: 'existing' | 'new'
  adsetId?: string
  adsetName?: string
  campaignId?: string
  campaignName?: string
  newAdsetName?: string
  newAdsetBudget?: number
}

export function CopyAdsModal({
  isOpen,
  onClose,
  selectedAds,
  userId,
  adAccountId,
  onComplete
}: CopyAdsModalProps) {
  const [step, setStep] = useState<Step>('destinations')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [selectedDestinations, setSelectedDestinations] = useState<Map<string, Destination>>(new Map())
  const [createPaused, setCreatePaused] = useState(true)
  const [preserveUtm, setPreserveUtm] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, failed: 0, total: 0 })
  const [results, setResults] = useState<Array<{ name: string; success: boolean; error?: string }>>([])

  // Load campaigns and adsets
  useEffect(() => {
    if (isOpen) {
      loadCampaigns()
      setStep('destinations')
      setSelectedDestinations(new Map())
      setResults([])
      setProgress({ completed: 0, failed: 0, total: 0 })
    }
  }, [isOpen])

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/meta/campaigns?userId=${userId}&adAccountId=${adAccountId}`)
      const data = await res.json()

      if (data.campaigns) {
        // Load adsets for each campaign
        const campaignsWithAdsets = await Promise.all(
          data.campaigns.map(async (campaign: Campaign) => {
            const adsetsRes = await fetch(`/api/meta/adsets?userId=${userId}&campaignId=${campaign.id}`)
            const adsetsData = await adsetsRes.json()
            return {
              ...campaign,
              adsets: adsetsData.adsets || []
            }
          })
        )
        setCampaigns(campaignsWithAdsets)
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      if (next.has(campaignId)) {
        next.delete(campaignId)
      } else {
        next.add(campaignId)
      }
      return next
    })
  }

  const toggleDestination = (adset: AdSet, campaign: Campaign) => {
    setSelectedDestinations(prev => {
      const next = new Map(prev)
      const key = adset.id
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, {
          type: 'existing',
          adsetId: adset.id,
          adsetName: adset.name,
          campaignId: campaign.id,
          campaignName: campaign.name
        })
      }
      return next
    })
  }

  const addNewAdsetDestination = (campaign: Campaign) => {
    setSelectedDestinations(prev => {
      const next = new Map(prev)
      const key = `new-${campaign.id}-${Date.now()}`
      next.set(key, {
        type: 'new',
        campaignId: campaign.id,
        campaignName: campaign.name,
        newAdsetName: `New Ad Set - ${selectedAds.length} ads`,
        newAdsetBudget: 50
      })
      return next
    })
  }

  const updateNewAdsetConfig = (key: string, updates: Partial<Destination>) => {
    setSelectedDestinations(prev => {
      const next = new Map(prev)
      const current = next.get(key)
      if (current) {
        next.set(key, { ...current, ...updates })
      }
      return next
    })
  }

  const removeDestination = (key: string) => {
    setSelectedDestinations(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  const handleCopy = async () => {
    if (selectedDestinations.size === 0) return

    setStep('progress')
    setIsProcessing(true)

    const destinations = Array.from(selectedDestinations.entries())
    const totalOps = selectedAds.length * destinations.length
    setProgress({ completed: 0, failed: 0, total: totalOps })

    const allResults: Array<{ name: string; success: boolean; error?: string }> = []
    let completed = 0
    let failed = 0

    try {
      const response = await fetch('/api/meta/copy-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          adAccountId,
          sourceAdIds: selectedAds.map(ad => ad.id),
          destinations: destinations.map(([key, dest]) => ({
            type: dest.type,
            adsetId: dest.adsetId,
            newAdsetConfig: dest.type === 'new' ? {
              name: dest.newAdsetName,
              campaignId: dest.campaignId,
              dailyBudget: dest.newAdsetBudget,
              copyTargetingFrom: selectedAds[0]?.adsetId // Copy targeting from first selected ad's adset
            } : undefined
          })),
          preserveUtm,
          copyStatus: createPaused ? 'PAUSED' : 'ACTIVE'
        })
      })

      const result = await response.json()

      if (result.success) {
        // Process results
        for (const destResult of result.results || []) {
          for (const adId of destResult.adsCreated || []) {
            allResults.push({
              name: `Ad copied to ${destResult.destinationAdsetId}`,
              success: true
            })
            completed++
          }
          for (const error of destResult.errors || []) {
            allResults.push({
              name: error,
              success: false,
              error
            })
            failed++
          }
        }
      } else {
        allResults.push({
          name: result.error || 'Failed to copy ads',
          success: false,
          error: result.error
        })
        failed = totalOps
      }
    } catch (err) {
      allResults.push({
        name: err instanceof Error ? err.message : 'Unknown error',
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
      failed = totalOps
    }

    setResults(allResults)
    setProgress({ completed: completed + failed, failed, total: totalOps })
    setIsProcessing(false)
  }

  const handleComplete = () => {
    onComplete()
    onClose()
  }

  if (!isOpen) return null

  const newAdsetDestinations = Array.from(selectedDestinations.entries()).filter(([_, d]) => d.type === 'new')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold">
              Copy {selectedAds.length} ad{selectedAds.length > 1 ? 's' : ''} to Ad Sets
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white hover:bg-bg-hover rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'destinations' && (
            <div className="space-y-4">
              {/* Instructions */}
              <p className="text-sm text-zinc-400">
                Select destination ad sets where you want to copy the selected ads.
                You can copy to existing ad sets or create new ones.
              </p>

              {/* Campaign/Adset tree */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto border border-border rounded-lg">
                  {campaigns.map(campaign => (
                    <div key={campaign.id} className="border-b border-border/50 last:border-0">
                      {/* Campaign header */}
                      <div
                        className="flex items-center gap-2 p-3 hover:bg-bg-hover/50 cursor-pointer"
                        onClick={() => toggleCampaign(campaign.id)}
                      >
                        {expandedCampaigns.has(campaign.id) ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        )}
                        <span className="px-1.5 py-0.5 bg-hierarchy-campaign/20 text-hierarchy-campaign text-xs font-medium rounded">
                          Campaign
                        </span>
                        <span className="font-medium truncate">{campaign.name}</span>
                      </div>

                      {/* Adsets */}
                      {expandedCampaigns.has(campaign.id) && (
                        <div className="pl-8 pb-2">
                          {campaign.adsets?.map(adset => {
                            const isSelected = selectedDestinations.has(adset.id)
                            const isSource = selectedAds.some(ad => ad.adsetId === adset.id)
                            return (
                              <div
                                key={adset.id}
                                onClick={() => !isSource && toggleDestination(adset, campaign)}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded cursor-pointer",
                                  isSource ? "opacity-50 cursor-not-allowed" : "hover:bg-bg-hover/50",
                                  isSelected && "bg-accent/10"
                                )}
                              >
                                <div className={cn(
                                  "w-4 h-4 rounded border flex items-center justify-center",
                                  isSelected ? "bg-accent border-accent" : "border-zinc-500"
                                )}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className="px-1.5 py-0.5 bg-hierarchy-adset/20 text-hierarchy-adset text-xs font-medium rounded">
                                  Ad Set
                                </span>
                                <span className="text-sm truncate">{adset.name}</span>
                                {isSource && <span className="text-xs text-zinc-500">(source)</span>}
                              </div>
                            )
                          })}

                          {/* Add new adset button */}
                          <button
                            onClick={() => addNewAdsetDestination(campaign)}
                            className="flex items-center gap-2 p-2 text-sm text-accent hover:bg-accent/10 rounded w-full"
                          >
                            <Plus className="w-4 h-4" />
                            Create new ad set
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* New adset configurations */}
              {newAdsetDestinations.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-400">
                    New Ad Sets to Create
                  </label>
                  {newAdsetDestinations.map(([key, dest]) => (
                    <div key={key} className="flex items-center gap-2 p-3 bg-bg-dark rounded-lg border border-border">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={dest.newAdsetName || ''}
                          onChange={(e) => updateNewAdsetConfig(key, { newAdsetName: e.target.value })}
                          placeholder="Ad set name"
                          className="w-full px-3 py-1.5 bg-bg-hover border border-border rounded text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">Daily budget: $</span>
                          <input
                            type="number"
                            value={dest.newAdsetBudget || ''}
                            onChange={(e) => updateNewAdsetConfig(key, { newAdsetBudget: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 bg-bg-hover border border-border rounded text-sm"
                          />
                          <span className="text-xs text-zinc-500">in {dest.campaignName}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeDestination(key)}
                        className="p-1 text-zinc-500 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Options */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="createPaused"
                    checked={createPaused}
                    onChange={(e) => setCreatePaused(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="createPaused" className="text-sm text-zinc-300">
                    Create as paused
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="preserveUtm"
                    checked={preserveUtm}
                    onChange={(e) => setPreserveUtm(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="preserveUtm" className="text-sm text-zinc-300">
                    Preserve UTM parameters
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <h4 className="font-medium">Review</h4>
              <p className="text-sm text-zinc-400">
                Copying {selectedAds.length} ad{selectedAds.length > 1 ? 's' : ''} to {selectedDestinations.size} destination{selectedDestinations.size > 1 ? 's' : ''}.
              </p>

              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-400">Ads to copy:</div>
                <ul className="list-disc list-inside text-sm">
                  {selectedAds.map(ad => (
                    <li key={ad.id}>{ad.name}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-400">Destinations:</div>
                <ul className="list-disc list-inside text-sm">
                  {Array.from(selectedDestinations.values()).map((dest, i) => (
                    <li key={i}>
                      {dest.type === 'existing'
                        ? `${dest.adsetName} (in ${dest.campaignName})`
                        : `New: ${dest.newAdsetName} (in ${dest.campaignName})`
                      }
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 'progress' && (
            <div className="space-y-4">
              <div className="h-2 bg-bg-hover rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    progress.failed > 0 ? "bg-gradient-to-r from-verdict-scale to-red-500" : "bg-verdict-scale"
                  )}
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-sm text-zinc-400">
                {isProcessing ? 'Copying ads...' : 'Complete'} - {progress.completed - progress.failed} succeeded
                {progress.failed > 0 && <span className="text-red-400">, {progress.failed} failed</span>}
              </div>

              {results.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {results.map((result, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-sm px-2 py-1 rounded",
                        result.success ? "text-verdict-scale" : "text-red-400"
                      )}
                    >
                      {result.success ? '✓' : '✗'} {result.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-border flex-shrink-0">
          <div className="text-sm text-zinc-400">
            {selectedDestinations.size} destination{selectedDestinations.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-2">
            {step === 'destinations' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('review')}
                  disabled={selectedDestinations.size === 0}
                  className={cn(
                    "px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium",
                    selectedDestinations.size === 0 && "opacity-50 cursor-not-allowed"
                  )}
                >
                  Review
                </button>
              </>
            )}
            {step === 'review' && (
              <>
                <button
                  onClick={() => setStep('destinations')}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white"
                >
                  Back
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
                >
                  <Copy className="w-4 h-4" />
                  Copy Ads
                </button>
              </>
            )}
            {step === 'progress' && !isProcessing && (
              <button
                onClick={handleComplete}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
