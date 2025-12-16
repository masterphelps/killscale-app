'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from './auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Subscription = {
  plan: string
  status: string
  current_period_end: string | null
}

type SubscriptionContextType = {
  subscription: Subscription | null
  plan: string
  loading: boolean
  refetch: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  plan: 'None',
  loading: true,
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

    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single()

    if (data && !error) {
      setSubscription(data)
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
    <SubscriptionContext.Provider value={{ subscription, plan, loading, refetch: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export const useSubscription = () => useContext(SubscriptionContext)
