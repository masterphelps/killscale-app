'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase-browser'

// Track user session activity for admin dashboard
async function trackSession(userId: string) {
  try {
    // Upsert session - create new or update last_activity_at
    await supabase.from('user_sessions').upsert(
      {
        user_id: userId,
        last_activity_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
        ignoreDuplicates: false,
      }
    )
  } catch (e) {
    // Silently fail - session tracking is non-critical
    console.debug('Session tracking error:', e)
  }
}

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const lastActivityUpdate = useRef<number>(0)

  useEffect(() => {
    // Track if initial session check is done
    let initialCheckDone = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      initialCheckDone = true

      // Track session on initial load
      if (session?.user) {
        trackSession(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        // Only set loading false if initial check is done
        // This prevents race condition on refresh
        if (initialCheckDone) {
          setLoading(false)
        }

        // Track session on sign in
        if (event === 'SIGNED_IN' && session?.user) {
          trackSession(session.user.id)
        }

        if (event === 'SIGNED_OUT') {
          router.push('/login')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  // Update activity periodically (every 5 minutes) while user is active
  useEffect(() => {
    if (!user) return

    const updateActivity = () => {
      const now = Date.now()
      // Only update if more than 5 minutes since last update
      if (now - lastActivityUpdate.current > 5 * 60 * 1000) {
        lastActivityUpdate.current = now
        trackSession(user.id)
      }
    }

    // Update on visibility change (tab becomes active)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateActivity()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user])

  const signOut = async () => {
    // Clear session-specific flags (including user-scoped ID)
    sessionStorage.removeItem('ks_had_valid_subscription')
    sessionStorage.removeItem('ks_onboarding_checked')
    sessionStorage.removeItem('ks_session_user_id')
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
