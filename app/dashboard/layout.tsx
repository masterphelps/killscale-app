'use client'

import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
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
        <svg width="140" height="28" viewBox="0 0 240 40">
          <rect x="4" y="6" width="32" height="28" rx="6" fill="#1a1a1a" stroke="#333" strokeWidth="1"/>
          <path d="M12 15 L12 25 L8 21 M12 25 L16 21" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M24 25 L24 15 L20 19 M24 15 L28 19" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="46" y="27" fill="white" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="20">KillScale</text>
        </svg>
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
  // Track if we ever had a valid subscription - prevents redirect on tab switch/refresh
  const hadValidSubscription = useRef(false)

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

  // Subscription gate: redirect to account page if no active subscription
  // Only redirect if we've never had a valid subscription (prevents false redirect on refresh)
  useEffect(() => {
    if (!loading && !subLoading && user) {
      if (plan !== 'None') {
        hadValidSubscription.current = true
      } else if (!hadValidSubscription.current) {
        // Only redirect if we've never had a valid subscription
        router.push('/account')
      }
    }
  }, [user, loading, plan, subLoading, router])

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
