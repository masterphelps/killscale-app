'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from './auth'
import { FEATURES } from './feature-flags'

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
  platform: 'meta' | 'google'
}

type Workspace = {
  id: string
  name: string
  is_default: boolean
  business_type?: 'ecommerce' | 'leadgen'
}

type DataSource = 'none' | 'csv' | 'meta_api'

type ViewMode = 'account' | 'workspace' | 'csv' | 'none'

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

  // View mode (computed)
  viewMode: ViewMode

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
  viewMode: 'none',
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

      // Get Google connection if feature enabled
      let googleAccounts: AdAccount[] = []
      if (FEATURES.GOOGLE_ADS_INTEGRATION) {
        const { data: googleConnection } = await supabase
          .from('google_connections')
          .select('customer_ids, selected_customer_id')
          .eq('user_id', userId)
          .single()

        if (googleConnection?.customer_ids) {
          googleAccounts = googleConnection.customer_ids.map((c: any) => ({
            id: c.id,
            name: c.name,
            account_status: 1, // Google doesn't have same status concept
            currency: c.currency || 'USD',
            in_dashboard: true, // Google accounts are always in dashboard for now
            platform: 'google' as const,
          }))
        }
      }

      if ((error || !connection) && googleAccounts.length === 0) {
        // No Meta or Google connection - check for CSV data
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

      // Combine Meta and Google accounts
      const metaAccounts: AdAccount[] = (connection?.ad_accounts || []).map((a: any) => ({
        ...a,
        platform: 'meta' as const,
      }))

      const allAccounts: AdAccount[] = [...metaAccounts, ...googleAccounts]

      // Filter to dashboard accounts, or use all if none marked
      const dashboardAccounts = allAccounts.filter(a => a.in_dashboard)
      const displayAccounts = dashboardAccounts.length > 0 ? dashboardAccounts : allAccounts

      setAccounts(displayAccounts)

      // Only set account if no workspace is selected
      if (!profile?.selected_workspace_id) {
        // Determine current account - prefer Meta selection, fall back to first available
        let selectedId = connection?.selected_account_id || null

        // If no selection or selection not in display accounts, pick first
        if (!selectedId || !displayAccounts.find(a => a.id === selectedId)) {
          selectedId = displayAccounts[0]?.id || null

          // Save this selection to the appropriate connection table
          if (selectedId) {
            const selectedAccount = displayAccounts.find(a => a.id === selectedId)
            if (selectedAccount?.platform === 'google') {
              await supabase
                .from('google_connections')
                .update({ selected_customer_id: selectedId })
                .eq('user_id', userId)
            } else {
              await supabase
                .from('meta_connections')
                .update({ selected_account_id: selectedId })
                .eq('user_id', userId)
            }
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

      // Determine if this is a Meta or Google account
      const isGoogleAccount = !accountId.startsWith('act_')

      if (isGoogleAccount && FEATURES.GOOGLE_ADS_INTEGRATION) {
        // Update selected customer in google_connections
        await supabase
          .from('google_connections')
          .update({ selected_customer_id: accountId })
          .eq('user_id', userId)
      } else {
        // Update selected account in meta_connections
        await supabase
          .from('meta_connections')
          .update({ selected_account_id: accountId })
          .eq('user_id', userId)
      }

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

  // Compute view mode based on current selection
  const viewMode: ViewMode = useMemo(() => {
    if (currentWorkspaceId) return 'workspace'
    if (dataSource === 'csv') return 'csv'
    if (currentAccountId) return 'account'
    return 'none'
  }, [currentWorkspaceId, currentAccountId, dataSource])

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
      viewMode,
      switchAccount,
      switchWorkspace,
      refetch: fetchAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  )
}

export const useAccount = () => useContext(AccountContext)
