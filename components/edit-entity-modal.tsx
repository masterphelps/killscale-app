'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Wand2, AlertTriangle, Search, Target, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type EntityType = 'campaign' | 'adset' | 'ad'

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
  path?: string[]
}

const RADIUS_OPTIONS = [10, 15, 25, 35, 50]

type EditEntityModalProps = {
  isOpen: boolean
  onClose: () => void
  entityType: EntityType
  entityId: string
  entityName: string
  campaignName?: string  // For ads/adsets, to build UTM template
  adsetId?: string       // For ads, to build UTM template
  adAccountId?: string   // For updating creatives
  userId: string
  onUpdate: () => void   // Callback to refresh data after update
}

export function EditEntityModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  campaignName,
  adsetId,
  adAccountId,
  userId,
  onUpdate,
}: EditEntityModalProps) {
  const [name, setName] = useState(entityName)
  const [urlTags, setUrlTags] = useState('')
  const [primaryText, setPrimaryText] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingCreative, setIsFetchingCreative] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Targeting state for adsets
  const [showTargeting, setShowTargeting] = useState(false)
  const [isFetchingTargeting, setIsFetchingTargeting] = useState(false)
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
  const [targetingQuery, setTargetingQuery] = useState('')
  const [targetingResults, setTargetingResults] = useState<TargetingOption[]>([])
  const [searchingTargeting, setSearchingTargeting] = useState(false)
  const [targetingChanged, setTargetingChanged] = useState(false)

  // Fetch current creative data for ads
  useEffect(() => {
    if (isOpen && entityType === 'ad') {
      fetchCreativeData()
    }
  }, [isOpen, entityType, entityId])

  // Fetch current targeting for adsets
  useEffect(() => {
    if (isOpen && entityType === 'adset') {
      fetchTargetingData()
    }
  }, [isOpen, entityType, entityId])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(entityName)
      setError(null)
      setSuccess(null)
      setShowTargeting(false)
      setTargetingChanged(false)
    }
  }, [isOpen, entityName])

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

  const fetchTargetingData = async () => {
    setIsFetchingTargeting(true)
    try {
      const res = await fetch(`/api/meta/get-adset-targeting?userId=${userId}&adsetId=${entityId}`)
      const data = await res.json()
      if (data.success && data.targeting) {
        const t = data.targeting
        setLocationType(t.locationType)
        setLocationKey(t.locationKey || '')
        setLocationName(t.locationName || '')
        setLocationRadius(t.locationRadius || 25)
        setAgeMin(t.ageMin || 18)
        setAgeMax(t.ageMax || 65)
        setTargetingMode(t.targetingMode || 'broad')
        setSelectedInterests(t.interests || [])
      }
    } catch (err) {
      console.error('Failed to fetch targeting data:', err)
    } finally {
      setIsFetchingTargeting(false)
    }
  }

  const fetchCreativeData = async () => {
    setIsFetchingCreative(true)
    try {
      const res = await fetch(`/api/meta/get-ad-creative?userId=${userId}&adId=${entityId}`)
      const data = await res.json()
      if (data.success) {
        setUrlTags(data.urlTags || '')
        setPrimaryText(data.primaryText || '')
        setHeadline(data.headline || '')
        setDescription(data.description || '')
      }
    } catch (err) {
      console.error('Failed to fetch creative data:', err)
    } finally {
      setIsFetchingCreative(false)
    }
  }

  const applyKillScaleTemplate = () => {
    const safeCampaignName = (campaignName || 'campaign').replace(/\s+/g, '_')
    const template = [
      'utm_source=facebook',
      'utm_medium=paid',
      `utm_campaign=${safeCampaignName}`,
      `utm_content=${entityId}`,
      `utm_term=${adsetId || ''}`,
    ].join('&')
    setUrlTags(template)
  }

  const handleSaveName = async () => {
    if (!name.trim() || name === entityName) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, entityId, entityType, name: name.trim() })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Name updated!')
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveTargeting = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/update-adset-targeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          adsetId: entityId,
          targeting: {
            locationType,
            locationKey: locationType === 'city' ? locationKey : undefined,
            locationRadius: locationType === 'city' ? locationRadius : undefined,
            countries: locationType === 'country' ? ['US'] : undefined,
            ageMin,
            ageMax,
            targetingMode,
            interests: targetingMode === 'custom' ? selectedInterests : undefined
          }
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Targeting updated!')
      setTargetingChanged(false)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update targeting')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveCreative = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/update-ad-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          adId: entityId,
          adAccountId,
          urlTags,
          primaryText,
          headline,
          description
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Ad creative updated!')
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ad creative')
    } finally {
      setIsLoading(false)
    }
  }

  const markTargetingChanged = () => {
    setTargetingChanged(true)
  }

  if (!isOpen) return null

  const content = (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">
            Edit {entityType === 'adset' ? 'Ad Set' : entityType.charAt(0).toUpperCase() + entityType.slice(1)}
          </h2>
          <p className="text-sm text-zinc-500 truncate max-w-[250px]">{entityName}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Learning Phase Warning - ads only */}
      {entityType === 'ad' && !success && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Learning Phase:</span> Editing creative will create a new version.
            Meta&apos;s algorithm will re-enter learning phase, which may temporarily affect performance.
          </div>
        </div>
      )}

      {/* Name field - all entity types */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Name</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSaveName}
            disabled={isLoading || !name.trim() || name === entityName}
            className="px-4 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>

      {/* Targeting editing - adsets only */}
      {entityType === 'adset' && (
        <div className="mb-6">
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Targeting header - collapsible */}
            <button
              onClick={() => setShowTargeting(!showTargeting)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">Audience Targeting</span>
                {targetingChanged && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    Unsaved
                  </span>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", showTargeting && "rotate-180")} />
            </button>

            {showTargeting && (
              <div className="p-4 border-t border-border bg-bg-dark/50 space-y-4">
                {isFetchingTargeting ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <>
                    {/* Location Type */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Location</label>
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={() => { setLocationType('country'); markTargetingChanged() }}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                            locationType === 'country'
                              ? "bg-accent/20 border-accent text-accent"
                              : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                          )}
                        >
                          United States
                        </button>
                        <button
                          onClick={() => { setLocationType('city'); markTargetingChanged() }}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
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
                                markTargetingChanged()
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
                                    markTargetingChanged()
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-bg-hover border-b border-border last:border-0"
                                >
                                  {loc.name}, {loc.region}, {loc.countryName}
                                </button>
                              ))}
                            </div>
                          )}

                          {locationKey && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-zinc-400">Radius:</span>
                              <select
                                value={locationRadius}
                                onChange={(e) => { setLocationRadius(parseInt(e.target.value)); markTargetingChanged() }}
                                className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-sm"
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
                            markTargetingChanged()
                          }}
                          className="bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm"
                        >
                          {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(age => (
                            <option key={age} value={age}>{age}</option>
                          ))}
                        </select>
                        <span className="text-sm text-zinc-400">to</span>
                        <select
                          value={ageMax}
                          onChange={(e) => {
                            const newMax = parseInt(e.target.value)
                            setAgeMax(newMax)
                            setAgeMin(Math.min(ageMin, newMax))
                            markTargetingChanged()
                          }}
                          className="bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm"
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
                            markTargetingChanged()
                          }}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                            targetingMode === 'broad'
                              ? "bg-accent/20 border-accent text-accent"
                              : "bg-bg-dark border-border text-zinc-400 hover:border-zinc-500"
                          )}
                        >
                          Broad Audience
                        </button>
                        <button
                          onClick={() => { setTargetingMode('custom'); markTargetingChanged() }}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
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
                                      markTargetingChanged()
                                    }
                                    setTargetingQuery('')
                                    setTargetingResults([])
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-bg-hover border-b border-border last:border-0"
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
                                    onClick={() => {
                                      setSelectedInterests(selectedInterests.filter(i => i.id !== interest.id))
                                      markTargetingChanged()
                                    }}
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

                    {/* Learning Phase Warning */}
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">Learning Phase:</span> Changing targeting may cause the ad set to re-enter learning phase.
                      </div>
                    </div>

                    {/* Save Targeting Button */}
                    <button
                      onClick={handleSaveTargeting}
                      disabled={isLoading || !targetingChanged}
                      className="w-full px-4 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Targeting'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Budget hint */}
          <p className="text-sm text-zinc-500 mt-3">
            To edit budget, use the budget button on the ad set row.
          </p>
        </div>
      )}

      {/* Creative editing - ads only */}
      {entityType === 'ad' && (
        <>
          {isFetchingCreative ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Primary Text */}
              <div>
                <label className="block text-sm font-medium mb-2">Primary Text</label>
                <textarea
                  value={primaryText}
                  onChange={(e) => setPrimaryText(e.target.value)}
                  placeholder="Your driveway looking rough? We'll make it look brand new..."
                  rows={4}
                  className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent resize-none"
                />
                <p className="text-xs text-zinc-500 mt-1">125 characters recommended</p>
              </div>

              {/* Headline */}
              <div>
                <label className="block text-sm font-medium mb-2">Headline</label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Free Quote - Same Day Service"
                  className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
                <p className="text-xs text-zinc-500 mt-1">40 characters max</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Description <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Professional service you can trust"
                  className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
                />
                <p className="text-xs text-zinc-500 mt-1">Appears below headline in the link preview</p>
              </div>

              {/* UTM Parameters Section */}
              <div className="border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">UTM Parameters</label>
                  <button
                    onClick={applyKillScaleTemplate}
                    className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
                  >
                    <Wand2 className="w-3 h-3" />
                    Use KillScale Template
                  </button>
                </div>
                <textarea
                  value={urlTags}
                  onChange={(e) => setUrlTags(e.target.value)}
                  placeholder="utm_source=facebook&utm_medium=paid&..."
                  rows={3}
                  className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-accent resize-none"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Parameters appended to destination URLs
                </p>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveCreative}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Changes'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Info text for campaign budget editing */}
      {entityType === 'campaign' && (
        <div className="text-sm text-zinc-500 border-t border-border pt-4">
          To edit budget, use the budget button on the campaign row.
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Mobile: Bottom sheet */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full bg-bg-card rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
          {content}
          <div className="h-6" />
        </div>
      </div>

      {/* Desktop: Centered modal */}
      <div className="hidden lg:block">
        <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-[90vh] overflow-y-auto">
          {content}
        </div>
      </div>
    </>
  )
}
