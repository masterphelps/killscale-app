'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Layers, X, Edit2, Check, AlertCircle, Lock, Users, UserPlus, Copy, ChevronDown, ChevronUp, Globe, ExternalLink } from 'lucide-react'
import { useAuth, supabase } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { useAccount } from '@/lib/account'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Workspace = {
  id: string
  name: string
  description: string | null
  created_at: string
}

type WorkspaceAccount = {
  id: string
  workspace_id: string
  platform: 'meta' | 'google'
  ad_account_id: string
  ad_account_name: string
  currency: string
}

type WorkspaceMember = {
  id: string
  userId: string
  email: string
  role: string
  canLogWalkins: boolean
  joinedAt: string
}

type WorkspaceInvite = {
  id: string
  email: string
  role: string
  canLogWalkins: boolean
  inviteUrl: string
  expiresAt: string
}

// Workspace limits per tier
// Launch: Hidden default workspace only (no visible workspaces)
// Scale: 2 workspaces, Pro: unlimited
const WORKSPACE_LIMITS: Record<string, number> = {
  'Launch': 0,
  'Scale': 2,
  'Pro': 100,
}

export default function WorkspacesPage() {
  const { user } = useAuth()
  const { plan } = useSubscription()
  const { accounts } = useAccount()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceAccounts, setWorkspaceAccounts] = useState<Record<string, WorkspaceAccount[]>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [addingToWorkspace, setAddingToWorkspace] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Member management state (Agency only)
  const [workspaceMembers, setWorkspaceMembers] = useState<Record<string, WorkspaceMember[]>>({})
  const [workspaceInvites, setWorkspaceInvites] = useState<Record<string, WorkspaceInvite[]>>({})
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [invitingToWorkspace, setInvitingToWorkspace] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteCanLogWalkins, setInviteCanLogWalkins] = useState(true)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null)

  // Client Portal state
  const [expandedPortal, setExpandedPortal] = useState<string | null>(null)
  const [portalSettings, setPortalSettings] = useState<Record<string, { enabled: boolean; url: string | null; hasPin: boolean }>>({})
  const [portalPin, setPortalPin] = useState('')
  const [savingPortal, setSavingPortal] = useState(false)
  const [copiedPortalUrl, setCopiedPortalUrl] = useState<string | null>(null)

  const workspaceLimit = WORKSPACE_LIMITS[plan] || 0
  const canCreateWorkspace = workspaces.length < workspaceLimit

  // Load workspaces
  useEffect(() => {
    if (!user) return

    const loadWorkspaces = async () => {
      // Only load non-default workspaces (hide the default workspace)
      const { data: ws, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_default', false)
        .order('created_at', { ascending: false })

      if (wsError) {
        // Table might not exist yet
        console.error('Workspaces table error:', wsError)
        setLoading(false)
        return
      }

      if (ws) {
        setWorkspaces(ws)

        // Load accounts for each workspace
        const accountsMap: Record<string, WorkspaceAccount[]> = {}
        for (const w of ws) {
          const { data: accts } = await supabase
            .from('workspace_accounts')
            .select('*')
            .eq('workspace_id', w.id)

          accountsMap[w.id] = accts || []
        }
        setWorkspaceAccounts(accountsMap)
      }

      setLoading(false)
    }

    loadWorkspaces()
  }, [user])

  const handleCreateWorkspace = async () => {
    if (!user || !newWorkspaceName.trim()) return

    if (!canCreateWorkspace) {
      setError(`${plan} plan allows ${workspaceLimit} workspace${workspaceLimit !== 1 ? 's' : ''}. Upgrade to create more.`)
      return
    }

    setCreating(true)
    setError('')

    const { data, error: createError } = await supabase
      .from('workspaces')
      .insert({
        user_id: user.id,
        name: newWorkspaceName.trim(),
        is_default: false,  // Explicitly set - user-created workspaces are NOT default
      })
      .select()
      .single()

    setCreating(false)

    if (createError) {
      console.error('Create workspace error:', createError)
      if (createError.code === '42P01') {
        setError('Workspaces feature is not yet available. Database setup required.')
      } else {
        setError(`Failed to create workspace: ${createError.message}`)
      }
    } else if (data) {
      setWorkspaces(prev => [data, ...prev])
      setWorkspaceAccounts(prev => ({ ...prev, [data.id]: [] }))
      setNewWorkspaceName('')
      setShowCreateForm(false)
    }
  }

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!confirm('Delete this workspace? This cannot be undone.')) return

    const { error } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId)

    if (!error) {
      setWorkspaces(prev => prev.filter(w => w.id !== workspaceId))
      setWorkspaceAccounts(prev => {
        const next = { ...prev }
        delete next[workspaceId]
        return next
      })
    }
  }

  const handleRenameWorkspace = async (workspaceId: string) => {
    if (!editingName.trim()) return

    const { error } = await supabase
      .from('workspaces')
      .update({ name: editingName.trim() })
      .eq('id', workspaceId)

    if (!error) {
      setWorkspaces(prev => prev.map(w =>
        w.id === workspaceId ? { ...w, name: editingName.trim() } : w
      ))
    }

    setEditingId(null)
    setEditingName('')
  }

  const handleAddAccount = async (workspaceId: string, account: { id: string; name: string }) => {
    const { error } = await supabase
      .from('workspace_accounts')
      .insert({
        workspace_id: workspaceId,
        platform: 'meta',
        ad_account_id: account.id,
        ad_account_name: account.name,
        currency: 'USD',
      })

    if (!error) {
      setWorkspaceAccounts(prev => ({
        ...prev,
        [workspaceId]: [
          ...prev[workspaceId],
          {
            id: crypto.randomUUID(),
            workspace_id: workspaceId,
            platform: 'meta',
            ad_account_id: account.id,
            ad_account_name: account.name,
            currency: 'USD',
          }
        ]
      }))
    }

    setAddingToWorkspace(null)
  }

  const handleRemoveAccount = async (workspaceId: string, accountId: string) => {
    const { error } = await supabase
      .from('workspace_accounts')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('ad_account_id', accountId)

    if (!error) {
      setWorkspaceAccounts(prev => ({
        ...prev,
        [workspaceId]: prev[workspaceId].filter(a => a.ad_account_id !== accountId)
      }))
    }
  }

  // Get available accounts (not already in this workspace)
  const getAvailableAccounts = (workspaceId: string) => {
    const existingIds = workspaceAccounts[workspaceId]?.map(a => a.ad_account_id) || []
    return accounts.filter(a => !existingIds.includes(a.id))
  }

  // Pro-only: Load members and invites for a workspace
  const loadTeamData = async (workspaceId: string) => {
    if (!user?.id || plan !== 'Pro') return

    try {
      // Load members
      const membersRes = await fetch(`/api/workspace/members?workspaceId=${workspaceId}&userId=${user.id}`)
      const membersData = await membersRes.json()
      if (membersData.members) {
        setWorkspaceMembers(prev => ({ ...prev, [workspaceId]: membersData.members }))
      }

      // Load invites
      const invitesRes = await fetch(`/api/workspace/invite?workspaceId=${workspaceId}&userId=${user.id}`)
      const invitesData = await invitesRes.json()
      if (invitesData.invites) {
        setWorkspaceInvites(prev => ({ ...prev, [workspaceId]: invitesData.invites }))
      }
    } catch (err) {
      console.error('Failed to load team data:', err)
    }
  }

  // Load team data when expanding
  useEffect(() => {
    if (expandedTeam) {
      loadTeamData(expandedTeam)
    }
  }, [expandedTeam])

  const handleSendInvite = async (workspaceId: string) => {
    if (!user?.id || !inviteEmail.trim()) return

    setSendingInvite(true)
    try {
      const res = await fetch('/api/workspace/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId: user.id,
          email: inviteEmail.trim(),
          role: inviteRole,
          canLogWalkins: inviteCanLogWalkins
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send invite')
        return
      }

      // Add to invites list
      setWorkspaceInvites(prev => ({
        ...prev,
        [workspaceId]: [
          ...(prev[workspaceId] || []),
          {
            id: data.invite.id,
            email: data.invite.email,
            role: data.invite.role,
            canLogWalkins: inviteCanLogWalkins,
            inviteUrl: data.invite.inviteUrl,
            expiresAt: data.invite.expiresAt
          }
        ]
      }))

      // Reset form
      setInviteEmail('')
      setInviteRole('viewer')
      setInviteCanLogWalkins(true)
      setInvitingToWorkspace(null)
    } catch (err) {
      setError('Failed to send invite')
    } finally {
      setSendingInvite(false)
    }
  }

  const handleCancelInvite = async (workspaceId: string, inviteId: string) => {
    if (!user?.id) return

    try {
      const res = await fetch(`/api/workspace/invite?inviteId=${inviteId}&userId=${user.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setWorkspaceInvites(prev => ({
          ...prev,
          [workspaceId]: prev[workspaceId]?.filter(inv => inv.id !== inviteId) || []
        }))
      }
    } catch (err) {
      console.error('Failed to cancel invite:', err)
    }
  }

  const handleRemoveMember = async (workspaceId: string, memberId: string) => {
    if (!user?.id || !confirm('Remove this member?')) return

    try {
      const res = await fetch(`/api/workspace/members?memberId=${memberId}&userId=${user.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setWorkspaceMembers(prev => ({
          ...prev,
          [workspaceId]: prev[workspaceId]?.filter(m => m.id !== memberId) || []
        }))
      }
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  const copyInviteLink = async (inviteUrl: string, inviteId: string) => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopiedInvite(inviteId)
    setTimeout(() => setCopiedInvite(null), 2000)
  }

  // Client Portal functions
  const loadPortalSettings = async (workspaceId: string) => {
    if (!user?.id) return

    try {
      const res = await fetch(`/api/portal/settings?workspaceId=${workspaceId}&userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setPortalSettings(prev => ({
          ...prev,
          [workspaceId]: {
            enabled: data.portalEnabled,
            url: data.portalUrl,
            hasPin: data.hasPin
          }
        }))
      }
    } catch (err) {
      console.error('Failed to load portal settings:', err)
    }
  }

  const handleSetupPortal = async (workspaceId: string) => {
    if (!user?.id || !portalPin || portalPin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }

    setSavingPortal(true)
    try {
      const res = await fetch('/api/portal/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId: user.id,
          pin: portalPin,
          enabled: true
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to setup portal')
        return
      }

      setPortalSettings(prev => ({
        ...prev,
        [workspaceId]: {
          enabled: data.portalEnabled,
          url: data.portalUrl,
          hasPin: true
        }
      }))
      setPortalPin('')
    } catch (err) {
      setError('Failed to setup portal')
    } finally {
      setSavingPortal(false)
    }
  }

  const handleTogglePortal = async (workspaceId: string, enabled: boolean) => {
    if (!user?.id) return

    try {
      const res = await fetch('/api/portal/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId: user.id,
          enabled
        })
      })

      if (res.ok) {
        setPortalSettings(prev => ({
          ...prev,
          [workspaceId]: {
            ...prev[workspaceId],
            enabled
          }
        }))
      }
    } catch (err) {
      console.error('Failed to toggle portal:', err)
    }
  }

  const copyPortalUrl = async (url: string, workspaceId: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedPortalUrl(workspaceId)
    setTimeout(() => setCopiedPortalUrl(null), 2000)
  }

  // Load portal settings when expanding
  useEffect(() => {
    if (expandedPortal && !portalSettings[expandedPortal]) {
      loadPortalSettings(expandedPortal)
    }
  }, [expandedPortal])

  const isAgency = plan === 'Pro'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  // Check if user is Scale+ (can access workspaces)
  const isProPlus = plan === 'Scale' || plan === 'Pro'

  // Show upgrade prompt for Launch tier
  if (!isProPlus) {
    return (
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Workspaces</h1>
          <p className="text-zinc-500">Group ad accounts from multiple platforms into unified views</p>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Unlock Workspaces</h2>
          <p className="text-zinc-500 mb-6 max-w-md mx-auto">
            Combine metrics from multiple ad accounts (Meta + Google) into unified views.
            Upgrade to Pro to create workspaces.
          </p>
          <div className="space-y-4">
            <ul className="text-sm text-left max-w-xs mx-auto space-y-2 text-zinc-400">
              <li className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                Aggregate data across platforms
              </li>
              <li className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                See blended ROAS metrics
              </li>
              <li className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                One pixel per workspace
              </li>
            </ul>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent to-purple-500 hover:from-accent-hover hover:to-purple-400 text-white rounded-lg font-medium transition-all"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Workspaces</h1>
          <p className="text-zinc-500">Group ad accounts from multiple platforms into unified views</p>
        </div>
        <div className="text-sm text-zinc-500">
          {workspaces.length} / {workspaceLimit} workspaces
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create Workspace */}
      {showCreateForm ? (
        <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-4">Create Workspace</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="Workspace name..."
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleCreateWorkspace}
              disabled={creating || !newWorkspaceName.trim()}
              className="flex items-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Create
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewWorkspaceName('')
              }}
              className="p-3 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : canCreateWorkspace ? (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full mb-6 p-4 border-2 border-dashed border-border hover:border-accent rounded-xl text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Workspace
        </button>
      ) : (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <Lock className="w-4 h-4" />
            Workspace limit reached
          </div>
          <Link
            href="/pricing"
            className="text-sm text-amber-500 hover:text-amber-400 font-medium"
          >
            Upgrade for more
          </Link>
        </div>
      )}

      {/* Workspaces List */}
      {workspaces.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <Layers className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <h3 className="text-lg font-medium mb-2">No Workspaces Yet</h3>
          <p className="text-zinc-500 text-sm">
            Create a workspace to combine metrics from multiple ad accounts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {workspaces.map((workspace) => {
            const wsAccounts = workspaceAccounts[workspace.id] || []
            const availableAccounts = getAvailableAccounts(workspace.id)

            return (
              <div
                key={workspace.id}
                className="bg-bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  {editingId === workspace.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRenameWorkspace(workspace.id)}
                        className="p-1.5 text-verdict-scale hover:bg-verdict-scale/10 rounded transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setEditingName('')
                        }}
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-accent" />
                        <span className="font-medium">{workspace.name}</span>
                        <span className="text-xs text-zinc-500">
                          {wsAccounts.length} account{wsAccounts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingId(workspace.id)
                            setEditingName(workspace.name)
                          }}
                          className="p-1.5 text-zinc-500 hover:text-white hover:bg-bg-hover rounded transition-colors"
                          title="Rename"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Accounts */}
                <div className="p-4">
                  {wsAccounts.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-2">
                      No accounts added yet
                    </p>
                  ) : (
                    <div className="space-y-2 mb-4">
                      {wsAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-3 bg-bg-dark rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              account.platform === 'meta'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-green-500/20 text-green-400'
                            }`}>
                              {account.platform === 'meta' ? 'Meta' : 'Google'}
                            </span>
                            <span className="text-sm">{account.ad_account_name}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveAccount(workspace.id, account.ad_account_id)}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Account */}
                  {addingToWorkspace === workspace.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent"
                        defaultValue=""
                        onChange={(e) => {
                          const account = availableAccounts.find(a => a.id === e.target.value)
                          if (account) {
                            handleAddAccount(workspace.id, account)
                          }
                        }}
                      >
                        <option value="" disabled>Select an account...</option>
                        {availableAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setAddingToWorkspace(null)}
                        className="p-2 text-zinc-500 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : availableAccounts.length > 0 ? (
                    <button
                      onClick={() => setAddingToWorkspace(workspace.id)}
                      className="w-full py-2 border border-dashed border-border hover:border-accent rounded-lg text-sm text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Account
                    </button>
                  ) : (
                    <p className="text-xs text-zinc-600 text-center">
                      All connected accounts are in this workspace
                    </p>
                  )}
                </div>

                {/* Client Portal */}
                <div className="border-t border-border">
                  <button
                    onClick={() => setExpandedPortal(expandedPortal === workspace.id ? null : workspace.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-bg-hover/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium">Client Portal</span>
                      {portalSettings[workspace.id]?.enabled && (
                        <span className="px-2 py-0.5 text-xs rounded bg-cyan-500/20 text-cyan-400">Active</span>
                      )}
                    </div>
                    {expandedPortal === workspace.id ? (
                      <ChevronUp className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>

                  {expandedPortal === workspace.id && (
                    <div className="p-4 pt-0 space-y-3">
                      {portalSettings[workspace.id]?.hasPin ? (
                        <>
                          {/* Portal URL and toggle */}
                          <div className="p-3 bg-bg-dark rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-zinc-400">Portal Status</span>
                              <button
                                onClick={() => handleTogglePortal(workspace.id, !portalSettings[workspace.id]?.enabled)}
                                className={cn(
                                  "relative w-11 h-6 rounded-full transition-colors",
                                  portalSettings[workspace.id]?.enabled ? "bg-cyan-600" : "bg-zinc-700"
                                )}
                              >
                                <span className={cn(
                                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                                  portalSettings[workspace.id]?.enabled ? "left-6" : "left-1"
                                )} />
                              </button>
                            </div>
                            {portalSettings[workspace.id]?.url && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={portalSettings[workspace.id].url || ''}
                                  readOnly
                                  className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 truncate"
                                />
                                <button
                                  onClick={() => copyPortalUrl(portalSettings[workspace.id].url!, workspace.id)}
                                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                                  title="Copy URL"
                                >
                                  {copiedPortalUrl === workspace.id ? <Check className="w-4 h-4 text-cyan-400" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <a
                                  href={portalSettings[workspace.id].url || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                                  title="Open Portal"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            Share this URL with your client. They&apos;ll enter the PIN you set to access their dashboard.
                          </p>
                        </>
                      ) : (
                        <>
                          {/* Setup form */}
                          <p className="text-sm text-zinc-400 mb-3">
                            Create a PIN-protected dashboard for your client to view their ad performance.
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={portalPin}
                              onChange={(e) => setPortalPin(e.target.value.replace(/\D/g, ''))}
                              placeholder="Enter 4-6 digit PIN"
                              maxLength={6}
                              className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent"
                            />
                            <button
                              onClick={() => handleSetupPortal(workspace.id)}
                              disabled={savingPortal || portalPin.length < 4}
                              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                              {savingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Setup Portal'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Team Management (Agency only) */}
                {isAgency && (
                  <div className="border-t border-border">
                    <button
                      onClick={() => setExpandedTeam(expandedTeam === workspace.id ? null : workspace.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-bg-hover/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium">Team Members</span>
                        {((workspaceMembers[workspace.id]?.length || 0) + (workspaceInvites[workspace.id]?.length || 0)) > 0 && (
                          <span className="text-xs text-zinc-500">
                            ({workspaceMembers[workspace.id]?.length || 0} members{workspaceInvites[workspace.id]?.length ? `, ${workspaceInvites[workspace.id].length} pending` : ''})
                          </span>
                        )}
                      </div>
                      {expandedTeam === workspace.id ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>

                    {expandedTeam === workspace.id && (
                      <div className="p-4 pt-0 space-y-3">
                        {/* Owner */}
                        <div className="p-3 bg-bg-dark rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{user?.email}</span>
                            <span className="px-2 py-0.5 text-xs rounded bg-accent/20 text-accent">Owner</span>
                          </div>
                        </div>

                        {/* Members */}
                        {workspaceMembers[workspace.id]?.map((member) => (
                          <div key={member.id} className="p-3 bg-bg-dark rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{member.email}</span>
                              <span className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-400 capitalize">{member.role}</span>
                              {member.canLogWalkins && (
                                <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-400">Walk-ins</span>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveMember(workspace.id, member.id)}
                              className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {/* Pending Invites */}
                        {workspaceInvites[workspace.id]?.map((invite) => (
                          <div key={invite.id} className="p-3 bg-bg-dark rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-zinc-400">{invite.email}</span>
                                <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">Pending</span>
                              </div>
                              <button
                                onClick={() => handleCancelInvite(workspace.id, invite.id)}
                                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <button
                              onClick={() => copyInviteLink(invite.inviteUrl, invite.id)}
                              className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                            >
                              {copiedInvite === invite.id ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Copy invite link
                                </>
                              )}
                            </button>
                          </div>
                        ))}

                        {/* Invite Form */}
                        {invitingToWorkspace === workspace.id ? (
                          <div className="space-y-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder="Email address"
                              className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent"
                            />
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={inviteCanLogWalkins}
                                  onChange={(e) => setInviteCanLogWalkins(e.target.checked)}
                                  className="rounded border-zinc-600"
                                />
                                <span className="text-zinc-400">Can log walk-ins</span>
                              </label>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSendInvite(workspace.id)}
                                disabled={sendingInvite || !inviteEmail.trim()}
                                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                              >
                                {sendingInvite ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <UserPlus className="w-4 h-4" />
                                    Send Invite
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setInvitingToWorkspace(null)
                                  setInviteEmail('')
                                }}
                                className="p-2 text-zinc-500 hover:text-white transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setInvitingToWorkspace(workspace.id)}
                            className="w-full py-2 border border-dashed border-purple-500/30 hover:border-purple-500 rounded-lg text-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-2"
                          >
                            <UserPlus className="w-4 h-4" />
                            Invite Client
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 text-sm text-zinc-500 space-y-2">
        <p><strong>Workspaces</strong> let you combine metrics from multiple ad accounts into a single view.</p>
        <p>Select a workspace from the sidebar dropdown to see aggregated performance across all accounts in that workspace.</p>
      </div>
    </div>
  )
}
