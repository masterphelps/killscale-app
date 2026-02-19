'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react'
import { useAuth } from './auth'
import { FEATURES } from './feature-flags'
import { supabase } from './supabase-browser'

export type AdAccount = {
  id: string
  name: string
  account_status: number
  currency: string
  in_dashboard?: boolean
  platform: 'meta' | 'google'
}

export type Workspace = {
  id: string
  name: string
  is_default: boolean
  business_type?: 'ecommerce' | 'leadgen'
}

type DataSource = 'none' | 'csv' | 'meta_api'

type AccountContextType = {
  // Workspace (always set after loading)
  currentWorkspaceId: string | null  // null only during initial load
  currentWorkspace: Workspace | null
  workspaceAccountIds: string[]

  // Optional account filter (within workspace)
  filterAccountId: string | null
  filterAccount: AdAccount | null

  // All connected accounts (for filter pills, launch wizard, etc.)
  accounts: AdAccount[]
  dataSource: DataSource
  loading: boolean

  // Actions
  setFilterAccount: (accountId: string | null) => void
  switchWorkspace: (workspaceId: string) => Promise<void>
  refetch: () => Promise<void>

  // Backward compat alias (filterAccountId ?? workspaceAccountIds[0] ?? null)
  // Used by 100+ callsites that pass it to APIs
  currentAccountId: string | null
  currentAccount: AdAccount | null
}

const AccountContext = createContext<AccountContextType>({
  currentWorkspaceId: null,
  currentWorkspace: null,
  workspaceAccountIds: [],
  filterAccountId: null,
  filterAccount: null,
  accounts: [],
  dataSource: 'none',
  loading: true,
  setFilterAccount: () => {},
  switchWorkspace: async () => {},
  refetch: async () => {},
  currentAccountId: null,
  currentAccount: null,
})

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [dataSource, setDataSource] = useState<DataSource>('none')
  const [loading, setLoading] = useState(true)

  // Workspace state (always populated after load)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [workspaceAccountIds, setWorkspaceAccountIds] = useState<string[]>([])

  // Optional account filter within workspace
  const [filterAccountId, setFilterAccountIdState] = useState<string | null>(null)

  const userId = user?.id

  // Load workspace accounts
  const loadWorkspaceAccounts = useCallback(async (workspaceId: string) => {
    const { data: wsAccounts } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    const accountIds = (wsAccounts || []).map(a => a.ad_account_id)
    setWorkspaceAccountIds(accountIds)
    return accountIds
  }, [])

  // Auto-link connected accounts to DEFAULT workspace only if missing
  const autoLinkAccounts = useCallback(async (workspaceId: string, connectedAccounts: AdAccount[], isDefault: boolean) => {
    if (!isDefault) return
    if (connectedAccounts.length === 0) return

    // Get existing workspace accounts
    const { data: existing } = await supabase
      .from('workspace_accounts')
      .select('ad_account_id')
      .eq('workspace_id', workspaceId)

    const existingIds = new Set((existing || []).map(a => a.ad_account_id))

    // Find accounts not yet linked
    const toLink = connectedAccounts.filter(a => !existingIds.has(a.id))

    if (toLink.length === 0) return

    // Insert missing accounts
    const rows = toLink.map(a => ({
      workspace_id: workspaceId,
      platform: a.platform,
      ad_account_id: a.id,
      ad_account_name: a.name,
      currency: a.currency || 'USD',
    }))

    await supabase.from('workspace_accounts').insert(rows)
  }, [])

  const fetchAccounts = useCallback(async () => {
    if (!userId) {
      setAccounts([])
      setCurrentWorkspaceId(null)
      setCurrentWorkspace(null)
      setWorkspaceAccountIds([])
      setFilterAccountIdState(null)
      setDataSource('none')
      setLoading(false)
      return
    }

    try {
      // Load profile to get selected workspace
      const { data: profile } = await supabase
        .from('profiles')
        .select('selected_workspace_id')
        .eq('id', userId)
        .single()

      // Get meta connection
      const { data: connection, error: metaError } = await supabase
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
            account_status: 1,
            currency: c.currency || 'USD',
            in_dashboard: true,
            platform: 'google' as const,
          }))
        }
      }

      // Combine Meta and Google accounts
      const metaAccounts: AdAccount[] = (connection?.ad_accounts || []).map((a: any) => ({
        ...a,
        platform: 'meta' as const,
      }))
      const allAccounts: AdAccount[] = [...metaAccounts, ...googleAccounts]
      const dashboardAccounts = allAccounts.filter(a => a.in_dashboard)
      const displayAccounts = dashboardAccounts.length > 0 ? dashboardAccounts : allAccounts
      setAccounts(displayAccounts)

      // Check for CSV-only users
      const hasConnectedAccounts = displayAccounts.length > 0
      if (!hasConnectedAccounts) {
        const { data: csvData } = await supabase
          .from('ad_data')
          .select('id')
          .eq('user_id', userId)
          .is('source', null)
          .limit(1)
          .single()

        setDataSource(csvData ? 'csv' : 'none')
      } else {
        setDataSource('meta_api')
      }

      // --- Always resolve to a workspace ---
      let workspaceId = profile?.selected_workspace_id
      let isDefaultWorkspace = false

      // If no workspace selected, find or ensure default
      if (!workspaceId) {
        const { data: defaultWs } = await supabase
          .from('workspaces')
          .select('id, name, is_default, business_type')
          .eq('user_id', userId)
          .eq('is_default', true)
          .single()

        if (defaultWs) {
          workspaceId = defaultWs.id
          isDefaultWorkspace = true

          // Persist selection so we don't re-query next time
          await supabase
            .from('profiles')
            .update({ selected_workspace_id: defaultWs.id })
            .eq('id', userId)

          setCurrentWorkspaceId(defaultWs.id)
          setCurrentWorkspace(defaultWs)
        }
      } else {
        // Load the selected workspace
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id, name, is_default, business_type')
          .eq('id', workspaceId)
          .single()

        if (workspace) {
          setCurrentWorkspaceId(workspace.id)
          setCurrentWorkspace(workspace)
          isDefaultWorkspace = workspace.is_default
        }
      }

      // Auto-link any unlinked connected accounts to the DEFAULT workspace only
      if (workspaceId && hasConnectedAccounts) {
        await autoLinkAccounts(workspaceId, displayAccounts, isDefaultWorkspace)
      }

      // Load workspace account IDs
      if (workspaceId) {
        await loadWorkspaceAccounts(workspaceId)
      }

      // Restore filter from localStorage
      const savedFilter = typeof window !== 'undefined'
        ? localStorage.getItem('ks_filter_account_id')
        : null
      if (savedFilter && displayAccounts.find(a => a.id === savedFilter)) {
        setFilterAccountIdState(savedFilter)
      }

    } catch (err) {
      console.error('Failed to load accounts:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, loadWorkspaceAccounts, autoLinkAccounts])

  // Initial load
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Set optional account filter (within workspace)
  const setFilterAccount = useCallback((accountId: string | null) => {
    setFilterAccountIdState(accountId)
    if (typeof window !== 'undefined') {
      if (accountId) {
        localStorage.setItem('ks_filter_account_id', accountId)
      } else {
        localStorage.removeItem('ks_filter_account_id')
      }
    }
  }, [])

  // Switch workspace (clears filter)
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!userId || workspaceId === currentWorkspaceId) return

    try {
      await supabase
        .from('profiles')
        .update({ selected_workspace_id: workspaceId })
        .eq('id', userId)

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id, name, is_default, business_type')
        .eq('id', workspaceId)
        .single()

      if (workspace) {
        setCurrentWorkspaceId(workspace.id)
        setCurrentWorkspace(workspace)
        await loadWorkspaceAccounts(workspace.id)
        setFilterAccount(null)
        setDataSource('meta_api')
      }
    } catch (err) {
      console.error('Failed to switch workspace:', err)
    }
  }, [userId, currentWorkspaceId, loadWorkspaceAccounts, setFilterAccount])

  // Backward compat: currentAccountId = filterAccountId ?? first workspace account
  const currentAccountId = useMemo(() => {
    return filterAccountId ?? workspaceAccountIds[0] ?? null
  }, [filterAccountId, workspaceAccountIds])

  // Resolve account objects
  const filterAccount = useMemo(() => {
    return filterAccountId ? accounts.find(a => a.id === filterAccountId) || null : null
  }, [filterAccountId, accounts])

  const currentAccount = useMemo(() => {
    return currentAccountId ? accounts.find(a => a.id === currentAccountId) || null : null
  }, [currentAccountId, accounts])

  return (
    <AccountContext.Provider value={{
      currentWorkspaceId,
      currentWorkspace,
      workspaceAccountIds,
      filterAccountId,
      filterAccount,
      accounts,
      dataSource,
      loading,
      setFilterAccount,
      switchWorkspace,
      refetch: fetchAccounts,
      currentAccountId,
      currentAccount,
    }}>
      {children}
    </AccountContext.Provider>
  )
}

export const useAccount = () => useContext(AccountContext)
