'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, ChevronDown, ChevronRight, Copy, Layers, FileText, Search, MapPin, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LocationResult {
  key: string
  name: string
  region: string
  countryName: string
}

interface TargetingOption {
  id: string
  name: string
  type: 'interest' | 'behavior'
  audience_size?: number
  path?: string[]
}

const RADIUS_OPTIONS = [10, 15, 25, 35, 50]

interface Campaign {
  id: string
  name: string
}

interface AdSet {
  id: string
  name: string
  campaignId: string
}

interface InlineDuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  itemType: 'campaign' | 'adset' | 'ad'
  itemId: string
  itemName: string
  parentCampaignId?: string
  parentAdsetId?: string
  userId: string
  adAccountId: string
  onComplete: () => void
}

export function InlineDuplicateModal({
  isOpen,
  onClose,
  itemType,
  itemId,
  itemName,
  parentCampaignId,
  parentAdsetId,
  userId,
  adAccountId,
  onComplete
}: InlineDuplicateModalProps) {
  const [newName, setNewName] = useState(`${itemName} - Copy`)
  const [createPaused, setCreatePaused] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Destination selection
  const [destinationType, setDestinationType] = useState<'same' | 'different'>('same')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(parentCampaignId || null)
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(parentAdsetId || null)

  // Targeting state (for adset duplication)
  const [editTargeting, setEditTargeting] = useState(false)
  const [locationType, setLocationType] = useState<'city' | 'country'>('country')
  const [locationKey, setLocationKey] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationRadius, setLocationRadius] = useState(25)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [searchingLocations, setSearchingLocations] = useState(false)
  const [ageMin, setAgeMin] = useState(18)
  const [ageMax, setAgeMax] = useState(65)
  const [targetingMode, setTargetingMode] = useState<'broad' | 'custom'>('broad')
  const [selectedInterests, setSelectedInterests] = useState<TargetingOption[]>([])
  const [selectedBehaviors, setSelectedBehaviors] = useState<TargetingOption[]>([])
  const [targetingQuery, setTargetingQuery] = useState('')
  const [targetingResults, setTargetingResults] = useState<TargetingOption[]>([])
  const [searchingTargeting, setSearchingTargeting] = useState(false)

  // Data for pickers
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<AdSet[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [loadingAdsets, setLoadingAdsets] = useState(false)
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewName(`${itemName} - Copy`)
      setCreatePaused(true)
      setDestinationType('same')
      setSelectedCampaignId(parentCampaignId || null)
      setSelectedAdsetId(parentAdsetId || null)
      setError(null)
      setExpandedCampaign(null)

      // Reset targeting state
      setEditTargeting(false)
      setLocationType('country')
      setLocationKey('')
      setLocationName('')
      setLocationRadius(25)
      setLocationQuery('')
      setLocationResults([])
      setAgeMin(18)
      setAgeMax(65)
      setTargetingMode('broad')
      setSelectedInterests([])
      setSelectedBehaviors([])
      setTargetingQuery('')
      setTargetingResults([])

      // Load campaigns if needed for adset or ad duplication
      if (itemType === 'adset' || itemType === 'ad') {
        loadCampaigns()
      }
    }
  }, [isOpen, itemName, itemType, parentCampaignId, parentAdsetId])

  // Load adsets when campaign is selected (for ad duplication)
  useEffect(() => {
    if (itemType === 'ad' && selectedCampaignId && destinationType === 'different') {
      loadAdsets(selectedCampaignId)
    }
  }, [selectedCampaignId, itemType, destinationType])

  const loadCampaigns = async () => {
    setLoadingCampaigns(true)
    try {
      const res = await fetch(`/api/meta/campaigns?userId=${userId}&adAccountId=${adAccountId}`)
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    } finally {
      setLoadingCampaigns(false)
    }
  }

  const loadAdsets = async (campaignId: string) => {
    setLoadingAdsets(true)
    try {
      const res = await fetch(`/api/meta/adsets?userId=${userId}&campaignId=${campaignId}`)
      const data = await res.json()
      setAdsets(data.adsets || [])
    } catch (err) {
      console.error('Failed to load adsets:', err)
    } finally {
      setLoadingAdsets(false)
    }
  }

  // Debounced location search
  useEffect(() => {
    if (!locationQuery || locationQuery.length < 2) {
      setLocationResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearchingLocations(true)
      try {
        const res = await fetch(`/api/meta/locations?userId=${userId}&query=${encodeURIComponent(locationQuery)}`)
        const data = await res.json()
        setLocationResults(data.locations || [])
      } catch (err) {
        console.error('Location search failed:', err)
      } finally {
        setSearchingLocations(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [locationQuery, userId])

  // Debounced targeting search
  useEffect(() => {
    if (!targetingQuery || targetingQuery.length < 2) {
      setTargetingResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearchingTargeting(true)
      try {
        const res = await fetch(`/api/meta/targeting?userId=${userId}&type=interest&q=${encodeURIComponent(targetingQuery)}`)
        const data = await res.json()
        setTargetingResults(data.options || [])
      } catch (err) {
        console.error('Targeting search failed:', err)
      } finally {
        setSearchingTargeting(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [targetingQuery, userId])

  const handleSubmit = async () => {
    if (!newName.trim()) {
      setError('Please enter a name')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      let response: Response
      const copyStatus = createPaused ? 'PAUSED' : 'ACTIVE'

      switch (itemType) {
        case 'campaign':
          response = await fetch('/api/meta/duplicate-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              adAccountId,
              sourceCampaignId: itemId,
              newName: newName.trim(),
              copyStatus
            })
          })
          break

        case 'adset':
          // Build request body with optional custom targeting
          const adsetBody: Record<string, unknown> = {
            userId,
            adAccountId,
            sourceAdsetId: itemId,
            targetCampaignId: destinationType === 'different' ? selectedCampaignId : parentCampaignId,
            newName: newName.trim(),
            copyStatus
          }

          // Add custom targeting if edit targeting is enabled
          if (editTargeting) {
            adsetBody.customTargeting = {
              locationType,
              locationKey: locationType === 'city' ? locationKey : undefined,
              locationName: locationType === 'city' ? locationName : undefined,
              locationRadius: locationType === 'city' ? locationRadius : undefined,
              countries: locationType === 'country' ? ['US'] : undefined,
              ageMin,
              ageMax,
              targetingMode,
              interests: targetingMode === 'custom' ? selectedInterests : undefined,
              behaviors: targetingMode === 'custom' ? selectedBehaviors : undefined
            }
          }

          response = await fetch('/api/meta/duplicate-adset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adsetBody)
          })
          break

        case 'ad':
          response = await fetch('/api/meta/duplicate-ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              adAccountId,
              sourceAdId: itemId,
              targetAdsetId: destinationType === 'different' ? selectedAdsetId : parentAdsetId,
              newName: newName.trim(),
              copyStatus
            })
          })
          break

        default:
          throw new Error('Invalid item type')
      }

      const result = await response.json()

      if (result.error) {
        setError(result.error)
        return
      }

      onComplete()
      onClose()
    } catch (err) {
      console.error('Duplicate error:', err)
      setError('Failed to duplicate. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getChildInfo = () => {
    switch (itemType) {
      case 'campaign':
        return 'All ad sets and ads will be duplicated'
      case 'adset':
        return 'All ads in this ad set will be duplicated'
      case 'ad':
        return null
    }
  }

  const getDestinationLabel = () => {
    switch (itemType) {
      case 'adset':
        return 'Destination Campaign'
      case 'ad':
        return 'Destination Ad Set'
      default:
        return 'Destination'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Copy className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Duplicate {itemType === 'adset' ? 'Ad Set' : itemType.charAt(0).toUpperCase() + itemType.slice(1)}</h2>
              <p className="text-sm text-zinc-500 truncate max-w-[280px]">{itemName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Name input */}
          <div>
            <label className="block text-sm font-medium mb-2">New Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Enter name..."
            />
          </div>

          {/* Destination picker for adset and ad */}
          {(itemType === 'adset' || itemType === 'ad') && (
            <div>
              <label className="block text-sm font-medium mb-2">{getDestinationLabel()}</label>

              {/* Same vs Different toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setDestinationType('same')}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    destinationType === 'same'
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                  )}
                >
                  Same {itemType === 'adset' ? 'Campaign' : 'Ad Set'}
                </button>
                <button
                  onClick={() => setDestinationType('different')}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    destinationType === 'different'
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                  )}
                >
                  Different {itemType === 'adset' ? 'Campaign' : 'Ad Set'}
                </button>
              </div>

              {/* Destination picker */}
              {destinationType === 'different' && (
                <div className="bg-bg-dark border border-border rounded-lg max-h-48 overflow-y-auto">
                  {loadingCampaigns ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    </div>
                  ) : itemType === 'adset' ? (
                    // Campaign picker for adset duplication
                    <div className="divide-y divide-border">
                      {campaigns.map((campaign) => (
                        <button
                          key={campaign.id}
                          onClick={() => setSelectedCampaignId(campaign.id)}
                          className={cn(
                            "w-full px-3 py-2.5 text-left text-sm hover:bg-bg-hover transition-colors flex items-center gap-2",
                            selectedCampaignId === campaign.id && "bg-accent/10"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex-shrink-0",
                            selectedCampaignId === campaign.id
                              ? "border-accent bg-accent"
                              : "border-zinc-500"
                          )}>
                            {selectedCampaignId === campaign.id && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-white rounded-full" />
                              </div>
                            )}
                          </div>
                          <Layers className="w-4 h-4 text-hierarchy-campaign flex-shrink-0" />
                          <span className="truncate">{campaign.name}</span>
                          {campaign.id === parentCampaignId && (
                            <span className="text-xs text-zinc-500 ml-auto">(current)</span>
                          )}
                        </button>
                      ))}
                      {campaigns.length === 0 && (
                        <div className="px-3 py-8 text-center text-zinc-500 text-sm">
                          No campaigns found
                        </div>
                      )}
                    </div>
                  ) : (
                    // Campaign > Adset picker for ad duplication
                    <div className="divide-y divide-border">
                      {campaigns.map((campaign) => (
                        <div key={campaign.id}>
                          <button
                            onClick={() => {
                              if (expandedCampaign === campaign.id) {
                                setExpandedCampaign(null)
                              } else {
                                setExpandedCampaign(campaign.id)
                                setSelectedCampaignId(campaign.id)
                                loadAdsets(campaign.id)
                              }
                            }}
                            className="w-full px-3 py-2.5 text-left text-sm hover:bg-bg-hover transition-colors flex items-center gap-2"
                          >
                            {expandedCampaign === campaign.id ? (
                              <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                            )}
                            <Layers className="w-4 h-4 text-hierarchy-campaign flex-shrink-0" />
                            <span className="truncate">{campaign.name}</span>
                          </button>

                          {expandedCampaign === campaign.id && (
                            <div className="bg-bg-dark/50">
                              {loadingAdsets ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                                </div>
                              ) : adsets.length === 0 ? (
                                <div className="px-8 py-3 text-zinc-500 text-sm">
                                  No ad sets in this campaign
                                </div>
                              ) : (
                                adsets.map((adset) => (
                                  <button
                                    key={adset.id}
                                    onClick={() => setSelectedAdsetId(adset.id)}
                                    className={cn(
                                      "w-full pl-10 pr-3 py-2 text-left text-sm hover:bg-bg-hover transition-colors flex items-center gap-2",
                                      selectedAdsetId === adset.id && "bg-accent/10"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-4 h-4 rounded-full border-2 flex-shrink-0",
                                      selectedAdsetId === adset.id
                                        ? "border-accent bg-accent"
                                        : "border-zinc-500"
                                    )}>
                                      {selectedAdsetId === adset.id && (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                        </div>
                                      )}
                                    </div>
                                    <FileText className="w-4 h-4 text-hierarchy-adset flex-shrink-0" />
                                    <span className="truncate">{adset.name}</span>
                                    {adset.id === parentAdsetId && (
                                      <span className="text-xs text-zinc-500 ml-auto">(current)</span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {campaigns.length === 0 && (
                        <div className="px-3 py-8 text-center text-zinc-500 text-sm">
                          No campaigns found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Targeting Editor for Ad Set Duplication */}
          {itemType === 'adset' && (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Edit Targeting Toggle */}
              <button
                onClick={() => setEditTargeting(!editTargeting)}
                className="w-full flex items-center justify-between p-3 hover:bg-bg-hover transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium">Edit Audience Targeting</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", editTargeting && "rotate-180")} />
              </button>

              {editTargeting && (
                <div className="p-3 border-t border-border space-y-4 bg-bg-dark/50">
                  {/* Location Type */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Location</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setLocationType('country')}
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          locationType === 'country'
                            ? "bg-accent/20 border-accent text-accent"
                            : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                        )}
                      >
                        United States
                      </button>
                      <button
                        onClick={() => setLocationType('city')}
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          locationType === 'city'
                            ? "bg-accent/20 border-accent text-accent"
                            : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                        )}
                      >
                        City + Radius
                      </button>
                    </div>

                    {locationType === 'city' && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type="text"
                            value={locationName || locationQuery}
                            onChange={(e) => {
                              setLocationQuery(e.target.value)
                              setLocationName('')
                              setLocationKey('')
                            }}
                            placeholder="Search city..."
                            className="w-full bg-bg-dark border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent"
                          />
                          {searchingLocations && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                          )}
                        </div>

                        {locationResults.length > 0 && !locationKey && (
                          <div className="border border-border rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                            {locationResults.slice(0, 5).map((loc) => (
                              <button
                                key={loc.key}
                                onClick={() => {
                                  setLocationKey(loc.key)
                                  setLocationName(`${loc.name}, ${loc.region}`)
                                  setLocationQuery('')
                                  setLocationResults([])
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-bg-hover border-b border-border last:border-0"
                              >
                                {loc.name}, {loc.region}, {loc.countryName}
                              </button>
                            ))}
                          </div>
                        )}

                        {locationKey && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400">Radius:</span>
                            <select
                              value={locationRadius}
                              onChange={(e) => setLocationRadius(parseInt(e.target.value))}
                              className="bg-bg-dark border border-border rounded-lg px-2 py-1 text-xs"
                            >
                              {RADIUS_OPTIONS.map(r => (
                                <option key={r} value={r}>{r} miles</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Age Range */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Age Range</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={ageMin}
                        onChange={(e) => {
                          const newMin = parseInt(e.target.value)
                          setAgeMin(newMin)
                          setAgeMax(Math.max(ageMax, newMin))
                        }}
                        className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm"
                      >
                        {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(age => (
                          <option key={age} value={age}>{age}</option>
                        ))}
                      </select>
                      <span className="text-xs text-zinc-400">to</span>
                      <select
                        value={ageMax}
                        onChange={(e) => {
                          const newMax = parseInt(e.target.value)
                          setAgeMax(newMax)
                          setAgeMin(Math.min(ageMin, newMax))
                        }}
                        className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm"
                      >
                        {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(age => (
                          <option key={age} value={age}>{age === 65 ? '65+' : age}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Targeting Mode */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Audience Targeting</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => {
                          setTargetingMode('broad')
                          setSelectedInterests([])
                          setSelectedBehaviors([])
                        }}
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          targetingMode === 'broad'
                            ? "bg-accent/20 border-accent text-accent"
                            : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                        )}
                      >
                        Broad Audience
                      </button>
                      <button
                        onClick={() => setTargetingMode('custom')}
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          targetingMode === 'custom'
                            ? "bg-accent/20 border-accent text-accent"
                            : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                        )}
                      >
                        Custom Interests
                      </button>
                    </div>

                    {targetingMode === 'custom' && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type="text"
                            value={targetingQuery}
                            onChange={(e) => setTargetingQuery(e.target.value)}
                            placeholder="Search interests..."
                            className="w-full bg-bg-dark border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent"
                          />
                          {searchingTargeting && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                          )}
                        </div>

                        {targetingResults.length > 0 && (
                          <div className="border border-border rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                            {targetingResults.slice(0, 5).map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  if (!selectedInterests.find(i => i.id === opt.id)) {
                                    setSelectedInterests([...selectedInterests, opt])
                                  }
                                  setTargetingQuery('')
                                  setTargetingResults([])
                                }}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-bg-hover border-b border-border last:border-0"
                              >
                                <div className="font-medium">{opt.name}</div>
                                {opt.path && <div className="text-zinc-500 text-xs">{opt.path.join(' > ')}</div>}
                              </button>
                            ))}
                          </div>
                        )}

                        {selectedInterests.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {selectedInterests.map((interest) => (
                              <span
                                key={interest.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-accent/20 border border-accent/30 rounded-full text-xs text-accent"
                              >
                                {interest.name}
                                <button
                                  onClick={() => setSelectedInterests(selectedInterests.filter(i => i.id !== interest.id))}
                                  className="hover:text-white"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Child info */}
          {getChildInfo() && (
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Layers className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-300">{getChildInfo()}</p>
            </div>
          )}

          {/* Create paused toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={createPaused}
              onChange={(e) => setCreatePaused(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm">Create as paused</span>
          </label>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (destinationType === 'different' && itemType === 'adset' && !selectedCampaignId) || (destinationType === 'different' && itemType === 'ad' && !selectedAdsetId)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Duplicate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
