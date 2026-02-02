'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase-browser'

type Subscription = {
  plan: string
  status: string
  current_period_end: string | null
  isAdminGranted?: boolean
}

type SubscriptionContextType = {
  subscription: Subscription | null
  plan: string
  loading: boolean
  isAdminGranted: boolean
  refetch: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  plan: 'None',
  loading: true,
  isAdminGranted: false,
  refetch: async () => {},
})

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  // Use user.id as dependency (not user object) to avoid re-fetching on token refresh
  const userId = user?.id

  const fetchSubscription = async () => {
    if (!userId) {
      setSubscription(null)
      setLoading(false)
      return
    }

    setLoading(true)

    // Fetch both Stripe subscription and admin-granted subscription in parallel
    const [stripeResult, adminResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('admin_granted_subscriptions')
        .select('plan, expires_at, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    const stripeSub = stripeResult.data
    const adminSub = adminResult.data

    // Check if admin-granted subscription is valid (active and not expired)
    const now = new Date()
    const adminSubValid = adminSub &&
      adminSub.is_active &&
      new Date(adminSub.expires_at) > now

    // Admin-granted subscription takes precedence if valid
    if (adminSubValid) {
      setSubscription({
        plan: adminSub.plan,
        status: 'active', // Admin-granted is always treated as active
        current_period_end: adminSub.expires_at,
        isAdminGranted: true,
      })
    } else if (stripeSub && !stripeResult.error) {
      // Check if trial has expired
      if (stripeSub.status === 'trialing' && stripeSub.current_period_end) {
        const trialEnd = new Date(stripeSub.current_period_end)
        if (trialEnd < now) {
          // Trial expired — treat as no subscription
          setSubscription(null)
          setLoading(false)
          return
        }
      }
      setSubscription({
        ...stripeSub,
        isAdminGranted: false,
      })
    } else {
      setSubscription(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchSubscription()
  }, [userId])

  // Treat both 'active' and 'trialing' as having access
  const hasAccess = subscription?.status === 'active' || subscription?.status === 'trialing'
  const plan = hasAccess
    ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
    : 'None'

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        plan,
        loading,
        isAdminGranted: subscription?.isAdminGranted || false,
        refetch: fetchSubscription
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  )
}

export const useSubscription = () => useContext(SubscriptionContext)
