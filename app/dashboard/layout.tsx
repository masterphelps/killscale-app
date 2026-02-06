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
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  // Onboarding gate: redirect to /onboarding if not completed
  useEffect(() => {
    if (!loading && user && !hadOnboardingChecked.current) {
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
  }, [user, loading, router])

  // Subscription gate: redirect to account page if no active subscription
  // Only redirect if we've never had a valid subscription (prevents false redirect on refresh)
  // MUST wait for onboarding check to complete first — otherwise this fires before the async
  // onboarding query returns and redirects new users to /account instead of /onboarding
  useEffect(() => {
    if (!loading && !subLoading && user && onboardingChecked) {
      if (plan !== 'None') {
        hadValidSubscription.current = true
        // Persist to sessionStorage to survive component remounts during navigation
        sessionStorage.setItem('ks_had_valid_subscription', 'true')
      } else if (!hadValidSubscription.current) {
        // Only redirect if we've never had a valid subscription
        router.push('/account')
      }
    }
  }, [user, loading, plan, subLoading, router, onboardingChecked])

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
              {children}
            </DashboardContent>
          </SidebarProvider>
        </PrivacyProvider>
      </AttributionProvider>
    </AccountProvider>
  )
}
