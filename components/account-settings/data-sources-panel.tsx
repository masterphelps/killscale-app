'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account' // for accounts list only
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

type WorkspaceAccount = {
  id: string
  workspace_id: string
  platform: 'meta' | 'google'
  ad_account_id: string
  ad_account_name: string
  currency: string
}

interface DataSourcesPanelProps {
  workspaceId: string | null
}

export function DataSourcesPanel({ workspaceId }: DataSourcesPanelProps) {
  const { user } = useAuth()
  const { accounts, refetch, currentWorkspaceId } = useAccount()

  const [wsAccounts, setWsAccounts] = useState<WorkspaceAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addingAccount, setAddingAccount] = useState(false)

  useEffect(() => {
    if (!user || !workspaceId) {
      setLoading(false)
      return
    }
    load()
  }, [user, workspaceId])

  const load = async () => {
    if (!workspaceId) return

    const { data } = await supabase
      .from('workspace_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)

    setWsAccounts(data || [])
    setLoading(false)
  }

  const handleAdd = async (account: { id: string; name: string; platform?: string }) => {
    if (!workspaceId) return

    const platform = (account.platform || (account.id.startsWith('act_') ? 'meta' : 'google')) as 'meta' | 'google'

    const { error } = await supabase
      .from('workspace_accounts')
      .insert({
        workspace_id: workspaceId,
        platform,
        ad_account_id: account.id,
        ad_account_name: account.name,
        currency: 'USD',
      })

    if (!error) {
      load()
      // Refresh sidebar account count if editing the active workspace
      if (workspaceId === currentWorkspaceId) refetch()
    }
    setAddingAccount(false)
  }

  const handleRemove = async (accountId: string) => {
    if (!workspaceId) return

    await supabase
      .from('workspace_accounts')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('ad_account_id', accountId)

    setWsAccounts(prev => prev.filter(a => a.ad_account_id !== accountId))
    // Refresh sidebar account count if editing the active workspace
    if (workspaceId === currentWorkspaceId) refetch()
  }

  if (!workspaceId) {
    return (
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold mb-4">Data Sources</h2>
        <p className="text-sm text-zinc-500">Select a workspace to manage data sources.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  const linkedIds = new Set(wsAccounts.map(a => a.ad_account_id))
  const availableAccounts = accounts.filter(a => !linkedIds.has(a.id))

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Data Sources</h2>
        <span className="text-xs text-zinc-500">{wsAccounts.length} linked</span>
      </div>

      {wsAccounts.length > 0 ? (
        <div className="space-y-2 mb-4">
          {wsAccounts.map((account) => (
            <div
              key={account.id}
              className="p-3 bg-bg-card border border-border rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold text-white',
                  account.platform === 'google' ? 'bg-[#EA4335]' : 'bg-[#0866FF]'
                )}>
                  {account.platform === 'google' ? 'G' : 'M'}
                </span>
                <div>
                  <div className="text-sm font-medium">{account.ad_account_name}</div>
                  <div className="text-xs text-zinc-500">{account.ad_account_id.replace('act_', '')}</div>
                </div>
              </div>
              <button
                onClick={() => handleRemove(account.ad_account_id)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 mb-4">No ad accounts linked to this workspace.</p>
      )}

      {addingAccount ? (
        <div className="bg-bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="text-xs text-zinc-400 mb-2">Select an account to add:</div>
          {availableAccounts.length > 0 ? (
            availableAccounts.map(account => (
              <button
                key={account.id}
                onClick={() => handleAdd(account)}
                className="w-full text-left p-2.5 rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm"
              >
                <span className={cn(
                  'w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold text-white',
                  account.platform === 'google' ? 'bg-[#EA4335]' : 'bg-[#0866FF]'
                )}>
                  {account.platform === 'google' ? 'G' : 'M'}
                </span>
                {account.name}
              </button>
            ))
          ) : (
            <p className="text-xs text-zinc-500">All connected accounts are already linked.</p>
          )}
          <button
            onClick={() => setAddingAccount(false)}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingAccount(true)}
          className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Account
        </button>
      )}
    </div>
  )
}
