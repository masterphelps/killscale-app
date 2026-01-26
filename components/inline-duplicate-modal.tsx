'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ChevronDown, ChevronRight, Copy, Layers, FileText, Search, Target } from 'lucide-react'
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

// Per-adset targeting state for campaign duplication
interface AdsetTargetingState {
  adsetId: string
  adsetName: string
  originalTargetingSummary: string
  hasCustomTargeting: boolean
  locationType: 'city' | 'country'
  locationKey: string
  locationName: string
  locationRadius: number
  ageMin: number
  ageMax: number
  targetingMode: 'broad' | 'custom'
  interests: TargetingOption[]
  behaviors: TargetingOption[]
}

interface CampaignAdset {
  id: string
  name: string
  targeting: {
    geo_locations?: {
      countries?: string[]
      cities?: Array<{ key: string; name: string; radius?: number }>
    }
    age_min?: number
    age_max?: number
    flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }>; behaviors?: Array<{ id: string; name: string }> }>
  }
}

function summarizeTargeting(targeting: CampaignAdset['targeting']): string {
  const parts: string[] = []

  if (targeting.geo_locations?.countries?.length) {
    parts.push(targeting.geo_locations.countries.join(', '))
  } else if (targeting.geo_locations?.cities?.length) {
    const city = targeting.geo_locations.cities[0]
    parts.push(`${city.name}${city.radius ? ` +${city.radius}mi` : ''}`)
  }

  if (targeting.age_min || targeting.age_max) {
    parts.push(`${targeting.age_min || 18}-${targeting.age_max || 65}`)
  }

  if (targeting.flexible_spec?.[0]?.interests?.length) {
    const count = targeting.flexible_spec[0].interests.length
    parts.push(`${count} interest${count > 1 ? 's' : ''}`)
  } else {
    parts.push('Broad')
  }

  return parts.join(', ') || 'Default targeting'
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

  // Destination selection (for adset/ad duplication)
  const [destinationType, setDestinationType] = useState<'same' | 'different'>('same')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(parentCampaignId || null)
  const [selectedAdsetId, setSelectedAdsetId] = useState<string | null>(parentAdsetId || null)

  // Single adset targeting state (for adset duplication)
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

  // Campaign duplication: per-adset targeting
  const [campaignAdsets, setCampaignAdsets] = useState<CampaignAdset[]>([])
  const [adsetTargetingStates, setAdsetTargetingStates] = useState<AdsetTargetingState[]>([])
  const [loadingCampaignAdsets, setLoadingCampaignAdsets] = useState(false)
  const [expandedAdsetId, setExpandedAdsetId] = useState<string | null>(null)

  // For adset targeting search within expanded adset
  const [adsetLocationQuery, setAdsetLocationQuery] = useState('')
  const [adsetLocationResults, setAdsetLocationResults] = useState<LocationResult[]>([])
  const [adsetSearchingLocations, setAdsetSearchingLocations] = useState(false)
  const [adsetTargetingQuery, setAdsetTargetingQuery] = useState('')
  const [adsetTargetingResults, setAdsetTargetingResults] = useState<TargetingOption[]>([])
  const [adsetSearchingTargeting, setAdsetSearchingTargeting] = useState(false)

  // Data for destination pickers
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<AdSet[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [loadingAdsets, setLoadingAdsets] = useState(false)
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)

  // Ad copy editing for ad duplication
  const [adCopy, setAdCopy] = useState({
    primaryText: '',
    headline: '',
    description: '',
    hasChanges: false
  })
  const [loadingAdCopy, setLoadingAdCopy] = useState(false)
  const [showAdCopy, setShowAdCopy] = useState(false)

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
      setExpandedAdsetId(null)

      // Reset single adset targeting state
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

      // Reset campaign adset states
      setCampaignAdsets([])
      setAdsetTargetingStates([])
      setAdsetLocationQuery('')
      setAdsetLocationResults([])
      setAdsetTargetingQuery('')
      setAdsetTargetingResults([])

      // Reset ad copy states
      setAdCopy({ primaryText: '', headline: '', description: '', hasChanges: false })
      setShowAdCopy(false)

      // Load data based on item type
      if (itemType === 'campaign') {
        loadCampaignAdsets()
      } else if (itemType === 'adset') {
        loadCampaigns()
      } else if (itemType === 'ad') {
        loadCampaigns()
        loadAdCopyData()
      }
    }
  }, [isOpen, itemName, itemType, parentCampaignId, parentAdsetId, itemId])

  // Load adsets when campaign is selected (for ad duplication)
  useEffect(() => {
    if (itemType === 'ad' && selectedCampaignId && destinationType === 'different') {
      loadAdsets(selectedCampaignId)
    }
  }, [selectedCampaignId, itemType, destinationType])

  // Load campaign's adsets for targeting editing
  const loadCampaignAdsets = async () => {
    setLoadingCampaignAdsets(true)
    try {
      const res = await fetch(`/api/meta/campaign-adsets?userId=${userId}&campaignId=${itemId}`)
      const data = await res.json()
      if (data.adsets) {
        setCampaignAdsets(data.adsets)
        // Initialize targeting states for each adset
        setAdsetTargetingStates(data.adsets.map((adset: CampaignAdset) => ({
          adsetId: adset.id,
          adsetName: adset.name,
          originalTargetingSummary: summarizeTargeting(adset.targeting),
          hasCustomTargeting: false,
          locationType: adset.targeting.geo_locations?.cities?.length ? 'city' : 'country',
          locationKey: adset.targeting.geo_locations?.cities?.[0]?.key || '',
          locationName: adset.targeting.geo_locations?.cities?.[0]?.name || '',
          locationRadius: adset.targeting.geo_locations?.cities?.[0]?.radius || 25,
          ageMin: adset.targeting.age_min || 18,
          ageMax: adset.targeting.age_max || 65,
          targetingMode: adset.targeting.flexible_spec?.[0]?.interests?.length ? 'custom' : 'broad',
          interests: adset.targeting.flexible_spec?.[0]?.interests?.map(i => ({ ...i, type: 'interest' as const })) || [],
          behaviors: adset.targeting.flexible_spec?.[0]?.behaviors?.map(b => ({ ...b, type: 'behavior' as const })) || []
        })))
      }
    } catch (err) {
      console.error('Failed to load campaign adsets:', err)
    } finally {
      setLoadingCampaignAdsets(false)
    }
  }

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

  // Load ad copy for ad duplication
  const loadAdCopyData = async () => {
    setLoadingAdCopy(true)
    try {
      const res = await fetch(`/api/meta/get-ad-creative?userId=${userId}&adId=${itemId}`)
      const data = await res.json()
      if (data.success) {
        setAdCopy({
          primaryText: data.primaryText || '',
          headline: data.headline || '',
          description: data.description || '',
          hasChanges: false
        })
      }
    } catch (err) {
      console.error('Failed to load ad copy:', err)
    } finally {
      setLoadingAdCopy(false)
    }
  }

  // Update ad copy field
  const updateAdCopyField = (field: 'primaryText' | 'headline' | 'description', value: string) => {
    setAdCopy(prev => ({ ...prev, [field]: value, hasChanges: true }))
  }

  // Debounced location search for single adset
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

  // Debounced targeting search for single adset
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

  // Debounced location search for per-adset editing
  useEffect(() => {
    if (!adsetLocationQuery || adsetLocationQuery.length < 2) {
      setAdsetLocationResults([])
      return
    }

    const timer = setTimeout(async () => {
      setAdsetSearchingLocations(true)
      try {
        const res = await fetch(`/api/meta/locations?userId=${userId}&query=${encodeURIComponent(adsetLocationQuery)}`)
        const data = await res.json()
        setAdsetLocationResults(data.locations || [])
      } catch (err) {
        console.error('Location search failed:', err)
      } finally {
        setAdsetSearchingLocations(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [adsetLocationQuery, userId])

  // Debounced targeting search for per-adset editing
  useEffect(() => {
    if (!adsetTargetingQuery || adsetTargetingQuery.length < 2) {
      setAdsetTargetingResults([])
      return
    }

    const timer = setTimeout(async () => {
      setAdsetSearchingTargeting(true)
      try {
        const res = await fetch(`/api/meta/targeting?userId=${userId}&type=interest&q=${encodeURIComponent(adsetTargetingQuery)}`)
        const data = await res.json()
        setAdsetTargetingResults(data.options || [])
      } catch (err) {
        console.error('Targeting search failed:', err)
      } finally {
        setAdsetSearchingTargeting(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [adsetTargetingQuery, userId])

  // Update a specific adset's targeting state
  const updateAdsetTargeting = (adsetId: string, updates: Partial<AdsetTargetingState>) => {
    setAdsetTargetingStates(prev => prev.map(state =>
      state.adsetId === adsetId
        ? { ...state, ...updates, hasCustomTargeting: true }
        : state
    ))
  }

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
          // Build per-adset targeting for campaign duplication
          const adsetTargetingOverrides = adsetTargetingStates
            .filter(state => state.hasCustomTargeting)
            .map(state => ({
              sourceAdsetId: state.adsetId,
              customTargeting: {
                locationType: state.locationType,
                locationKey: state.locationType === 'city' ? state.locationKey : undefined,
                locationName: state.locationType === 'city' ? state.locationName : undefined,
                locationRadius: state.locationType === 'city' ? state.locationRadius : undefined,
                countries: state.locationType === 'country' ? ['US'] : undefined,
                ageMin: state.ageMin,
                ageMax: state.ageMax,
                targetingMode: state.targetingMode,
                interests: state.targetingMode === 'custom' ? state.interests : undefined,
                behaviors: state.targetingMode === 'custom' ? state.behaviors : undefined
              }
            }))

          response = await fetch('/api/meta/duplicate-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              adAccountId,
              sourceCampaignId: itemId,
              newName: newName.trim(),
              copyStatus,
              adsetTargetingOverrides: adsetTargetingOverrides.length > 0 ? adsetTargetingOverrides : undefined
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
          // Build ad duplication request
          const adBody: Record<string, unknown> = {
            userId,
            adAccountId,
            sourceAdId: itemId,
            targetAdsetId: destinationType === 'different' ? selectedAdsetId : parentAdsetId,
            newName: newName.trim(),
            copyStatus
          }

          // Add copy override if changes were made
          if (adCopy.hasChanges) {
            adBody.copyOverride = {
              primaryText: adCopy.primaryText,
              headline: adCopy.headline,
              description: adCopy.description
            }
          }

          response = await fetch('/api/meta/duplicate-ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adBody)
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
        return null // We show the adset list instead
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

  // Render targeting editor for a single adset (used in both modes)
  const renderTargetingEditor = (
    state: {
      locationType: 'city' | 'country'
      locationKey: string
      locationName: string
      locationRadius: number
      ageMin: number
      ageMax: number
      targetingMode: 'broad' | 'custom'
      interests: TargetingOption[]
      behaviors: TargetingOption[]
    },
    onUpdate: (updates: Partial<typeof state>) => void,
    locationQueryValue: string,
    setLocationQueryValue: (q: string) => void,
    locationResultsValue: LocationResult[],
    setLocationResultsValue: (r: LocationResult[]) => void,
    searchingLocationsValue: boolean,
    targetingQueryValue: string,
    setTargetingQueryValue: (q: string) => void,
    targetingResultsValue: TargetingOption[],
    setTargetingResultsValue: (r: TargetingOption[]) => void,
    searchingTargetingValue: boolean
  ) => (
    <div className="space-y-4">
      {/* Location Type */}
      <div>
        <label className="block text-sm font-medium mb-2">Location</label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => onUpdate({ locationType: 'country' })}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              state.locationType === 'country'
                ? "bg-accent/20 border-accent text-accent"
                : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
            )}
          >
            United States
          </button>
          <button
            onClick={() => onUpdate({ locationType: 'city' })}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              state.locationType === 'city'
                ? "bg-accent/20 border-accent text-accent"
                : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
            )}
          >
            City + Radius
          </button>
        </div>

        {state.locationType === 'city' && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={state.locationName || locationQueryValue}
                onChange={(e) => {
                  setLocationQueryValue(e.target.value)
                  onUpdate({ locationName: '', locationKey: '' })
                }}
                placeholder="Search city..."
                className="w-full bg-bg-dark border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent"
              />
              {searchingLocationsValue && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
              )}
            </div>

            {locationResultsValue.length > 0 && !state.locationKey && (
              <div className="border border-border rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                {locationResultsValue.slice(0, 5).map((loc) => (
                  <button
                    key={loc.key}
                    onClick={() => {
                      onUpdate({ locationKey: loc.key, locationName: `${loc.name}, ${loc.region}` })
                      setLocationQueryValue('')
                      setLocationResultsValue([])
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-bg-hover border-b border-border last:border-0"
                  >
                    {loc.name}, {loc.region}, {loc.countryName}
                  </button>
                ))}
              </div>
            )}

            {state.locationKey && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Radius:</span>
                <select
                  value={state.locationRadius}
                  onChange={(e) => onUpdate({ locationRadius: parseInt(e.target.value) })}
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
            value={state.ageMin}
            onChange={(e) => {
              const newMin = parseInt(e.target.value)
              onUpdate({ ageMin: newMin, ageMax: Math.max(state.ageMax, newMin) })
            }}
            className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm"
          >
            {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(age => (
              <option key={age} value={age}>{age}</option>
            ))}
          </select>
          <span className="text-xs text-zinc-400">to</span>
          <select
            value={state.ageMax}
            onChange={(e) => {
              const newMax = parseInt(e.target.value)
              onUpdate({ ageMax: newMax, ageMin: Math.min(state.ageMin, newMax) })
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
            onClick={() => onUpdate({ targetingMode: 'broad', interests: [], behaviors: [] })}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              state.targetingMode === 'broad'
                ? "bg-accent/20 border-accent text-accent"
                : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
            )}
          >
            Broad Audience
          </button>
          <button
            onClick={() => onUpdate({ targetingMode: 'custom' })}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              state.targetingMode === 'custom'
                ? "bg-accent/20 border-accent text-accent"
                : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
            )}
          >
            Custom Interests
          </button>
        </div>

        {state.targetingMode === 'custom' && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={targetingQueryValue}
                onChange={(e) => setTargetingQueryValue(e.target.value)}
                placeholder="Search interests..."
                className="w-full bg-bg-dark border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent"
              />
              {searchingTargetingValue && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
              )}
            </div>

            {targetingResultsValue.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                {targetingResultsValue.slice(0, 5).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (!state.interests.find(i => i.id === opt.id)) {
                        onUpdate({ interests: [...state.interests, opt] })
                      }
                      setTargetingQueryValue('')
                      setTargetingResultsValue([])
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-bg-hover border-b border-border last:border-0"
                  >
                    <div className="font-medium">{opt.name}</div>
                    {opt.path && <div className="text-zinc-500 text-xs">{opt.path.join(' > ')}</div>}
                  </button>
                ))}
              </div>
            )}

            {state.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {state.interests.map((interest) => (
                  <span
                    key={interest.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-accent/20 border border-accent/30 rounded-full text-xs text-accent"
                  >
                    {interest.name}
                    <button
                      onClick={() => onUpdate({ interests: state.interests.filter(i => i.id !== interest.id) })}
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
  )

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

          {/* Campaign duplication: Per-adset targeting */}
          {itemType === 'campaign' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Ad Sets ({campaignAdsets.length})
                <span className="text-xs text-zinc-500 font-normal ml-2">Click to edit targeting</span>
              </label>

              {loadingCampaignAdsets ? (
                <div className="flex items-center justify-center py-8 border border-border rounded-lg bg-bg-dark">
                  <Loader2 className="w-5 h-5 animate-spin text-accent" />
                </div>
              ) : campaignAdsets.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-sm border border-border rounded-lg bg-bg-dark">
                  No ad sets in this campaign
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  {adsetTargetingStates.map((state, index) => (
                    <div key={state.adsetId} className={cn(index > 0 && "border-t border-border")}>
                      {/* Adset header */}
                      <button
                        onClick={() => {
                          setExpandedAdsetId(expandedAdsetId === state.adsetId ? null : state.adsetId)
                          setAdsetLocationQuery('')
                          setAdsetLocationResults([])
                          setAdsetTargetingQuery('')
                          setAdsetTargetingResults([])
                        }}
                        className="w-full flex items-center gap-2 p-3 hover:bg-bg-hover transition-colors text-left"
                      >
                        {expandedAdsetId === state.adsetId ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        )}
                        <FileText className="w-4 h-4 text-hierarchy-adset flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{state.adsetName}</p>
                          <p className="text-xs text-zinc-500">
                            {state.hasCustomTargeting ? (
                              <span className="text-accent">Custom targeting set</span>
                            ) : (
                              state.originalTargetingSummary
                            )}
                          </p>
                        </div>
                        {state.hasCustomTargeting && (
                          <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full flex-shrink-0">
                            Modified
                          </span>
                        )}
                      </button>

                      {/* Expanded targeting editor */}
                      {expandedAdsetId === state.adsetId && (
                        <div className="p-3 border-t border-border bg-bg-dark/50">
                          {renderTargetingEditor(
                            state,
                            (updates) => updateAdsetTargeting(state.adsetId, updates),
                            adsetLocationQuery,
                            setAdsetLocationQuery,
                            adsetLocationResults,
                            setAdsetLocationResults,
                            adsetSearchingLocations,
                            adsetTargetingQuery,
                            setAdsetTargetingQuery,
                            adsetTargetingResults,
                            setAdsetTargetingResults,
                            adsetSearchingTargeting
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                <div className="p-3 border-t border-border bg-bg-dark/50">
                  {renderTargetingEditor(
                    {
                      locationType,
                      locationKey,
                      locationName,
                      locationRadius,
                      ageMin,
                      ageMax,
                      targetingMode,
                      interests: selectedInterests,
                      behaviors: selectedBehaviors
                    },
                    (updates) => {
                      if (updates.locationType !== undefined) setLocationType(updates.locationType)
                      if (updates.locationKey !== undefined) setLocationKey(updates.locationKey)
                      if (updates.locationName !== undefined) setLocationName(updates.locationName)
                      if (updates.locationRadius !== undefined) setLocationRadius(updates.locationRadius)
                      if (updates.ageMin !== undefined) setAgeMin(updates.ageMin)
                      if (updates.ageMax !== undefined) setAgeMax(updates.ageMax)
                      if (updates.targetingMode !== undefined) setTargetingMode(updates.targetingMode)
                      if (updates.interests !== undefined) setSelectedInterests(updates.interests)
                      if (updates.behaviors !== undefined) setSelectedBehaviors(updates.behaviors)
                    },
                    locationQuery,
                    setLocationQuery,
                    locationResults,
                    setLocationResults,
                    searchingLocations,
                    targetingQuery,
                    setTargetingQuery,
                    targetingResults,
                    setTargetingResults,
                    searchingTargeting
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ad Copy Editor for Ad Duplication */}
          {itemType === 'ad' && (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Edit Ad Copy Toggle */}
              <button
                onClick={() => setShowAdCopy(!showAdCopy)}
                className="w-full flex items-center justify-between p-3 hover:bg-bg-hover transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium">Edit Ad Copy</span>
                  {adCopy.hasChanges && (
                    <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full">
                      Modified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {loadingAdCopy && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
                  <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", showAdCopy && "rotate-180")} />
                </div>
              </button>

              {showAdCopy && (
                <div className="border-t border-border p-3 bg-bg-dark/50 space-y-3">
                  {loadingAdCopy ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    </div>
                  ) : (
                    <>
                      {/* Primary Text */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Primary Text</label>
                        <textarea
                          value={adCopy.primaryText}
                          onChange={(e) => updateAdCopyField('primaryText', e.target.value)}
                          placeholder="Your main ad text..."
                          rows={3}
                          className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent resize-none"
                        />
                        <p className="text-xs text-zinc-600 mt-1">125 characters recommended</p>
                      </div>

                      {/* Headline */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Headline</label>
                        <input
                          type="text"
                          value={adCopy.headline}
                          onChange={(e) => updateAdCopyField('headline', e.target.value)}
                          placeholder="Your headline..."
                          className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                        />
                        <p className="text-xs text-zinc-600 mt-1">40 characters max</p>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">
                          Description <span className="text-zinc-600 font-normal">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={adCopy.description}
                          onChange={(e) => updateAdCopyField('description', e.target.value)}
                          placeholder="Appears below headline..."
                          className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                        />
                      </div>
                    </>
                  )}
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
