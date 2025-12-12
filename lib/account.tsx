'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from './auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type AdAccount = {
  id: string
  name: string
  account_status: number
  currency: string
  in_dashboard?: boolean
}

type DataSource = 'none' | 'csv' | 'meta_api'

type AccountContextType = {
  // Current state
  currentAccountId: string | null
  currentAccount: AdAccount | null
  accounts: AdAccount[]
  dataSource: DataSource
  loading: boolean

  // Actions
  switchAccount: (accountId: string) => Promise<void>
  refetch: () => Promise<void>
}

const AccountContext = createContext<AccountContextType>({
  currentAccountId: null,
  currentAccount: null,
  accounts: [],
  dataSource: 'none',
  loading: true,
  switchAccount: async () => {},
  refetch: async () => {},
})

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [dataSource, setDataSource] = useState<DataSource>('none')
  const [loading, setLoading] = useState(true)

  // Load accounts and current selection
  const fetchAccounts = useCallback(async () => {
    if (!user) {
      setAccounts([])
      setCurrentAccountId(null)
      setDataSource('none')
      setLoading(false)
      return
    }

    try {
      // Get meta connection with accounts and selected account
      const { data: connection, error } = await supabase
        .from('meta_connections')
        .select('ad_accounts, selected_account_id')
        .eq('user_id', user.id)
        .single()

      if (error || !connection) {
        // No Meta connection - check for CSV data
        const { data: csvData } = await supabase
          .from('ad_data')
          .select('id')
          .eq('user_id', user.id)
          .is('source', null)
          .limit(1)
          .single()

        if (csvData) {
          setDataSource('csv')
        } else {
          setDataSource('none')
        }
        setAccounts([])
        setCurrentAccountId(null)
        setLoading(false)
        return
      }

      const allAccounts: AdAccount[] = connection.ad_accounts || []

      // Filter to dashboard accounts, or use all if none marked
      const dashboardAccounts = allAccounts.filter(a => a.in_dashboard)
      const displayAccounts = dashboardAccounts.length > 0 ? dashboardAccounts : allAccounts

      setAccounts(displayAccounts)

      // Determine current account
      let selectedId = connection.selected_account_id

      // If no selection or selection not in display accounts, pick first
      if (!selectedId || !displayAccounts.find(a => a.id === selectedId)) {
        selectedId = displayAccounts[0]?.id || null

        // Save this selection
        if (selectedId) {
          await supabase
            .from('meta_connections')
            .update({ selected_account_id: selectedId })
            .eq('user_id', user.id)
        }
      }

      setCurrentAccountId(selectedId)
      setDataSource(selectedId ? 'meta_api' : 'none')
    } catch (err) {
      console.error('Failed to load accounts:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Initial load
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Switch account
  const switchAccount = useCallback(async (accountId: string) => {
    if (!user || accountId === currentAccountId) return

    try {
      // Update in database
      await supabase
        .from('meta_connections')
        .update({ selected_account_id: accountId })
        .eq('user_id', user.id)

      // Update local state immediately
      setCurrentAccountId(accountId)
      setDataSource('meta_api')
    } catch (err) {
      console.error('Failed to switch account:', err)
    }
  }, [user, currentAccountId])

  // Get current account object
  const currentAccount = accounts.find(a => a.id === currentAccountId) || null

  return (
    <AccountContext.Provider value={{
      currentAccountId,
      currentAccount,
      accounts,
      dataSource,
      loading,
      switchAccount,
      refetch: fetchAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  )
}

export const useAccount = () => useContext(AccountContext)
