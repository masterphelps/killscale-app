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

type Workspace = {
  id: string
  name: string
  is_default: boolean
}

type DataSource = 'none' | 'csv' | 'meta_api'

type AccountContextType = {
  // Current state
  currentAccountId: string | null
  currentAccount: AdAccount | null
  accounts: AdAccount[]
  dataSource: DataSource
  loading: boolean

  // Workspace state
  currentWorkspaceId: string | null
  currentWorkspace: Workspace | null
  workspaceAccountIds: string[]  // All ad_account_ids in current workspace

  // Actions
  switchAccount: (accountId: string) => Promise<void>
  switchWorkspace: (workspaceId: string) => Promise<void>
  refetch: () => Promise<void>
}

const AccountContext = createContext<AccountContextType>({
  currentAccountId: null,
  currentAccount: null,
  accounts: [],
  dataSource: 'none',
  loading: true,
  currentWorkspaceId: null,
  currentWorkspace: null,
  workspaceAccountIds: [],
  switchAccount: async () => {},
  switchWorkspace: async () => {},
  refetch: async () => {},
})

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [dataSource, setDataSource] = useState<DataSource>('none')
  const [loading, setLoading] = useState(true)

  // Workspace state
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaceAccountIds, setWorkspaceAccountIds] = useState<string[]>([])

  // Load accounts and current selection
  // Use user.id as dependency (not user object) to avoid re-fetching on token refresh
  const userId = user?.id

  // Load workspace accounts when workspace is selected
  const loadWorkspaceAccounts = useCallback(async (workspaceId: string) => {
    const { data: wsAccounts } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    const accountIds = (wsAccounts || []).map(a => a.ad_account_id)
    setWorkspaceAccountIds(accountIds)
    return accountIds
  }, [])

  const fetchAccounts = useCallback(async () => {
    if (!userId) {
      setAccounts([])
      setCurrentAccountId(null)
      setCurrentWorkspaceId(null)
      setCurrentWorkspace(null)
      setWorkspaceAccountIds([])
      setDataSource('none')
      setLoading(false)
      return
    }

    try {
      // Check if user has a workspace selected (from profiles)
      const { data: profile } = await supabase
        .from('profiles')
        .select('selected_workspace_id')
        .eq('id', userId)
        .single()

      // If workspace is selected, load it
      if (profile?.selected_workspace_id) {
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id, name, is_default')
          .eq('id', profile.selected_workspace_id)
          .single()

        if (workspace) {
          setCurrentWorkspaceId(workspace.id)
          setCurrentWorkspace(workspace)
          await loadWorkspaceAccounts(workspace.id)
          setCurrentAccountId(null)  // Clear individual account selection
        }
      } else {
        setCurrentWorkspaceId(null)
        setCurrentWorkspace(null)
        setWorkspaceAccountIds([])
      }

      // Get meta connection with accounts and selected account
      const { data: connection, error } = await supabase
        .from('meta_connections')
        .select('ad_accounts, selected_account_id')
        .eq('user_id', userId)
        .single()

      if (error || !connection) {
        // No Meta connection - check for CSV data
        const { data: csvData } = await supabase
          .from('ad_data')
          .select('id')
          .eq('user_id', userId)
          .is('source', null)
          .limit(1)
          .single()

        if (csvData) {
          setDataSource('csv')
        } else {
          setDataSource('none')
        }
        setAccounts([])
        if (!profile?.selected_workspace_id) {
          setCurrentAccountId(null)
        }
        setLoading(false)
        return
      }

      const allAccounts: AdAccount[] = connection.ad_accounts || []

      // Filter to dashboard accounts, or use all if none marked
      const dashboardAccounts = allAccounts.filter(a => a.in_dashboard)
      const displayAccounts = dashboardAccounts.length > 0 ? dashboardAccounts : allAccounts

      setAccounts(displayAccounts)

      // Only set account if no workspace is selected
      if (!profile?.selected_workspace_id) {
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
              .eq('user_id', userId)
          }
        }

        setCurrentAccountId(selectedId)
        setDataSource(selectedId ? 'meta_api' : 'none')
      } else {
        // Workspace selected - data source is meta_api if workspace has accounts
        setDataSource('meta_api')
      }
    } catch (err) {
      console.error('Failed to load accounts:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, loadWorkspaceAccounts])

  // Initial load
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Switch to individual account (clears workspace selection)
  const switchAccount = useCallback(async (accountId: string) => {
    if (!userId || accountId === currentAccountId) return

    try {
      // Clear workspace selection in profiles
      await supabase
        .from('profiles')
        .update({ selected_workspace_id: null })
        .eq('id', userId)

      // Update selected account in meta_connections
      await supabase
        .from('meta_connections')
        .update({ selected_account_id: accountId })
        .eq('user_id', userId)

      // Update local state immediately
      setCurrentAccountId(accountId)
      setCurrentWorkspaceId(null)
      setCurrentWorkspace(null)
      setWorkspaceAccountIds([])
      setDataSource('meta_api')
    } catch (err) {
      console.error('Failed to switch account:', err)
    }
  }, [userId, currentAccountId])

  // Switch to workspace (clears individual account selection)
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!userId || workspaceId === currentWorkspaceId) return

    try {
      // Update workspace selection in profiles
      await supabase
        .from('profiles')
        .update({ selected_workspace_id: workspaceId })
        .eq('id', userId)

      // Load workspace info
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id, name, is_default')
        .eq('id', workspaceId)
        .single()

      if (workspace) {
        setCurrentWorkspaceId(workspace.id)
        setCurrentWorkspace(workspace)
        await loadWorkspaceAccounts(workspace.id)
        setCurrentAccountId(null)  // Clear individual account
        setDataSource('meta_api')
      }
    } catch (err) {
      console.error('Failed to switch workspace:', err)
    }
  }, [userId, currentWorkspaceId, loadWorkspaceAccounts])

  // Get current account object
  const currentAccount = accounts.find(a => a.id === currentAccountId) || null

  return (
    <AccountContext.Provider value={{
      currentAccountId,
      currentAccount,
      accounts,
      dataSource,
      loading,
      currentWorkspaceId,
      currentWorkspace,
      workspaceAccountIds,
      switchAccount,
      switchWorkspace,
      refetch: fetchAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  )
}

export const useAccount = () => useContext(AccountContext)
