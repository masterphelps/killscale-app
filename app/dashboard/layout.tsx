'use client'

import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { supabase } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { Sidebar } from '@/components/sidebar'
import { PrivacyProvider } from '@/lib/privacy-mode'
import { AccountProvider } from '@/lib/account'
import { AttributionProvider } from '@/lib/attribution'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-state'
import { Menu, X, CheckCircle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

function TrialEndedSplash() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-lg w-full bg-bg-card border border-border rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-5">
          <Zap className="w-6 h-6 text-accent" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your trial has ended</h2>
        <p className="text-zinc-400 mb-6">Choose a plan to keep using KillScale.</p>

        <div className="space-y-3 text-left mb-8">
          {[
            'Instant verdicts on every campaign',
            'AI-powered creative studio',
            'First-party pixel tracking',
            'Unlimited campaign management',
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
              <CheckCircle className="w-4 h-4 text-verdict-scale flex-shrink-0" />
              {feature}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors text-center"
          >
            View Plans
          </Link>
        </div>

        <p className="text-xs text-zinc-600 mt-4">
          Need to manage your account? Use the profile menu in the sidebar.
        </p>
      </div>
    </div>
  )
}

function DashboardContent({ children, sidebarOpen, setSidebarOpen }: {
  children: React.ReactNode
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}) {
  const { isCollapsed } = useSidebar()

  return (
    <div className="min-h-screen bg-bg-dark text-white">
      {/* Mobile Header - only shows on mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-bg-sidebar border-b border-border z-50 flex items-center justify-between px-4">
        <img src="/logo-white.png" alt="KillScale" className="h-7" />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-zinc-400 hover:text-white transition-colors"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay - only on mobile when open */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper - mobile: slides in/out, desktop: always visible */}
      <div className={`
        lg:block
        ${sidebarOpen ? 'block' : 'hidden'}
        fixed top-0 left-0 h-full z-50
      `}>
        <Sidebar />
      </div>

      {/* Main content - dynamic margin based on sidebar collapsed state */}
      <main className={cn(
        "p-4 lg:p-8 pt-20 lg:pt-8 transition-all duration-200",
        isCollapsed ? "lg:ml-16" : "lg:ml-60"
      )}>
        {children}
      </main>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const { plan, loading: subLoading } = useSubscription()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Track if we've completed initial auth check - prevents flash on tab switch
  const hasAuthChecked = useRef(false)
  // Track if we ever had a valid user - prevents blank screen on tab switch
  const hadValidUser = useRef(false)
  // Track if we ever had a valid subscription - check sessionStorage on init to persist across remounts
  const hadValidSubscription = useRef(
    typeof window !== 'undefined' && sessionStorage.getItem('ks_had_valid_subscription') === 'true'
  )
  // Onboarding check - skip if already verified this session
  const hadOnboardingChecked = useRef(
    typeof window !== 'undefined' && sessionStorage.getItem('ks_onboarding_checked') === 'true'
  )
  const [onboardingChecked, setOnboardingChecked] = useState(hadOnboardingChecked.current)

  useEffect(() => {
    if (!loading && !user && !hadValidUser.current) {
      // Only redirect if we never had a user (true login required)
      router.push('/login')
    }
    // Mark auth as checked once we have a definitive answer
    if (!loading) {
      hasAuthChecked.current = true
      if (user) {
        hadValidUser.current = true
      }
    }
  }, [user, loading, router])

  // Invalidate stale sessionStorage flags when the user changes (e.g., sign out → sign up
  // with a different email in the same tab). Without this, flags from User A bleed into User B's
  // session and cause the onboarding wizard to be skipped / subscription gate to misfire.
  useEffect(() => {
    if (!loading && user) {
      const storedUserId = sessionStorage.getItem('ks_session_user_id')
      if (storedUserId !== user.id) {
        // Different user (or first visit) — clear cached checks
        sessionStorage.removeItem('ks_onboarding_checked')
        sessionStorage.removeItem('ks_had_valid_subscription')
        sessionStorage.setItem('ks_session_user_id', user.id)
        hadOnboardingChecked.current = false
        hadValidSubscription.current = false
        setOnboardingChecked(false)
      }
    }
  }, [user, loading])

  // Onboarding gate: redirect to /onboarding if not completed
  // Demo account always sees onboarding wizard (for live demos)
  const DEMO_USER_ID = 'cab4a74f-dce0-45a2-ba75-dc53331624cc'

  useEffect(() => {
    if (!loading && user) {
      // Demo account: reset onboarding_completed so the wizard shows, then redirect once
      if (user.id === DEMO_USER_ID && !sessionStorage.getItem('ks_demo_redirected')) {
        sessionStorage.setItem('ks_demo_redirected', 'true')
        // Reset the flag in DB so onboarding page doesn't bounce back to /dashboard
        supabase.from('profiles').update({ onboarding_completed: false }).eq('id', DEMO_USER_ID).then(() => {
          router.push('/onboarding')
        })
        return
      }

      if (!hadOnboardingChecked.current) {
        supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single()
          .then(({ data, error }) => {
            if (data?.onboarding_completed === true) {
              // Explicitly completed — let through
              hadOnboardingChecked.current = true
              sessionStorage.setItem('ks_onboarding_checked', 'true')
              setOnboardingChecked(true)
            } else {
              // false, null, or query error (no profile row yet) — all mean onboarding needed
              router.push('/onboarding')
            }
          })
      }
    }
  }, [user, loading, router])

  // Subscription gate: track if user has a valid subscription
  // MUST wait for onboarding check to complete first — otherwise this fires before the async
  // onboarding query returns and causes issues
  const [showTrialEnded, setShowTrialEnded] = useState(false)
  useEffect(() => {
    if (!loading && !subLoading && user && onboardingChecked) {
      if (!hadOnboardingChecked.current) return

      if (plan !== 'None') {
        hadValidSubscription.current = true
        sessionStorage.setItem('ks_had_valid_subscription', 'true')
        setShowTrialEnded(false)
      } else if (!hadValidSubscription.current) {
        setShowTrialEnded(true)
      }
    }
  }, [user, loading, plan, subLoading, onboardingChecked])

  useEffect(() => {
    setSidebarOpen(false)
  }, [children])

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

  // Only show loading screen on initial auth check, not on tab switches
  if ((loading || subLoading) && !hasAuthChecked.current) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  // Don't render null if we previously had a valid user (prevents flash on tab switch)
  // The auth check will redirect to login if truly logged out
  if (!user && !hadValidUser.current) {
    return null
  }

  // Don't render dashboard until onboarding check completes (prevents flash before redirect)
  if (!onboardingChecked && user && !loading) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <AccountProvider>
      <AttributionProvider>
        <PrivacyProvider>
          <SidebarProvider>
            <DashboardContent sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              {showTrialEnded ? <TrialEndedSplash /> : children}
            </DashboardContent>
          </SidebarProvider>
        </PrivacyProvider>
      </AttributionProvider>
    </AccountProvider>
  )
}
