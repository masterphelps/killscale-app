'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSubscription } from '@/lib/subscription'

const PRIVACY_STORAGE_KEY = 'killscale_privacy_mode'

type PrivacyContextType = {
  isPrivacyMode: boolean
  togglePrivacyMode: () => void
  maskText: (text: string, placeholder?: string) => string
  maskEmail: (email: string) => string
}

const PrivacyContext = createContext<PrivacyContextType | null>(null)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const { plan } = useSubscription()
  const [storedPrivacyMode, setStoredPrivacyMode] = useState(false)

  // Privacy mode available for any paid user
  const hasPlan = !!plan && plan !== 'free' && plan !== ''

  // Effective privacy mode: only true if paid plan AND user has it enabled
  const isPrivacyMode = hasPlan && storedPrivacyMode

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRIVACY_STORAGE_KEY)
      if (stored === 'true') {
        setStoredPrivacyMode(true)
      }
    } catch (e) {
      // Ignore
    }
  }, [])

  // Save to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(PRIVACY_STORAGE_KEY, storedPrivacyMode.toString())
    } catch (e) {
      // Ignore
    }
  }, [storedPrivacyMode])

  const togglePrivacyMode = () => {
    if (hasPlan) {
      setStoredPrivacyMode(prev => !prev)
    }
  }

  // Mask sensitive text with asterisks or placeholder
  // Only masks if privacy mode is active (which requires Agency plan)
  const maskText = (text: string, placeholder?: string): string => {
    if (!isPrivacyMode) return text
    if (placeholder) return placeholder
    // Return asterisks matching length (min 6, max 12)
    const length = Math.min(Math.max(text.length, 6), 12)
    return '*'.repeat(length)
  }

  // Mask email addresses
  const maskEmail = (email: string): string => {
    if (!isPrivacyMode) return email
    return 'user@example.com'
  }

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacyMode, maskText, maskEmail }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacyMode() {
  const context = useContext(PrivacyContext)
  if (!context) {
    throw new Error('usePrivacyMode must be used within a PrivacyProvider')
  }
  return context
}
