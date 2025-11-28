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
  plan: 'Free',
  loading: true,
  refetch: async () => {},
})

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSubscription = async () => {
    if (!user) {
      setSubscription(null)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
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
  }, [user])

  const plan = subscription?.status === 'active' 
    ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
    : 'Free'

  return (
    <SubscriptionContext.Provider value={{ subscription, plan, loading, refetch: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export const useSubscription = () => useContext(SubscriptionContext)
