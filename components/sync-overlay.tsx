'use client'

import { useEffect, useState } from 'react'

// Platform types
export type Platform = 'meta' | 'google'

// Platform-specific step types
export type MetaSyncStep = 'connecting' | 'campaigns' | 'adsets' | 'ads' | 'insights' | 'saving' | 'complete'
export type GoogleSyncStep = 'connecting' | 'campaigns' | 'metrics' | 'saving' | 'complete'
export type SyncStep = MetaSyncStep | GoogleSyncStep

// Meta step config (6 steps - full hierarchy)
const META_STEPS: Record<MetaSyncStep, { label: string; percent: number }> = {
  connecting: { label: 'Connecting to Meta...', percent: 5 },
  campaigns: { label: 'Fetching campaigns...', percent: 20 },
  adsets: { label: 'Fetching ad sets...', percent: 40 },
  ads: { label: 'Fetching ads...', percent: 60 },
  insights: { label: 'Processing insights...', percent: 80 },
  saving: { label: 'Saving data...', percent: 95 },
  complete: { label: 'Complete!', percent: 100 },
}

// Google step config (4 steps - campaigns only)
const GOOGLE_STEPS: Record<GoogleSyncStep, { label: string; percent: number }> = {
  connecting: { label: 'Connecting to Google Ads...', percent: 10 },
  campaigns: { label: 'Fetching campaigns...', percent: 40 },
  metrics: { label: 'Processing metrics...', percent: 75 },
  saving: { label: 'Saving data...', percent: 95 },
  complete: { label: 'Complete!', percent: 100 },
}

const META_STEP_ORDER: MetaSyncStep[] = ['connecting', 'campaigns', 'adsets', 'ads', 'insights', 'saving', 'complete']
const GOOGLE_STEP_ORDER: GoogleSyncStep[] = ['connecting', 'campaigns', 'metrics', 'saving', 'complete']

// Timing for auto-advance (milliseconds per step)
const META_TIMINGS: Record<MetaSyncStep, number> = {
  connecting: 800,
  campaigns: 2000,
  adsets: 3000,
  ads: 4000,
  insights: 6000,
  saving: 2000,
  complete: 0,
}

const GOOGLE_TIMINGS: Record<GoogleSyncStep, number> = {
  connecting: 600,
  campaigns: 3000,
  metrics: 4000,
  saving: 1500,
  complete: 0,
}

interface SyncOverlayProps {
  isVisible: boolean
  currentStep?: SyncStep
  accountName?: string
  /** Platform to show sync steps for. Defaults to 'meta' */
  platform?: Platform
  /** If true, auto-advance through steps (for single API call syncs) */
  autoAdvance?: boolean
}

export function SyncOverlay({
  isVisible,
  currentStep = 'connecting',
  accountName,
  platform = 'meta',
  autoAdvance = true
}: SyncOverlayProps) {
  const [animatedStep, setAnimatedStep] = useState<SyncStep>('connecting')
  const [isExiting, setIsExiting] = useState(false)

  // Select platform-specific configs
  const stepConfig = platform === 'google' ? GOOGLE_STEPS : META_STEPS
  const stepOrder = platform === 'google' ? GOOGLE_STEP_ORDER : META_STEP_ORDER
  const timings = platform === 'google' ? GOOGLE_TIMINGS : META_TIMINGS

  // Auto-advance through steps when autoAdvance is true
  useEffect(() => {
    if (!isVisible || !autoAdvance) {
      setAnimatedStep('connecting')
      return
    }

    // Reset on new sync
    setAnimatedStep('connecting')
    setIsExiting(false)

    // Schedule step advances
    let cumulativeDelay = 0
    const timeouts: NodeJS.Timeout[] = []

    stepOrder.slice(0, -1).forEach((step, index) => {
      cumulativeDelay += timings[step as keyof typeof timings]
      const timeout = setTimeout(() => {
        if (index < stepOrder.length - 2) {
          setAnimatedStep(stepOrder[index + 1])
        }
      }, cumulativeDelay)
      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach(t => clearTimeout(t))
    }
  }, [isVisible, autoAdvance, platform, stepOrder, timings])

  // Use provided step if not auto-advancing
  const displayStep = autoAdvance ? animatedStep : currentStep
  const currentStepConfig = stepConfig[displayStep as keyof typeof stepConfig]
  const currentStepIndex = stepOrder.indexOf(displayStep as never)

  if (!isVisible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 p-8">
        {/* Purple spinning circle */}
        <div className="relative">
          {/* Outer glow */}
          <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-pulse"
               style={{ width: 120, height: 120, margin: -10 }} />

          {/* Spinner ring */}
          <div className="relative w-24 h-24">
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
                className="absolute w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-500/50"
                style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}
              />
            </div>

            {/* Center percentage */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {currentStepConfig.percent}%
              </span>
            </div>
          </div>
        </div>

        {/* Account name */}
        {accountName && (
          <div className="text-sm text-zinc-400">
            Syncing: <span className="text-white font-medium">{accountName}</span>
          </div>
        )}

        {/* Steps list */}
        <div className="flex flex-col gap-2 min-w-[280px]">
          {stepOrder.slice(0, -1).map((step, index) => {
            const config = stepConfig[step as keyof typeof stepConfig]
            const isCompleted = index < currentStepIndex
            const isCurrent = index === currentStepIndex

            return (
              <div
                key={step}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300 ${
                  isCurrent
                    ? 'bg-purple-500/20 border border-purple-500/40'
                    : isCompleted
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-zinc-800/50 border border-zinc-700/50'
                }`}
              >
                {/* Status indicator */}
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCompleted
                    ? 'bg-green-500'
                    : isCurrent
                      ? 'bg-purple-500 animate-pulse'
                      : 'bg-zinc-600'
                }`}>
                  {isCompleted ? (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  ) : (
                    <div className="w-2 h-2 bg-zinc-400 rounded-full" />
                  )}
                </div>

                {/* Label */}
                <span className={`text-sm font-medium ${
                  isCurrent
                    ? 'text-purple-300'
                    : isCompleted
                      ? 'text-green-400'
                      : 'text-zinc-500'
                }`}>
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

        {/* Tip */}
        <p className="text-xs text-zinc-500 max-w-xs text-center">
          This may take a moment depending on your account size
        </p>
      </div>
    </div>
  )
}
