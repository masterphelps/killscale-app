'use client'

import { useState, useEffect } from 'react'
import { X, MapPin, Users, Target, Lightbulb, Smartphone, Settings, Calendar, Image as ImageIcon, Video, FileText, Link2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

// Types for entity details
interface AdSetDetails {
  targeting: {
    locations: {
      countries: string[]
      regions: string[]
      cities: string[]
      zips: string[]
      locationTypes: string[]
      radius?: { distance: number; unit: string }
    }
    age: { min: number; max: number }
    genders: string
    audiences: {
      custom: string[]
      lookalike: string[]
      excluded: string[]
    }
    interests: string[]
    behaviors: string[]
    advantagePlusAudience: boolean
  }
  placements: {
    platforms: string[]
    facebookPositions: string[]
    instagramPositions: string[]
    messengerPositions: string[]
    audienceNetworkPositions: string[]
    devices: string[]
    advantagePlusPlacements: boolean
  }
  optimization: {
    goal: string
    bidStrategy: string
    billingEvent: string
  }
  schedule: {
    startTime: string | null
    endTime: string | null
  }
}

interface AdDetails {
  creative: {
    thumbnailUrl: string | null
    type: 'image' | 'video' | 'carousel' | 'unknown'
    headline: string | null
    body: string | null
    callToAction: string | null
    linkUrl: string | null
  }
}

type FetchStep = 'connecting' | 'fetching' | 'processing' | 'complete' | 'error'

interface StepConfig {
  label: string
  percent: number
}

const ADSET_STEPS: Record<FetchStep, StepConfig> = {
  connecting: { label: 'Connecting to Meta...', percent: 10 },
  fetching: { label: 'Fetching targeting & placements...', percent: 50 },
  processing: { label: 'Processing data...', percent: 85 },
  complete: { label: 'Complete!', percent: 100 },
  error: { label: 'Error', percent: 0 },
}

const AD_STEPS: Record<FetchStep, StepConfig> = {
  connecting: { label: 'Connecting to Meta...', percent: 15 },
  fetching: { label: 'Fetching creative details...', percent: 55 },
  processing: { label: 'Processing data...', percent: 90 },
  complete: { label: 'Complete!', percent: 100 },
  error: { label: 'Error', percent: 0 },
}

const STEP_ORDER: FetchStep[] = ['connecting', 'fetching', 'processing', 'complete']
const STEP_TIMINGS = [600, 400, 300] // Delays between steps in ms

interface EntityInfoModalProps {
  isOpen: boolean
  onClose: () => void
  entityType: 'adset' | 'ad'
  entityId: string
  entityName: string
  userId: string
}

export function EntityInfoModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  userId,
}: EntityInfoModalProps) {
  const [step, setStep] = useState<FetchStep>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [adsetDetails, setAdsetDetails] = useState<AdSetDetails | null>(null)
  const [adDetails, setAdDetails] = useState<AdDetails | null>(null)

  const steps = entityType === 'adset' ? ADSET_STEPS : AD_STEPS

  // Fetch data when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Reset state when closed
      setStep('connecting')
      setError(null)
      setAdsetDetails(null)
      setAdDetails(null)
      return
    }

    const fetchDetails = async () => {
      try {
        // Animate through connecting step
        setStep('connecting')
        await new Promise(r => setTimeout(r, STEP_TIMINGS[0]))

        // Start fetch
        setStep('fetching')
        const response = await fetch('/api/meta/entity-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, entityType, entityId }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch details')
        }

        // Processing step
        setStep('processing')
        await new Promise(r => setTimeout(r, STEP_TIMINGS[2]))

        // Set the data
        if (entityType === 'adset') {
          setAdsetDetails(data.details)
        } else {
          setAdDetails(data.details)
        }

        setStep('complete')
      } catch (err) {
        console.error('Failed to fetch entity details:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch details')
        setStep('error')
      }
    }

    fetchDetails()
  }, [isOpen, entityType, entityId, userId])

  if (!isOpen) return null

  const currentStepConfig = steps[step]
  const currentStepIndex = STEP_ORDER.indexOf(step)
  const isLoading = step !== 'complete' && step !== 'error'

  // Format location display
  const formatLocations = (locations: AdSetDetails['targeting']['locations']) => {
    const parts: string[] = []

    if (locations.countries.length > 0) {
      parts.push(`Countries: ${locations.countries.join(', ')}`)
    }
    if (locations.regions.length > 0) {
      const display = locations.regions.length > 3
        ? `${locations.regions.slice(0, 3).join(', ')} (+${locations.regions.length - 3} more)`
        : locations.regions.join(', ')
      parts.push(`Regions: ${display}`)
    }
    if (locations.cities.length > 0) {
      const display = locations.cities.length > 3
        ? `${locations.cities.slice(0, 3).join(', ')} (+${locations.cities.length - 3} more)`
        : locations.cities.join(', ')
      parts.push(`Cities: ${display}`)
    }
    if (locations.radius) {
      parts.push(`Radius: ${locations.radius.distance} ${locations.radius.unit}s`)
    }

    return parts.length > 0 ? parts : ['Worldwide']
  }

  // Format audience display
  const formatAudiences = (audiences: AdSetDetails['targeting']['audiences']) => {
    const parts: string[] = []

    if (audiences.custom.length > 0) {
      parts.push(`Custom: ${audiences.custom.join(', ')}`)
    }
    if (audiences.lookalike.length > 0) {
      parts.push(`Lookalike: ${audiences.lookalike.join(', ')}`)
    }
    if (audiences.excluded.length > 0) {
      parts.push(`Excluded: ${audiences.excluded.join(', ')}`)
    }

    return parts
  }

  // Render section card
  const SectionCard = ({ icon: Icon, title, children, empty }: {
    icon: React.ElementType
    title: string
    children?: React.ReactNode
    empty?: string
  }) => (
    <div className="bg-bg-dark border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-accent" />
        <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">{title}</h3>
      </div>
      {children || (
        <p className="text-sm text-foreground-muted">{empty || 'Not specified'}</p>
      )}
    </div>
  )

  // Render ad set content
  const renderAdSetContent = () => {
    if (!adsetDetails) return null
    const { targeting, placements, optimization, schedule } = adsetDetails

    return (
      <div className="space-y-4">
        {/* Locations */}
        <SectionCard icon={MapPin} title="Locations">
          {targeting.advantagePlusAudience ? (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                Advantage+ Audience
              </span>
              <span className="text-sm text-foreground-muted">Meta optimizes targeting</span>
            </div>
          ) : (
            <div className="space-y-1">
              {formatLocations(targeting.locations).map((line, i) => (
                <p key={i} className="text-sm text-foreground">{line}</p>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Demographics */}
        <SectionCard icon={Users} title="Demographics">
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-xs text-foreground-muted">Age</span>
              <p className="text-sm text-foreground">
                {targeting.age.min}-{targeting.age.max === 65 ? '65+' : targeting.age.max}
              </p>
            </div>
            <div>
              <span className="text-xs text-foreground-muted">Gender</span>
              <p className="text-sm text-foreground">{targeting.genders}</p>
            </div>
          </div>
        </SectionCard>

        {/* Audiences */}
        <SectionCard
          icon={Target}
          title="Audiences"
          empty="No custom or lookalike audiences (using broad targeting)"
        >
          {formatAudiences(targeting.audiences).length > 0 && (
            <div className="space-y-1">
              {formatAudiences(targeting.audiences).map((line, i) => (
                <p key={i} className="text-sm text-foreground">{line}</p>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Interests & Behaviors */}
        <SectionCard
          icon={Lightbulb}
          title="Interests & Behaviors"
          empty="No detailed targeting specified"
        >
          {(targeting.interests.length > 0 || targeting.behaviors.length > 0) && (
            <div className="space-y-2">
              {targeting.interests.length > 0 && (
                <div>
                  <span className="text-xs text-foreground-muted">Interests</span>
                  <p className="text-sm text-foreground">
                    {targeting.interests.length > 5
                      ? `${targeting.interests.slice(0, 5).join(', ')} (+${targeting.interests.length - 5} more)`
                      : targeting.interests.join(', ')}
                  </p>
                </div>
              )}
              {targeting.behaviors.length > 0 && (
                <div>
                  <span className="text-xs text-foreground-muted">Behaviors</span>
                  <p className="text-sm text-foreground">
                    {targeting.behaviors.length > 5
                      ? `${targeting.behaviors.slice(0, 5).join(', ')} (+${targeting.behaviors.length - 5} more)`
                      : targeting.behaviors.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* Placements */}
        <SectionCard icon={Smartphone} title="Placements">
          {placements.advantagePlusPlacements ? (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                Advantage+ Placements
              </span>
              <span className="text-sm text-foreground-muted">All placements</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <span className="text-xs text-foreground-muted">Platforms</span>
                <p className="text-sm text-foreground">{placements.platforms.join(', ')}</p>
              </div>
              {placements.facebookPositions.length > 0 && (
                <div>
                  <span className="text-xs text-foreground-muted">Facebook</span>
                  <p className="text-sm text-foreground">{placements.facebookPositions.join(', ')}</p>
                </div>
              )}
              {placements.instagramPositions.length > 0 && (
                <div>
                  <span className="text-xs text-foreground-muted">Instagram</span>
                  <p className="text-sm text-foreground">{placements.instagramPositions.join(', ')}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-foreground-muted">Devices</span>
                <p className="text-sm text-foreground">{placements.devices.join(', ')}</p>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Optimization */}
        <SectionCard icon={Settings} title="Optimization">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-foreground-muted">Goal</span>
              <span className="text-sm text-foreground">{optimization.goal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-foreground-muted">Bid Strategy</span>
              <span className="text-sm text-foreground">{optimization.bidStrategy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-foreground-muted">Billing Event</span>
              <span className="text-sm text-foreground">{optimization.billingEvent}</span>
            </div>
          </div>
        </SectionCard>

        {/* Schedule */}
        {(schedule.startTime || schedule.endTime) && (
          <SectionCard icon={Calendar} title="Schedule">
            <div className="space-y-1">
              {schedule.startTime && (
                <div className="flex justify-between">
                  <span className="text-xs text-foreground-muted">Start</span>
                  <span className="text-sm text-foreground">
                    {new Date(schedule.startTime).toLocaleDateString()}
                  </span>
                </div>
              )}
              {schedule.endTime && (
                <div className="flex justify-between">
                  <span className="text-xs text-foreground-muted">End</span>
                  <span className="text-sm text-foreground">
                    {new Date(schedule.endTime).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>
    )
  }

  // Render ad content
  const renderAdContent = () => {
    if (!adDetails) return null
    const { creative } = adDetails

    return (
      <div className="space-y-4">
        {/* Creative */}
        <SectionCard icon={creative.type === 'video' ? Video : ImageIcon} title="Creative">
          <div className="flex gap-4">
            {/* Thumbnail */}
            <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-bg-hover">
              {creative.thumbnailUrl ? (
                <img
                  src={creative.thumbnailUrl}
                  alt="Creative preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {creative.type === 'video' ? (
                    <Video className="w-8 h-8 text-foreground-muted" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-foreground-muted" />
                  )}
                </div>
              )}
            </div>
            {/* Type badge */}
            <div>
              <span className="text-xs text-foreground-muted">Type</span>
              <p className="text-sm text-foreground capitalize">{creative.type}</p>
            </div>
          </div>
        </SectionCard>

        {/* Copy */}
        <SectionCard icon={FileText} title="Copy">
          <div className="space-y-3">
            {creative.headline && (
              <div>
                <span className="text-xs text-foreground-muted">Headline</span>
                <p className="text-sm text-foreground">{creative.headline}</p>
              </div>
            )}
            {creative.body && (
              <div>
                <span className="text-xs text-foreground-muted">Body</span>
                <p className="text-sm text-foreground line-clamp-3">{creative.body}</p>
              </div>
            )}
            {!creative.headline && !creative.body && (
              <p className="text-sm text-foreground-muted">No copy available</p>
            )}
          </div>
        </SectionCard>

        {/* Destination */}
        <SectionCard icon={Link2} title="Destination">
          <div className="space-y-2">
            {creative.callToAction && (
              <div>
                <span className="text-xs text-foreground-muted">Call to Action</span>
                <p className="text-sm text-foreground">{creative.callToAction}</p>
              </div>
            )}
            {creative.linkUrl && (
              <div>
                <span className="text-xs text-foreground-muted">URL</span>
                <a
                  href={creative.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-accent hover:underline break-all"
                >
                  {creative.linkUrl.length > 50
                    ? `${creative.linkUrl.slice(0, 50)}...`
                    : creative.linkUrl}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            )}
            {!creative.callToAction && !creative.linkUrl && (
              <p className="text-sm text-foreground-muted">No destination specified</p>
            )}
          </div>
        </SectionCard>
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Panel - slide in from right */}
      <div className={cn(
        "fixed inset-y-0 right-0 w-full max-w-md bg-bg-card border-l border-border z-50",
        "transform transition-transform duration-300 ease-out",
        "flex flex-col overflow-hidden",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium flex-shrink-0",
              entityType === 'adset'
                ? "bg-hierarchy-adset/20 text-hierarchy-adset"
                : "bg-bg-hover-50 text-foreground-muted"
            )}>
              {entityType === 'adset' ? 'Ad Set' : 'Ad'}
            </span>
            <h2 className="font-semibold text-foreground truncate" title={entityName}>
              {entityName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-hover rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 text-foreground-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            // Loading state with sync-style progress
            <div className="flex flex-col items-center justify-center h-full p-8">
              {/* Spinner */}
              <div className="relative mb-8">
                {/* Outer glow */}
                <div
                  className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-pulse"
                  style={{ width: 100, height: 100, margin: -10 }}
                />

                {/* Spinner ring */}
                <div className="relative w-20 h-20">
                  {/* Track */}
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="rgba(139, 92, 246, 0.2)"
                      strokeWidth="6"
                    />
                    {/* Progress arc */}
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="url(#purpleGradient)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${currentStepConfig.percent * 2.83} 283`}
                      transform="rotate(-90 50 50)"
                      className="transition-all duration-500 ease-out"
                    />
                    <defs>
                      <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Spinning indicator */}
                  <div
                    className="absolute inset-0 animate-spin"
                    style={{ animationDuration: '2s' }}
                  >
                    <div
                      className="absolute w-2.5 h-2.5 bg-purple-400 rounded-full shadow-lg shadow-purple-500/50"
                      style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}
                    />
                  </div>

                  {/* Center percentage */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-foreground">
                      {currentStepConfig.percent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Steps list */}
              <div className="flex flex-col gap-2 min-w-[240px]">
                {STEP_ORDER.slice(0, -1).map((stepKey, index) => {
                  const config = steps[stepKey]
                  const isCompleted = index < currentStepIndex
                  const isCurrent = index === currentStepIndex

                  return (
                    <div
                      key={stepKey}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300",
                        isCurrent
                          ? "bg-purple-500/20 border border-purple-500/40"
                          : isCompleted
                            ? "bg-green-500/10 border border-green-500/20"
                            : "bg-bg-card/50 border border-border-50"
                      )}
                    >
                      {/* Status indicator */}
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                        isCompleted
                          ? "bg-green-500"
                          : isCurrent
                            ? "bg-purple-500 animate-pulse"
                            : "bg-foreground-muted"
                      )}>
                        {isCompleted ? (
                          <svg className="w-3 h-3 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isCurrent ? (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        ) : (
                          <div className="w-2 h-2 bg-foreground-muted/50 rounded-full" />
                        )}
                      </div>

                      {/* Label */}
                      <span className={cn(
                        "text-sm font-medium",
                        isCurrent
                          ? "text-purple-300"
                          : isCompleted
                            ? "text-green-400"
                            : "text-foreground-muted"
                      )}>
                        {config.label}
                      </span>

                      {/* Animated dots for current step */}
                      {isCurrent && (
                        <div className="ml-auto flex gap-1">
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : step === 'error' ? (
            // Error state
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <X className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load</h3>
              <p className="text-sm text-foreground-muted text-center mb-6">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-bg-hover text-foreground rounded-lg hover:bg-bg-card transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            // Content
            <div className="p-4">
              {entityType === 'adset' ? renderAdSetContent() : renderAdContent()}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
