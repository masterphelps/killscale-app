'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { Check, Loader2, Lock, Shield, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react'

type OnboardingStep = 'profile' | 'connect-meta' | 'select-accounts'

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'connect-meta', label: 'Meta Ads' },
  { key: 'select-accounts', label: 'Accounts' },
]

type AdAccount = {
  id: string
  name: string
  account_status: number
  currency: string
  in_dashboard: boolean
}

interface OnboardingState {
  firstName: string
  lastName: string
  timezone: string
  metaConnected: boolean
  adAccounts: AdAccount[]
  selectedAccountIds: Set<string>
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  { value: 'UTC', label: 'UTC' },
]

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('profile')
  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStep>>(new Set())
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [state, setState] = useState<OnboardingState>({
    firstName: '',
    lastName: '',
    timezone: 'UTC',
    metaConnected: false,
    adAccounts: [],
    selectedAccountIds: new Set(),
  })

  const stepIndex = STEPS.findIndex(s => s.key === currentStep)

  // Load existing data on mount
  const loadExistingData = useCallback(async () => {
    if (!user) return

    // Check if onboarding already completed
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, timezone, onboarding_completed, full_name')
      .eq('id', user.id)
      .single()

    if (profile?.onboarding_completed) {
      router.push('/dashboard')
      return
    }

    // Pre-fill profile from OAuth metadata or existing profile
    const fullName = profile?.full_name || user.user_metadata?.full_name || ''
    const nameParts = fullName.split(' ')
    const firstName = profile?.first_name || nameParts[0] || ''
    const lastName = profile?.last_name || nameParts.slice(1).join(' ') || ''

    // Auto-detect timezone
    let detectedTimezone = 'UTC'
    try {
      detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {}
    const timezone = profile?.timezone || detectedTimezone

    // Load meta connection
    const { data: metaConn } = await supabase
      .from('meta_connections')
      .select('ad_accounts, selected_account_id')
      .eq('user_id', user.id)
      .single()

    const metaConnected = !!metaConn?.ad_accounts?.length
    const adAccounts: AdAccount[] = metaConn?.ad_accounts || []
    const selectedAccountIds = new Set(
      adAccounts.filter((a: AdAccount) => a.in_dashboard).map((a: AdAccount) => a.id)
    )

    setState({
      firstName: firstName,
      lastName: lastName,
      timezone: timezone,
      metaConnected,
      adAccounts,
      selectedAccountIds,
    })

    // Determine starting step based on what's already filled
    const completed = new Set<OnboardingStep>()
    let startStep: OnboardingStep = 'profile'

    if (firstName.trim()) {
      completed.add('profile')
      startStep = 'connect-meta'
    }
    if (metaConnected) {
      completed.add('connect-meta')
      startStep = 'select-accounts'
    }

    // Handle OAuth return params
    const metaSuccess = searchParams.get('meta')
    const metaError = searchParams.get('meta_error')

    if (metaSuccess === 'success') {
      completed.add('connect-meta')
      // Reload meta accounts after OAuth
      const { data: freshMeta } = await supabase
        .from('meta_connections')
        .select('ad_accounts')
        .eq('user_id', user.id)
        .single()

      const freshAccounts: AdAccount[] = freshMeta?.ad_accounts || []
      const freshSelected = new Set(
        freshAccounts.filter((a: AdAccount) => a.in_dashboard).map((a: AdAccount) => a.id)
      )

      setState(prev => ({
        ...prev,
        metaConnected: true,
        adAccounts: freshAccounts,
        selectedAccountIds: freshSelected,
      }))

      startStep = 'select-accounts'
    }

    if (metaError) {
      startStep = 'connect-meta'
      setError(`Meta connection failed: ${metaError.replace(/_/g, ' ')}. Please try again.`)
    }

    setCompletedSteps(completed)
    setCurrentStep(startStep)
    setPageLoading(false)
  }, [user, router, searchParams])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }
    if (user) {
      loadExistingData()
    }
  }, [user, authLoading, router, loadExistingData])

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'profile':
        return state.firstName.trim().length > 0
      case 'connect-meta':
        return true // Can always skip
      case 'select-accounts':
        return state.selectedAccountIds.size > 0
      default:
        return true
    }
  }

  const handleNext = async () => {
    setError(null)
    setSaving(true)

    try {
      // Save current step data
      switch (currentStep) {
        case 'profile': {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              first_name: state.firstName.trim(),
              last_name: state.lastName.trim(),
              timezone: state.timezone,
              full_name: `${state.firstName.trim()} ${state.lastName.trim()}`.trim(),
            })
            .eq('id', user!.id)

          if (profileError) throw profileError
          break
        }

        case 'select-accounts': {
          // Update ad_accounts JSONB with toggled in_dashboard flags
          const updatedAccounts = state.adAccounts.map(a => ({
            ...a,
            in_dashboard: state.selectedAccountIds.has(a.id),
          }))
          const firstSelected = updatedAccounts.find(a => a.in_dashboard)

          const { error: accountsError } = await supabase
            .from('meta_connections')
            .update({
              ad_accounts: updatedAccounts,
              selected_account_id: firstSelected?.id || null,
            })
            .eq('user_id', user!.id)

          if (accountsError) throw accountsError
          break
        }

      }

      // Mark current step as completed
      setCompletedSteps(prev => { const next = new Set(Array.from(prev)); next.add(currentStep); return next })

      // Advance to next step
      const nextIndex = stepIndex + 1
      if (nextIndex >= STEPS.length) {
        // All steps done — complete onboarding
        await completeOnboarding()
      } else {
        let nextStep = STEPS[nextIndex].key

        // Auto-skip select-accounts if <=1 account or no meta connection
        if (nextStep === 'select-accounts' && (!state.metaConnected || state.adAccounts.length <= 1)) {
          setCompletedSteps(prev => { const next = new Set(Array.from(prev)); next.add('select-accounts'); return next })
          // Last step — complete onboarding
          await completeOnboarding()
          return
        }

        setCurrentStep(nextStep)
      }
    } catch (err) {
      console.error('Onboarding step error:', err)
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    setError(null)
    const nextIndex = stepIndex + 1
    if (nextIndex >= STEPS.length) {
      completeOnboarding()
    } else {
      let nextStep = STEPS[nextIndex].key

      // Auto-skip select-accounts if <=1 account or no meta connection
      if (nextStep === 'select-accounts' && (!state.metaConnected || state.adAccounts.length <= 1)) {
        completeOnboarding()
        return
      }

      setCurrentStep(nextStep)
    }
  }

  const handleBack = () => {
    setError(null)
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key)
    }
  }

  const completeOnboarding = async () => {
    setSaving(true)
    try {
      // Use server-side API (service role) to create trial + mark onboarding complete
      // Client-side supabase can't write to subscriptions or update onboarding_completed due to RLS
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.id }),
      })

      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Failed to complete onboarding')
      }

      // Set session flags so dashboard layout doesn't re-check
      sessionStorage.setItem('ks_onboarding_checked', 'true')
      // Mark that we have a valid subscription (trial just created) so the
      // subscription gate doesn't redirect to /account during the brief loading state
      sessionStorage.setItem('ks_had_valid_subscription', 'true')

      // Full page reload so subscription context re-initializes with the new trial
      // router.push would keep the stale 'None' subscription in memory
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Error completing onboarding:', err)
      setError('Failed to complete setup. Please try again.')
      setSaving(false)
    }
  }

  const toggleAccount = (accountId: string) => {
    setState(prev => {
      const next = new Set(prev.selectedAccountIds)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return { ...prev, selectedAccountIds: next }
    })
  }

  // --- Step renderers ---

  const renderProfile = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Set up your profile</h2>
        <p className="text-zinc-500 text-sm">Tell us a bit about yourself</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">First name</label>
          <input
            type="text"
            value={state.firstName}
            onChange={(e) => setState(prev => ({ ...prev, firstName: e.target.value }))}
            className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
            placeholder="Jane"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Last name</label>
          <input
            type="text"
            value={state.lastName}
            onChange={(e) => setState(prev => ({ ...prev, lastName: e.target.value }))}
            className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
            placeholder="Smith"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Timezone</label>
        <select
          value={state.timezone}
          onChange={(e) => setState(prev => ({ ...prev, timezone: e.target.value }))}
          className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent appearance-none cursor-pointer"
        >
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderConnectMeta = () => (
    <div className="space-y-6">
      <div className="text-center">
        {/* Meta + KillScale logos */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="w-14 h-14 bg-[#1877F2] rounded-2xl flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <div className="w-8 h-px bg-border relative">
            <ChevronRight className="w-4 h-4 text-zinc-500 absolute -top-2 -right-2" />
          </div>
          <div className="w-14 h-14 bg-bg-dark border border-border rounded-2xl flex items-center justify-center">
            <svg width="28" height="20" viewBox="0 0 280 50">
              <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-1">Connect your Meta ad account</h2>
        <p className="text-zinc-500 text-sm">Import campaigns, ad sets, and ads for instant performance verdicts</p>
      </div>

      {state.metaConnected ? (
        <div className="p-4 bg-verdict-scale/10 border border-verdict-scale/20 rounded-lg text-center">
          <Check className="w-5 h-5 text-verdict-scale inline mr-2" />
          <span className="text-verdict-scale font-medium">Meta account connected</span>
          <p className="text-zinc-500 text-sm mt-1">{state.adAccounts.length} ad account{state.adAccounts.length !== 1 ? 's' : ''} found</p>
        </div>
      ) : (
        <>
          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Secure connection</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Read-only by default</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Data stays private</span>
          </div>

          <button
            onClick={() => {
              window.location.href = `/api/auth/meta?user_id=${user!.id}&returnTo=/onboarding`
            }}
            className="w-full py-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Connect to Meta
          </button>
        </>
      )}
    </div>
  )

  const renderSelectAccounts = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Select ad accounts</h2>
        <p className="text-zinc-500 text-sm">Choose which accounts to track in your dashboard</p>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {state.adAccounts.map(account => (
          <label
            key={account.id}
            className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              state.selectedAccountIds.has(account.id)
                ? 'bg-accent/10 border-accent'
                : 'bg-bg-dark border-border hover:border-zinc-500'
            }`}
          >
            <input
              type="checkbox"
              checked={state.selectedAccountIds.has(account.id)}
              onChange={() => toggleAccount(account.id)}
              className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{account.name}</div>
              <div className="text-xs text-zinc-500">{account.id}</div>
            </div>
            <span className="text-xs text-zinc-500 bg-bg-hover px-2 py-0.5 rounded">
              {account.currency}
            </span>
          </label>
        ))}
      </div>

      {state.adAccounts.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <p>No ad accounts found. You may need to reconnect Meta.</p>
        </div>
      )}
    </div>
  )

  const renderStep = () => {
    switch (currentStep) {
      case 'profile': return renderProfile()
      case 'connect-meta': return renderConnectMeta()
      case 'select-accounts': return renderSelectAccounts()
    }
  }

  // Can this step be skipped?
  const isSkippable = currentStep === 'connect-meta'

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-bg-dark text-white">
      <div className="max-w-xl mx-auto py-8 px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <svg width="200" height="45" viewBox="0 0 280 50" className="inline-block">
            <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a"/>
            <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x="55" y="33" fill="white" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="24">KillScale</text>
          </svg>
        </div>

        {/* Step Progress Indicator */}
        <div className="mb-8">
          {/* Desktop: horizontal stepper */}
          <div className="hidden sm:flex items-center justify-between relative">
            {/* Background line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-border" />

            {STEPS.map((step, i) => {
              const isCompleted = completedSteps.has(step.key)
              const isCurrent = step.key === currentStep
              const isFuture = !isCompleted && !isCurrent

              return (
                <div key={step.key} className="relative flex flex-col items-center z-10" style={{ width: `${100 / STEPS.length}%` }}>
                  {/* Circle */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                    isCompleted
                      ? 'bg-verdict-scale border-verdict-scale text-white'
                      : isCurrent
                        ? 'bg-accent border-accent text-white'
                        : 'bg-bg-dark border-zinc-600 text-zinc-500'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  {/* Label */}
                  <span className={`mt-2 text-xs font-medium text-center ${
                    isCompleted ? 'text-verdict-scale' : isCurrent ? 'text-white' : 'text-zinc-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Mobile: compact step indicator */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              <span className="text-sm text-zinc-500">
                {STEPS[stepIndex].label}
              </span>
            </div>
            {/* Progress bar */}
            <div className="flex gap-1.5">
              {STEPS.map((step, i) => {
                const isCompleted = completedSteps.has(step.key)
                const isCurrent = step.key === currentStep
                return (
                  <div
                    key={step.key}
                    className={`h-1.5 flex-1 rounded-full transition-all ${
                      isCompleted
                        ? 'bg-verdict-scale'
                        : isCurrent
                          ? 'bg-accent'
                          : 'bg-zinc-700'
                    }`}
                  />
                )
              })}
            </div>
            {/* Step labels for mobile */}
            <div className="flex gap-1.5 mt-1.5">
              {STEPS.map((step, i) => {
                const isCompleted = completedSteps.has(step.key)
                const isCurrent = step.key === currentStep
                return (
                  <span
                    key={step.key}
                    className={`flex-1 text-[10px] text-center truncate ${
                      isCompleted ? 'text-verdict-scale' : isCurrent ? 'text-white' : 'text-zinc-600'
                    }`}
                  >
                    {isCompleted ? '\u2713' : ''} {step.label}
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-bg-card border border-border rounded-xl p-6 lg:p-8">
          {renderStep()}

          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between mt-6">
          {/* Back button */}
          {stepIndex > 0 ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {/* Right side buttons */}
          <div className="flex items-center gap-3">
            {/* Skip link */}
            {isSkippable && (
              <button
                onClick={handleSkip}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Skip for now
              </button>
            )}

            {/* Continue button */}
            <button
              onClick={handleNext}
              disabled={!canProceed() || saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {stepIndex === STEPS.length - 1 ? 'Finish Setup' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
