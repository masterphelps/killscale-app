'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Layers, X, Edit2, Check, AlertCircle, Lock, Users, UserPlus, Copy, ChevronDown, ChevronUp, Globe, ExternalLink, Radio, Download, RefreshCw, Activity, Smartphone, Eye, EyeOff, Info, ShoppingBag, Unlink, Gift } from 'lucide-react'
import { useAuth, supabase } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { useAccount } from '@/lib/account'
import { useAttribution } from '@/lib/attribution'
import { ATTRIBUTION_MODEL_INFO, AttributionModel } from '@/lib/attribution-models'
import { FEATURES } from '@/lib/feature-flags'
import { ManualEventModal } from '@/components/manual-event-modal'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type Workspace = {
  id: string
  name: string
  description: string | null
  business_type: 'ecommerce' | 'leadgen'
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

type WorkspacePixel = {
  workspace_id: string
  pixel_id: string
  pixel_secret: string
  attribution_source: 'native' | 'pixel'
  attribution_model: AttributionModel
}

type KioskSettings = {
  enabled: boolean
  slug: string | null
  hasPin: boolean
}

type PixelEvent = {
  id: string
  event_type: string
  event_value: number | null
  event_currency: string
  utm_source: string | null
  utm_content: string | null
  page_url: string | null
  event_time: string
  source?: string // 'manual', 'pixel', 'kiosk', etc.
  event_metadata?: { notes?: string }
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
  const { reloadConfig } = useAttribution()

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

  // Pixel state
  const [expandedPixel, setExpandedPixel] = useState<string | null>(null)
  const [workspacePixels, setWorkspacePixels] = useState<Record<string, WorkspacePixel>>({})
  const [pixelEvents, setPixelEvents] = useState<Record<string, PixelEvent[]>>({})
  const [lastEventTimes, setLastEventTimes] = useState<Record<string, string | null>>({})
  const [loadingEvents, setLoadingEvents] = useState<string | null>(null)
  const [copiedPixelId, setCopiedPixelId] = useState<string | null>(null)
  const [updatingModel, setUpdatingModel] = useState<string | null>(null)
  const [sourceBreakdown, setSourceBreakdown] = useState<Record<string, {
    verified: { conversions: number; revenue: number };
    ks_only: { conversions: number; revenue: number };
    meta_only: { conversions: number; revenue: number };
    manual: { conversions: number; revenue: number };
    total: { conversions: number; revenue: number };
    date_start: string | null;
    date_end: string | null;
    days_count: number;
  } | null>>({})
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false)

  // Shopify state
  const [expandedShopify, setExpandedShopify] = useState<string | null>(null)
  const [shopifyConnections, setShopifyConnections] = useState<Record<string, {
    shop_domain: string
    shop_name?: string
    created_at: string
    last_sync_at?: string | null
    order_count?: number
  } | null>>({})
  const [shopifyDomainInput, setShopifyDomainInput] = useState<Record<string, string>>({})
  const [connectingShopify, setConnectingShopify] = useState<string | null>(null)
  const [syncingShopify, setSyncingShopify] = useState<string | null>(null)
  const [disconnectingShopify, setDisconnectingShopify] = useState<string | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<Record<string, {
    active: boolean
    webhooks: Array<{ id: number; topic: string; address: string; created_at: string }>
    missing: string[]
  } | null>>({})
  const [registeringWebhooks, setRegisteringWebhooks] = useState<string | null>(null)

  // UpPromote state
  const [expandedUpPromote, setExpandedUpPromote] = useState<string | null>(null)
  const [upPromoteApiKey, setUpPromoteApiKey] = useState<Record<string, string>>({})
  const [connectingUpPromote, setConnectingUpPromote] = useState<string | null>(null)
  const [syncingUpPromote, setSyncingUpPromote] = useState<string | null>(null)
  const [upPromoteConnections, setUpPromoteConnections] = useState<Record<string, {
    id: string
    workspace_id: string
    api_key: string
    created_at: string
    last_sync_at?: string | null
  } | null>>({})

  // Manual event filter and edit state
  const [eventSourceFilter, setEventSourceFilter] = useState<'all' | 'manual'>('all')
  const [editingEvent, setEditingEvent] = useState<PixelEvent | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)

  // Kiosk settings state
  const [kioskSettings, setKioskSettings] = useState<Record<string, KioskSettings>>({})
  const [kioskSlugInput, setKioskSlugInput] = useState<Record<string, string>>({})
  const [kioskPinInput, setKioskPinInput] = useState<Record<string, string>>({})
  const [showKioskPin, setShowKioskPin] = useState<Record<string, boolean>>({})
  const [updatingKiosk, setUpdatingKiosk] = useState<string | null>(null)
  const [copiedKioskUrl, setCopiedKioskUrl] = useState<string | null>(null)
  const [kioskError, setKioskError] = useState<Record<string, string | null>>({})

  // Manual Event Modal
  const [showManualEventModal, setShowManualEventModal] = useState<string | null>(null)

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

  // Load pixel status for all workspaces on mount (for active/inactive indicator)
  useEffect(() => {
    if (!user?.id || workspaces.length === 0) return

    const loadPixelStatuses = async () => {
      for (const workspace of workspaces) {
        // Get pixel for this workspace
        const { data: pixel } = await supabase
          .from('workspace_pixels')
          .select('pixel_id')
          .eq('workspace_id', workspace.id)
          .single()

        if (pixel?.pixel_id) {
          try {
            const res = await fetch(`/api/pixel/events?pixelId=${pixel.pixel_id}&userId=${user.id}&limit=1`)
            const data = await res.json()
            setLastEventTimes(prev => ({ ...prev, [workspace.id]: data.lastEventTime || null }))
          } catch (err) {
            // Silently fail - pixel might not have any events yet
          }
        }
      }
    }

    loadPixelStatuses()
  }, [user?.id, workspaces])

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

  const updateBusinessType = async (workspaceId: string, businessType: 'ecommerce' | 'leadgen') => {
    const { error } = await supabase
      .from('workspaces')
      .update({ business_type: businessType })
      .eq('id', workspaceId)

    if (!error) {
      setWorkspaces(prev => prev.map(w =>
        w.id === workspaceId ? { ...w, business_type: businessType } : w
      ))
    }
  }

  const handleAddAccount = async (workspaceId: string, account: { id: string; name: string; platform?: 'meta' | 'google' }) => {
    // Detect platform from account or infer from ID format
    const platform = account.platform || (account.id.startsWith('act_') ? 'meta' : 'google')

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
      setWorkspaceAccounts(prev => ({
        ...prev,
        [workspaceId]: [
          ...prev[workspaceId],
          {
            id: crypto.randomUUID(),
            workspace_id: workspaceId,
            platform,
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

  // Load Shopify connection data for a workspace
  const loadShopifyData = async (workspaceId: string) => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('shop_domain, shop_name, created_at, last_sync_at')
        .eq('workspace_id', workspaceId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Failed to load Shopify connection:', error)
        setShopifyConnections(prev => ({ ...prev, [workspaceId]: null }))
        return
      }

      // Get order count from shopify_orders table
      let orderCount = 0
      if (data) {
        const { count } = await supabase
          .from('shopify_orders')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
        orderCount = count || 0
      }

      setShopifyConnections(prev => ({
        ...prev,
        [workspaceId]: data ? { ...data, order_count: orderCount } : null
      }))

      // Also load webhook status if connected
      if (data) {
        try {
          const webhookRes = await fetch(`/api/shopify/webhooks?workspaceId=${workspaceId}&userId=${user.id}`)
          if (webhookRes.ok) {
            const webhookData = await webhookRes.json()
            setWebhookStatus(prev => ({ ...prev, [workspaceId]: webhookData }))
          }
        } catch (webhookErr) {
          console.error('Failed to load webhook status:', webhookErr)
        }
      }
    } catch (err) {
      console.error('Failed to load Shopify connection:', err)
    }
  }

  // Load Shopify data when expanding
  useEffect(() => {
    if (expandedShopify && shopifyConnections[expandedShopify] === undefined) {
      loadShopifyData(expandedShopify)
    }
  }, [expandedShopify])

  // ===== UPPROMOTE FUNCTIONS =====

  // Load UpPromote connection data for a workspace
  const loadUpPromoteData = async (workspaceId: string) => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .from('uppromote_connections')
        .select('id, workspace_id, api_key, created_at, last_sync_at')
        .eq('workspace_id', workspaceId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Failed to load UpPromote connection:', error)
        setUpPromoteConnections(prev => ({ ...prev, [workspaceId]: null }))
        return
      }

      setUpPromoteConnections(prev => ({
        ...prev,
        [workspaceId]: data || null
      }))
    } catch (err) {
      console.error('Failed to load UpPromote connection:', err)
    }
  }

  // Load UpPromote data when expanding
  useEffect(() => {
    if (expandedUpPromote && upPromoteConnections[expandedUpPromote] === undefined) {
      loadUpPromoteData(expandedUpPromote)
    }
  }, [expandedUpPromote])

  // Connect UpPromote
  const handleConnectUpPromote = async (workspaceId: string) => {
    const apiKey = upPromoteApiKey[workspaceId]
    if (!apiKey?.trim() || !user) return

    setConnectingUpPromote(workspaceId)
    try {
      const res = await fetch('/api/auth/uppromote/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id, apiKey: apiKey.trim() })
      })
      const data = await res.json()
      if (data.success) {
        // Reload connections
        await loadUpPromoteData(workspaceId)
        // Clear input
        setUpPromoteApiKey(prev => ({ ...prev, [workspaceId]: '' }))
      } else {
        alert(data.error || 'Failed to connect UpPromote')
      }
    } catch (err) {
      console.error('UpPromote connect error:', err)
      alert('Failed to connect UpPromote')
    } finally {
      setConnectingUpPromote(null)
    }
  }

  // Sync UpPromote
  const handleSyncUpPromote = async (workspaceId: string) => {
    if (!user) return

    setSyncingUpPromote(workspaceId)
    try {
      const res = await fetch('/api/uppromote/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id })
      })
      if (res.ok) {
        await loadUpPromoteData(workspaceId)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to sync UpPromote')
      }
    } catch (err) {
      console.error('UpPromote sync error:', err)
      alert('Failed to sync UpPromote')
    } finally {
      setSyncingUpPromote(null)
    }
  }

  // Disconnect UpPromote
  const handleDisconnectUpPromote = async (workspaceId: string) => {
    if (!user) return
    if (!confirm('Disconnect UpPromote? This will stop tracking affiliate commissions.')) return

    try {
      const res = await fetch('/api/uppromote/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id })
      })
      if (res.ok) {
        setUpPromoteConnections(prev => ({ ...prev, [workspaceId]: null }))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to disconnect UpPromote')
      }
    } catch (err) {
      console.error('UpPromote disconnect error:', err)
      alert('Failed to disconnect UpPromote')
    }
  }

  // ===== PIXEL FUNCTIONS =====

  // Load or create pixel for a workspace
  const loadPixelData = useCallback(async (workspaceId: string, workspaceName: string) => {
    if (!user?.id) return

    // Check if pixel exists
    let { data: existingPixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id, pixel_secret, attribution_source, attribution_model')
      .eq('workspace_id', workspaceId)
      .single()

    if (!existingPixel) {
      // Create pixel for this workspace
      const workspacePrefix = workspaceName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
      const newPixelId = `KS-${workspacePrefix}-${randomSuffix}`

      const { data: newPixel, error: createError } = await supabase
        .from('workspace_pixels')
        .insert({
          workspace_id: workspaceId,
          pixel_id: newPixelId,
          pixel_secret: crypto.randomUUID().replace(/-/g, ''),
          attribution_source: 'native',
          attribution_model: 'last_touch',
        })
        .select('pixel_id, pixel_secret, attribution_source, attribution_model')
        .single()

      if (!createError && newPixel) {
        existingPixel = newPixel
      }
    }

    if (existingPixel) {
      setWorkspacePixels(prev => ({
        ...prev,
        [workspaceId]: {
          workspace_id: workspaceId,
          pixel_id: existingPixel.pixel_id,
          pixel_secret: existingPixel.pixel_secret,
          attribution_source: existingPixel.attribution_source,
          attribution_model: existingPixel.attribution_model || 'last_touch',
        }
      }))

      // Load last event time for active indicator
      try {
        const res = await fetch(`/api/pixel/events?pixelId=${existingPixel.pixel_id}&userId=${user.id}&limit=1`)
        const data = await res.json()
        setLastEventTimes(prev => ({ ...prev, [workspaceId]: data.lastEventTime || null }))
      } catch (err) {
        console.error('Failed to load pixel status:', err)
      }
    }

    // Load kiosk settings
    loadKioskSettings(workspaceId)
  }, [user?.id])

  // Load pixel data when expanding
  useEffect(() => {
    if (expandedPixel && !workspacePixels[expandedPixel]) {
      const workspace = workspaces.find(w => w.id === expandedPixel)
      if (workspace) {
        loadPixelData(expandedPixel, workspace.name)
        loadSourceBreakdown(expandedPixel)
      }
    }
  }, [expandedPixel, workspacePixels, workspaces, loadPixelData])

  // Load events for a specific pixel
  const loadPixelEvents = useCallback(async (pixelId: string, workspaceId: string) => {
    if (!user?.id) return

    setLoadingEvents(workspaceId)
    try {
      const res = await fetch(`/api/pixel/events?pixelId=${pixelId}&userId=${user.id}&limit=50`)
      const data = await res.json()
      if (data.events) {
        setPixelEvents(prev => ({ ...prev, [workspaceId]: data.events }))
      }
      setLastEventTimes(prev => ({ ...prev, [workspaceId]: data.lastEventTime || null }))
    } catch (err) {
      console.error('Failed to load pixel events:', err)
    } finally {
      setLoadingEvents(null)
    }
  }, [user?.id])

  // Delete a manual event
  const deleteManualEvent = async (eventId: string, workspaceId: string, pixelId: string) => {
    setDeletingEventId(eventId)
    try {
      const res = await fetch(`/api/pixel/events/${eventId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        // Reload events to reflect the deletion
        await loadPixelEvents(pixelId, workspaceId)
      } else {
        const data = await res.json()
        console.error('Failed to delete event:', data.error)
      }
    } catch (err) {
      console.error('Failed to delete event:', err)
    } finally {
      setDeletingEventId(null)
    }
  }

  // Load source breakdown for a workspace
  const loadSourceBreakdown = async (workspaceId: string) => {
    if (!user) return
    setIsLoadingBreakdown(true)
    try {
      const res = await fetch(`/api/attribution/breakdown?workspace_id=${workspaceId}&userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSourceBreakdown(prev => ({ ...prev, [workspaceId]: data.data }))
        }
      }
    } catch (error) {
      console.error('Failed to load source breakdown:', error)
    } finally {
      setIsLoadingBreakdown(false)
    }
  }

  // Update attribution model for a workspace
  const updateAttributionModel = async (workspaceId: string, newModel: AttributionModel) => {
    setUpdatingModel(workspaceId)
    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ attribution_model: newModel })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixels(prev => ({
          ...prev,
          [workspaceId]: {
            ...prev[workspaceId],
            attribution_model: newModel,
          }
        }))
      } else {
        console.error('Failed to update attribution model:', error)
      }
    } catch (err) {
      console.error('Failed to update attribution model:', err)
    } finally {
      setUpdatingModel(null)
    }
  }

  // Load kiosk settings for a workspace
  const loadKioskSettings = async (workspaceId: string) => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/kiosk/settings?workspaceId=${workspaceId}&userId=${user.id}`)
      const data = await res.json()
      if (res.ok) {
        setKioskSettings(prev => ({
          ...prev,
          [workspaceId]: {
            enabled: data.kioskEnabled,
            slug: data.kioskSlug,
            hasPin: data.hasPin
          }
        }))
        setKioskSlugInput(prev => ({ ...prev, [workspaceId]: data.kioskSlug || '' }))
      }
    } catch (err) {
      console.error('Failed to load kiosk settings:', err)
    }
  }

  // Update kiosk settings
  const updateKioskSettings = async (workspaceId: string, updates: { enabled?: boolean; slug?: string; pin?: string }) => {
    if (!user?.id) return
    setUpdatingKiosk(workspaceId)
    setKioskError(prev => ({ ...prev, [workspaceId]: null }))

    try {
      const res = await fetch('/api/kiosk/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId: user.id,
          ...updates
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setKioskError(prev => ({ ...prev, [workspaceId]: data.error }))
        return
      }

      await loadKioskSettings(workspaceId)

      if (updates.pin) {
        setKioskPinInput(prev => ({ ...prev, [workspaceId]: '' }))
      }
    } catch (err) {
      setKioskError(prev => ({ ...prev, [workspaceId]: 'Failed to update settings' }))
    } finally {
      setUpdatingKiosk(null)
    }
  }

  const copyKioskUrl = async (slug: string, workspaceId: string) => {
    const url = `https://kiosk.killscale.com/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedKioskUrl(workspaceId)
    setTimeout(() => setCopiedKioskUrl(null), 2000)
  }

  const getPixelSnippet = (pixelId: string, pixelSecret: string) => `<!-- KillScale Pixel - Add to your theme's <head> -->
<script>
!function(k,s,p,i,x,e,l){if(k.ks)return;x=k.ks=function(){x.q.push(arguments)};
x.q=[];e=s.createElement(p);l=s.getElementsByTagName(p)[0];
e.async=1;e.src='https://pixel.killscale.com/ks.js';l.parentNode.insertBefore(e,l)
}(window,document,'script');

ks('init', '${pixelId}', { secret: '${pixelSecret}' });
ks('pageview');
</script>
<!-- End KillScale Pixel -->`

  // Shopify-specific snippet for order status page (Settings > Checkout > Order status page)
  const getShopifyPurchaseSnippet = (pixelId: string, pixelSecret: string) => `<!-- KillScale Purchase Tracking - Add to Shopify Order Status Scripts -->
<script>
(function() {
  // Get UTM params from cookie (stored by main pixel on landing)
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // Get stored UTM data
  var utmData = {};
  try {
    var stored = getCookie('ks_utm') || localStorage.getItem('ks_utm');
    if (stored) utmData = JSON.parse(stored);
  } catch(e) {}

  // Shopify provides checkout data on thank-you page
  if (typeof Shopify !== 'undefined' && Shopify.checkout) {
    var checkout = Shopify.checkout;

    // Fire purchase event to KillScale
    fetch('${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/api/pixel/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pixel_id: '${pixelId}',
        pixel_secret: '${pixelSecret}',
        order_id: String(checkout.order_id),
        order_total: parseFloat(checkout.total_price),

        // Attribution from pixel (stored during session)
        utm_source: utmData.utm_source || null,
        utm_medium: utmData.utm_medium || null,
        utm_campaign: utmData.utm_campaign || null,
        utm_content: utmData.utm_content || null,
        utm_term: utmData.utm_term || null,

        // Session tracking
        session_id: getCookie('ks_session') || null,
        client_id: getCookie('ks_client') || localStorage.getItem('ks_client') || null,
        landing_page: utmData.landing_page || null,
        referrer: utmData.referrer || null,
        page_views: parseInt(utmData.page_views) || null,
        event_time: new Date().toISOString(),
        click_time: utmData.click_time || null
      })
    }).catch(function(e) { console.log('KillScale: purchase event failed', e); });
  }
})();
</script>
<!-- End KillScale Purchase Tracking -->`

  const copyPixelSnippet = async (pixelId: string, pixelSecret: string, workspaceId: string) => {
    await navigator.clipboard.writeText(getPixelSnippet(pixelId, pixelSecret))
    setCopiedPixelId(workspaceId)
    setTimeout(() => setCopiedPixelId(null), 2000)
  }

  const downloadPixelFile = (pixelId: string, pixelSecret: string, workspaceName: string) => {
    const snippet = getPixelSnippet(pixelId, pixelSecret)
    const blob = new Blob([snippet], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `killscale-pixel-${workspaceName.toLowerCase().replace(/\s+/g, '-')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Check if pixel is "active" (received event in last 24 hours)
  const isPixelActive = (workspaceId: string) => {
    const lastEvent = lastEventTimes[workspaceId]
    if (!lastEvent) return false
    const lastEventDate = new Date(lastEvent)
    const now = new Date()
    const diffMs = now.getTime() - lastEventDate.getTime()
    const diffHours = diffMs / 3600000
    return diffHours < 24
  }

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
      <div className="max-w-2xl mx-auto">
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
    <div className="max-w-3xl mx-auto">
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
            const wp = workspacePixels[workspace.id]
            const events = pixelEvents[workspace.id] || []
            const isLoadingEvents = loadingEvents === workspace.id

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

                {/* Business Type */}
                <div className="flex items-center gap-4 p-4 border-b border-border">
                  <span className="text-sm font-medium">Business Type</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateBusinessType(workspace.id, 'ecommerce')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm transition-colors',
                        workspace.business_type === 'ecommerce'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-bg-dark text-zinc-400 border border-border hover:border-zinc-500'
                      )}
                    >
                      E-commerce
                    </button>
                    <button
                      onClick={() => updateBusinessType(workspace.id, 'leadgen')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm transition-colors',
                        workspace.business_type === 'leadgen'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-bg-dark text-zinc-400 border border-border hover:border-zinc-500'
                      )}
                    >
                      Lead Gen
                    </button>
                  </div>
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
                            {account.platform === 'google' && (
                              <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">Beta</span>
                            )}
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
                            [{account.platform === 'google' ? 'Google (Beta)' : 'Meta'}] {account.name}
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

                {/* Pixel & Attribution */}
                <div className="border-t border-border">
                  <button
                    onClick={() => setExpandedPixel(expandedPixel === workspace.id ? null : workspace.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-bg-hover/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium">Pixel</span>
                      <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">Beta</span>
                      {isPixelActive(workspace.id) ? (
                        <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded bg-zinc-500/20 text-zinc-400">Inactive</span>
                      )}
                    </div>
                    {expandedPixel === workspace.id ? (
                      <ChevronUp className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>

                  {expandedPixel === workspace.id && (
                    <div className="p-4 pt-0 space-y-6">
                      {!wp ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                        </div>
                      ) : (
                        <>
                          {/* Install Code */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-medium text-sm">Install Code</h3>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => downloadPixelFile(wp.pixel_id, wp.pixel_secret, workspace.name)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download
                                </button>
                                <button
                                  onClick={() => copyPixelSnippet(wp.pixel_id, wp.pixel_secret, workspace.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
                                >
                                  {copiedPixelId === workspace.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            <div className="p-3 bg-bg-dark rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-zinc-500">Pixel ID:</span>
                                <code className="text-xs font-mono text-white">{wp.pixel_id}</code>
                              </div>
                              <pre className="text-xs text-zinc-400 overflow-x-auto font-mono whitespace-pre-wrap">
                                {getPixelSnippet(wp.pixel_id, wp.pixel_secret)}
                              </pre>
                            </div>

                            <p className="text-xs text-zinc-600 mt-2">
                              Add to your website's <code className="bg-zinc-800 px-1 rounded">&lt;head&gt;</code> section.
                            </p>
                          </div>

                          {/* Shopify Purchase Tracking - for order status page */}
                          {shopifyConnections[workspace.id] && (
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium text-sm">Shopify Purchase Tracking</h3>
                                <button
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(getShopifyPurchaseSnippet(wp.pixel_id, wp.pixel_secret))
                                    setCopiedPixelId(`shopify-${workspace.id}`)
                                    setTimeout(() => setCopiedPixelId(null), 2000)
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
                                >
                                  {copiedPixelId === `shopify-${workspace.id}` ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>

                              <div className="p-3 bg-bg-dark rounded-lg">
                                <pre className="text-xs text-zinc-400 overflow-x-auto font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                                  {getShopifyPurchaseSnippet(wp.pixel_id, wp.pixel_secret)}
                                </pre>
                              </div>

                              <p className="text-xs text-zinc-600 mt-2">
                                Add to <strong>Shopify Admin → Settings → Checkout → Order status page</strong> under "Additional scripts".
                                This fires purchase events with your Shopify order ID for accurate attribution.
                              </p>
                            </div>
                          )}

                          {/* Attribution Insights - REPLACES the toggle */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-medium text-sm">Attribution Insights</h3>
                              <button
                                onClick={() => loadSourceBreakdown(workspace.id)}
                                disabled={isLoadingBreakdown}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingBreakdown && "animate-spin")} />
                                Refresh
                              </button>
                            </div>

                            <div className="p-4 bg-bg-dark rounded-lg">
                              <p className="text-xs text-zinc-500 mb-4">
                                KillScale merges your pixel data with Meta API for the most complete picture.
                              </p>

                              {(() => {
                                const breakdown = sourceBreakdown[workspace.id]
                                if (!breakdown) {
                                  return (
                                    <div className="text-center py-4">
                                      <p className="text-sm text-zinc-500">No attribution data yet</p>
                                      <p className="text-xs text-zinc-600 mt-1">Data will appear after your first sync</p>
                                    </div>
                                  )
                                }

                                return (
                                  <>
                                    {/* Source Breakdown Bar */}
                                    <div className="mb-4">
                                      <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
                                        {breakdown.total.conversions > 0 && (
                                          <>
                                            <div
                                              style={{width: `${(breakdown.verified.conversions / breakdown.total.conversions) * 100}%`}}
                                              className="bg-verdict-scale"
                                              title="Verified"
                                            />
                                            <div
                                              style={{width: `${(breakdown.ks_only.conversions / breakdown.total.conversions) * 100}%`}}
                                              className="bg-purple-500"
                                              title="KS Only"
                                            />
                                            <div
                                              style={{width: `${(breakdown.meta_only.conversions / breakdown.total.conversions) * 100}%`}}
                                              className="bg-zinc-500"
                                              title="Meta Only"
                                            />
                                            <div
                                              style={{width: `${(breakdown.manual.conversions / breakdown.total.conversions) * 100}%`}}
                                              className="bg-amber-500"
                                              title="Manual"
                                            />
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* Legend with counts */}
                                    <div className="space-y-2 text-xs">
                                      <div className="flex justify-between">
                                        <span className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-verdict-scale" />
                                          Verified (KS + Meta)
                                        </span>
                                        <span className="text-zinc-400">
                                          {breakdown.verified.conversions}
                                          ({breakdown.total.conversions > 0
                                            ? Math.round((breakdown.verified.conversions / breakdown.total.conversions) * 100)
                                            : 0}%)
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                                          KS Only
                                        </span>
                                        <span className="text-zinc-400">
                                          {breakdown.ks_only.conversions}
                                          ({breakdown.total.conversions > 0
                                            ? Math.round((breakdown.ks_only.conversions / breakdown.total.conversions) * 100)
                                            : 0}%)
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-zinc-500" />
                                          Meta Only
                                        </span>
                                        <span className="text-zinc-400">
                                          {breakdown.meta_only.conversions}
                                          ({breakdown.total.conversions > 0
                                            ? Math.round((breakdown.meta_only.conversions / breakdown.total.conversions) * 100)
                                            : 0}%)
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                                          Manual
                                        </span>
                                        <span className="text-zinc-400">
                                          {breakdown.manual.conversions}
                                          ({breakdown.total.conversions > 0
                                            ? Math.round((breakdown.manual.conversions / breakdown.total.conversions) * 100)
                                            : 0}%)
                                        </span>
                                      </div>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-border text-xs text-zinc-500">
                                      Total: {breakdown.total.conversions} conversions
                                      (${breakdown.total.revenue.toLocaleString()})
                                      <span className="ml-2 text-zinc-600">
                                        • {breakdown.date_start && breakdown.date_end
                                          ? breakdown.date_start === breakdown.date_end
                                            ? new Date(breakdown.date_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                            : `${new Date(breakdown.date_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(breakdown.date_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                          : 'Last sync'}
                                      </span>
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                          </div>

                          {/* Attribution Model */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <h3 className="font-medium text-sm">Attribution Model</h3>
                              <div className="group relative">
                                <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 z-10">
                                  Choose how credit is distributed when a customer interacts with multiple ads before converting.
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-zinc-500 mb-3">
                              Applied to conversions tracked by KillScale pixel. Meta-only conversions use Meta's native attribution.
                            </p>
                              <div className="space-y-2">
                                {(Object.keys(ATTRIBUTION_MODEL_INFO) as AttributionModel[]).map((model) => (
                                  <button
                                    key={model}
                                    onClick={() => updateAttributionModel(workspace.id, model)}
                                    disabled={updatingModel === workspace.id}
                                    className={cn(
                                      "w-full p-3 rounded-lg border-2 transition-all text-left",
                                      wp.attribution_model === model
                                        ? "border-purple-500 bg-purple-500/10"
                                        : "border-border hover:border-zinc-600"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className={cn(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                        wp.attribution_model === model ? "border-purple-500" : "border-zinc-600"
                                      )}>
                                        {wp.attribution_model === model && (
                                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                                        )}
                                      </div>
                                      <span className="font-medium text-sm">{ATTRIBUTION_MODEL_INFO[model].label}</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 ml-6">
                                      {ATTRIBUTION_MODEL_INFO[model].description}
                                    </p>
                                  </button>
                                ))}
                              </div>

                              {updatingModel === workspace.id && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Updating...
                                </div>
                              )}
                          </div>

                          {/* Sales Kiosk */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Smartphone className="w-4 h-4 text-zinc-400" />
                              <h3 className="font-medium text-sm">Sales Kiosk</h3>
                            </div>
                            <p className="text-xs text-zinc-500 mb-4">
                              A simplified view for staff to log walk-in sales without full dashboard access.
                            </p>

                            {kioskError[workspace.id] && (
                              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                                {kioskError[workspace.id]}
                              </div>
                            )}

                            {/* Enable toggle */}
                            <div className="flex items-center justify-between p-3 bg-bg-dark rounded-lg mb-3">
                              <span className="text-sm">Enable Sales Kiosk</span>
                              <button
                                onClick={() => updateKioskSettings(workspace.id, { enabled: !kioskSettings[workspace.id]?.enabled })}
                                disabled={updatingKiosk === workspace.id}
                                className={cn(
                                  "w-10 h-6 rounded-full transition-colors relative",
                                  kioskSettings[workspace.id]?.enabled ? "bg-accent" : "bg-zinc-700"
                                )}
                              >
                                <div className={cn(
                                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                                  kioskSettings[workspace.id]?.enabled ? "left-5" : "left-1"
                                )} />
                              </button>
                            </div>

                            {kioskSettings[workspace.id]?.enabled && (
                              <>
                                {/* Kiosk URL */}
                                <div className="mb-3">
                                  <label className="block text-xs text-zinc-500 mb-1">Kiosk URL</label>
                                  <div className="flex gap-2">
                                    <div className="flex-1 flex items-center bg-bg-dark border border-border rounded-lg overflow-hidden">
                                      <span className="px-2 text-xs text-zinc-600 border-r border-border">kiosk.killscale.com/</span>
                                      <input
                                        type="text"
                                        value={kioskSlugInput[workspace.id] || ''}
                                        onChange={(e) => setKioskSlugInput(prev => ({ ...prev, [workspace.id]: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                        placeholder="your-business"
                                        className="flex-1 px-2 py-2 bg-transparent text-sm text-white focus:outline-none"
                                      />
                                    </div>
                                    <button
                                      onClick={() => updateKioskSettings(workspace.id, { slug: kioskSlugInput[workspace.id] })}
                                      disabled={updatingKiosk === workspace.id || kioskSlugInput[workspace.id] === kioskSettings[workspace.id]?.slug}
                                      className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>

                                {/* Copy URL button */}
                                {kioskSettings[workspace.id]?.slug && (
                                  <button
                                    onClick={() => copyKioskUrl(kioskSettings[workspace.id].slug!, workspace.id)}
                                    className="w-full mb-3 flex items-center justify-center gap-2 p-2 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                                  >
                                    {copiedKioskUrl === workspace.id ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-verdict-scale" />
                                        Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy Kiosk URL
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* PIN Code */}
                                <div>
                                  <label className="block text-xs text-zinc-500 mb-1">
                                    PIN Code {kioskSettings[workspace.id]?.hasPin && <span className="text-verdict-scale">(set)</span>}
                                  </label>
                                  <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                      <input
                                        type={showKioskPin[workspace.id] ? 'text' : 'password'}
                                        value={kioskPinInput[workspace.id] || ''}
                                        onChange={(e) => setKioskPinInput(prev => ({ ...prev, [workspace.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                        placeholder={kioskSettings[workspace.id]?.hasPin ? '••••' : 'Enter 4-6 digits'}
                                        maxLength={6}
                                        className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowKioskPin(prev => ({ ...prev, [workspace.id]: !prev[workspace.id] }))}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                      >
                                        {showKioskPin[workspace.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                      </button>
                                    </div>
                                    <button
                                      onClick={() => updateKioskSettings(workspace.id, { pin: kioskPinInput[workspace.id] })}
                                      disabled={updatingKiosk === workspace.id || !kioskPinInput[workspace.id] || kioskPinInput[workspace.id].length < 4}
                                      className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                                    >
                                      {kioskSettings[workspace.id]?.hasPin ? 'Change' : 'Set'}
                                    </button>
                                  </div>
                                  <p className="text-xs text-zinc-600 mt-1">Staff will enter this PIN to access the kiosk.</p>
                                </div>
                              </>
                            )}

                            {updatingKiosk === workspace.id && (
                              <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Updating...
                              </div>
                            )}
                          </div>

                          {/* Manual Event Logging */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Plus className="w-4 h-4 text-zinc-400" />
                              <h3 className="font-medium text-sm">Manual Event Logging</h3>
                            </div>
                            <p className="text-xs text-zinc-500 mb-4">
                              Manually log walk-ins, phone orders, signups, or other offline conversions.
                            </p>
                            <button
                              onClick={() => setShowManualEventModal(workspace.id)}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Log Manual Event
                            </button>
                          </div>

                          {/* Event Viewer */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-zinc-400" />
                                <h3 className="font-medium text-sm">Events</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Source filter toggle */}
                                <div className="flex rounded-lg overflow-hidden border border-border">
                                  <button
                                    onClick={() => setEventSourceFilter('all')}
                                    className={cn(
                                      "px-2.5 py-1 text-xs transition-colors",
                                      eventSourceFilter === 'all'
                                        ? "bg-accent text-white"
                                        : "bg-bg-dark text-zinc-400 hover:text-white"
                                    )}
                                  >
                                    All
                                  </button>
                                  <button
                                    onClick={() => setEventSourceFilter('manual')}
                                    className={cn(
                                      "px-2.5 py-1 text-xs transition-colors",
                                      eventSourceFilter === 'manual'
                                        ? "bg-purple-600 text-white"
                                        : "bg-bg-dark text-zinc-400 hover:text-white"
                                    )}
                                  >
                                    Manual
                                  </button>
                                </div>
                                <button
                                  onClick={() => loadPixelEvents(wp.pixel_id, workspace.id)}
                                  disabled={isLoadingEvents}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
                                >
                                  <RefreshCw className={cn("w-3.5 h-3.5", isLoadingEvents && "animate-spin")} />
                                  Refresh
                                </button>
                              </div>
                            </div>

                            {(() => {
                              // Filter events based on source filter
                              const filteredEvents = eventSourceFilter === 'manual'
                                ? events.filter(e => e.source === 'manual')
                                : events

                              if (isLoadingEvents && events.length === 0) {
                                return (
                                  <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                                  </div>
                                )
                              }

                              if (filteredEvents.length === 0) {
                                return (
                                  <div className="text-center py-8 bg-bg-dark rounded-lg">
                                    <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                                    <p className="text-sm text-zinc-500">
                                      {eventSourceFilter === 'manual' ? 'No manual events yet' : 'No events received yet'}
                                    </p>
                                    <p className="text-xs text-zinc-600 mt-1">
                                      {eventSourceFilter === 'manual'
                                        ? 'Log a manual event to track offline conversions'
                                        : 'Install the pixel and events will appear here'}
                                    </p>
                                  </div>
                                )
                              }

                              return (
                                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                                  {filteredEvents.slice(0, 50).map((event) => (
                                    <div
                                      key={event.id}
                                      className="flex items-center justify-between p-2.5 bg-bg-dark rounded-lg text-sm group"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {/* Event type badge */}
                                        <span className={cn(
                                          "px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0",
                                          event.event_type === 'purchase' ? 'bg-verdict-scale/20 text-verdict-scale' :
                                          event.event_type === 'pageview' ? 'bg-zinc-700 text-zinc-400' :
                                          'bg-accent/20 text-accent'
                                        )}>
                                          {event.event_type}
                                        </span>
                                        {/* Manual indicator */}
                                        {event.source === 'manual' && (
                                          <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 flex-shrink-0">
                                            manual
                                          </span>
                                        )}
                                        {/* Value */}
                                        {event.event_value && (
                                          <span className="text-zinc-400 flex-shrink-0">${event.event_value.toFixed(2)}</span>
                                        )}
                                        {/* Attribution */}
                                        {event.utm_content && (
                                          <span className="text-xs text-zinc-600 font-mono truncate max-w-[80px]" title={`Attributed to: ${event.utm_content}`}>
                                            → {event.utm_content.slice(-8)}
                                          </span>
                                        )}
                                        {/* Notes */}
                                        {event.event_metadata?.notes && (
                                          <span className="text-xs text-zinc-500 truncate" title={event.event_metadata.notes}>
                                            "{event.event_metadata.notes}"
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        {/* Date */}
                                        <span className="text-xs text-zinc-600" title={new Date(event.event_time).toLocaleString()}>
                                          {new Date(event.event_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        {/* Delete button for manual events */}
                                        {event.source === 'manual' && (
                                          <button
                                            onClick={() => deleteManualEvent(event.id, workspace.id, wp.pixel_id)}
                                            disabled={deletingEventId === event.id}
                                            className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                            title="Delete event"
                                          >
                                            {deletingEventId === event.id ? (
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                              <Trash2 className="w-3.5 h-3.5" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {filteredEvents.length > 50 && (
                                    <p className="text-xs text-zinc-600 text-center pt-2">
                                      +{filteredEvents.length - 50} more events
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Shopify Store */}
                <div className="border-t border-border">
                  <button
                    onClick={() => setExpandedShopify(expandedShopify === workspace.id ? null : workspace.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-bg-hover/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium">Shopify Store</span>
                      {shopifyConnections[workspace.id] && (
                        <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">Connected</span>
                      )}
                    </div>
                    {expandedShopify === workspace.id ? (
                      <ChevronUp className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>

                  {expandedShopify === workspace.id && (
                    <div className="p-4 pt-0 space-y-4">
                      {shopifyConnections[workspace.id] === undefined ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                        </div>
                      ) : shopifyConnections[workspace.id] ? (
                        <>
                          {/* Store Info Box */}
                          <div className="p-4 rounded-lg bg-bg-dark border border-border">
                            <div className="flex items-start gap-3">
                              <Check className="w-5 h-5 text-verdict-scale flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white">
                                  {shopifyConnections[workspace.id]!.shop_name || shopifyConnections[workspace.id]!.shop_domain.replace('.myshopify.com', '')}
                                </div>
                                <div className="text-sm text-zinc-500">
                                  {shopifyConnections[workspace.id]!.shop_domain}
                                </div>
                                <div className="text-xs text-zinc-600 mt-1">
                                  Connected {new Date(shopifyConnections[workspace.id]!.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                                {workspace.business_type === 'ecommerce' && (
                                  <div className="text-xs text-green-400 mt-2 flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Shopify is your revenue source
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Order Sync Box */}
                          <div className="p-4 rounded-lg bg-bg-dark border border-border">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm text-zinc-400">Order Sync</span>
                              {shopifyConnections[workspace.id]!.last_sync_at && (
                                <span className="text-xs text-zinc-500">
                                  Last sync: {(() => {
                                    const date = new Date(shopifyConnections[workspace.id]!.last_sync_at!)
                                    const now = new Date()
                                    const diffMs = now.getTime() - date.getTime()
                                    const diffMins = Math.floor(diffMs / 60000)
                                    const diffHours = Math.floor(diffMins / 60)
                                    const diffDays = Math.floor(diffHours / 24)

                                    if (diffMins < 1) return 'Just now'
                                    if (diffMins < 60) return `${diffMins} min ago`
                                    if (diffHours < 24) return `${diffHours}h ago`
                                    return `${diffDays}d ago`
                                  })()}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-2xl font-mono text-white">
                                  {(shopifyConnections[workspace.id]?.order_count ?? 0).toLocaleString()}
                                </span>
                                <span className="text-sm text-zinc-500 ml-2">orders</span>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!user) return
                                  setSyncingShopify(workspace.id)
                                  try {
                                    const response = await fetch('/api/shopify/sync', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ workspaceId: workspace.id, userId: user.id }),
                                    })
                                    if (response.ok) {
                                      loadShopifyData(workspace.id)
                                    }
                                  } catch (err) {
                                    console.error('Shopify sync error:', err)
                                  } finally {
                                    setSyncingShopify(null)
                                  }
                                }}
                                disabled={syncingShopify === workspace.id}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`w-4 h-4 ${syncingShopify === workspace.id ? 'animate-spin' : ''}`} />
                                {syncingShopify === workspace.id ? 'Syncing...' : 'Sync Now'}
                              </button>
                            </div>
                          </div>

                          {/* Webhook Status Box */}
                          <div className="p-4 rounded-lg bg-bg-dark border border-border">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm text-zinc-400">Real-time Webhooks</span>
                              {webhookStatus[workspace.id] && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  webhookStatus[workspace.id]!.active
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {webhookStatus[workspace.id]!.active ? 'Active' : 'Setup Required'}
                                </span>
                              )}
                            </div>
                            {webhookStatus[workspace.id] ? (
                              <div className="space-y-2">
                                {webhookStatus[workspace.id]!.active ? (
                                  <div className="flex items-center gap-2 text-sm text-green-400">
                                    <Activity className="w-4 h-4" />
                                    <span>{webhookStatus[workspace.id]!.webhooks.length} webhooks registered</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2 text-sm text-amber-400 mb-2">
                                      <AlertCircle className="w-4 h-4" />
                                      <span>Missing: {webhookStatus[workspace.id]!.missing.join(', ')}</span>
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (!user) return
                                        setRegisteringWebhooks(workspace.id)
                                        try {
                                          const response = await fetch('/api/shopify/webhooks', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ workspaceId: workspace.id, userId: user.id }),
                                          })
                                          if (response.ok) {
                                            loadShopifyData(workspace.id)
                                          }
                                        } catch (err) {
                                          console.error('Webhook registration error:', err)
                                        } finally {
                                          setRegisteringWebhooks(null)
                                        }
                                      }}
                                      disabled={registeringWebhooks === workspace.id}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                      {registeringWebhooks === workspace.id ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          Registering...
                                        </>
                                      ) : (
                                        <>
                                          <Activity className="w-4 h-4" />
                                          Register Webhooks
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                                <p className="text-xs text-zinc-500">
                                  Webhooks sync orders in real-time as they happen in Shopify.
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-zinc-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Loading webhook status...</span>
                              </div>
                            )}
                          </div>

                          {/* Disconnect */}
                          <div className="pt-3 border-t border-border">
                            <button
                              onClick={async () => {
                                if (!user) return
                                if (!confirm('Disconnect your Shopify store? This will stop tracking orders from this store.')) return
                                setDisconnectingShopify(workspace.id)
                                try {
                                  const response = await fetch('/api/shopify/disconnect', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ workspaceId: workspace.id, userId: user.id }),
                                  })
                                  if (response.ok) {
                                    setShopifyConnections(prev => ({ ...prev, [workspace.id]: null }))
                                  }
                                } catch (err) {
                                  console.error('Shopify disconnect error:', err)
                                } finally {
                                  setDisconnectingShopify(null)
                                }
                              }}
                              disabled={disconnectingShopify === workspace.id}
                              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              <Unlink className="w-4 h-4" />
                              {disconnectingShopify === workspace.id ? 'Disconnecting...' : 'Disconnect Shopify Store'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Not Connected State */}
                          {workspace.business_type === 'leadgen' ? (
                            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                              <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm text-amber-400 font-medium mb-1">
                                    Shopify integration is for e-commerce
                                  </p>
                                  <p className="text-xs text-amber-400/80">
                                    Switch to E-commerce mode above to use Shopify.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-zinc-500 mb-4">
                                Connect your Shopify store to track purchases and attribute them to your Meta and Google ads.
                              </p>
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-medium mb-2">Shop Domain</label>
                                  <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                      <input
                                        type="text"
                                        value={shopifyDomainInput[workspace.id] || ''}
                                        onChange={(e) => setShopifyDomainInput(prev => ({
                                          ...prev,
                                          [workspace.id]: e.target.value
                                        }))}
                                        placeholder="mystore"
                                        disabled={connectingShopify === workspace.id}
                                        className="w-full px-3 py-2 pr-32 bg-bg-dark border border-border rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
                                      />
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">
                                        .myshopify.com
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        const shop = shopifyDomainInput[workspace.id]?.trim()
                                        if (!shop || !user) return
                                        setConnectingShopify(workspace.id)
                                        const normalizedDomain = shop.replace('.myshopify.com', '')
                                        window.location.href = `/api/auth/shopify?user_id=${user.id}&workspace_id=${workspace.id}&shop=${normalizedDomain}`
                                      }}
                                      disabled={connectingShopify === workspace.id || !shopifyDomainInput[workspace.id]?.trim()}
                                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <ShoppingBag className="w-4 h-4" />
                                      {connectingShopify === workspace.id ? 'Connecting...' : 'Connect'}
                                    </button>
                                  </div>
                                  <p className="text-xs text-zinc-500 mt-2">
                                    Enter your store name (e.g., "mystore" for mystore.myshopify.com)
                                  </p>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* UpPromote Affiliate */}
                {FEATURES.UPPROMOTE && (
                  <div className="border-t border-border">
                    <button
                      onClick={() => setExpandedUpPromote(expandedUpPromote === workspace.id ? null : workspace.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-bg-hover/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-orange-400" />
                        <span className="text-sm font-medium">UpPromote Affiliate</span>
                        {upPromoteConnections[workspace.id] && (
                          <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-400">Connected</span>
                        )}
                      </div>
                      {expandedUpPromote === workspace.id ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>

                    {expandedUpPromote === workspace.id && (
                      <div className="p-4 pt-0 space-y-4">
                        {upPromoteConnections[workspace.id] === undefined ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                          </div>
                        ) : upPromoteConnections[workspace.id] ? (
                          <>
                            {/* Connected State */}
                            <div className="p-4 rounded-lg bg-bg-dark border border-border">
                              <div className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-verdict-scale flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-white">Connected</div>
                                  {upPromoteConnections[workspace.id]!.last_sync_at && (
                                    <div className="text-xs text-zinc-500 mt-1">
                                      Last sync: {(() => {
                                        const date = new Date(upPromoteConnections[workspace.id]!.last_sync_at!)
                                        const now = new Date()
                                        const diffMs = now.getTime() - date.getTime()
                                        const diffMins = Math.floor(diffMs / 60000)
                                        const diffHours = Math.floor(diffMins / 60)
                                        const diffDays = Math.floor(diffHours / 24)

                                        if (diffMins < 1) return 'Just now'
                                        if (diffMins < 60) return `${diffMins} min ago`
                                        if (diffHours < 24) return `${diffHours}h ago`
                                        return `${diffDays}d ago`
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Sync Button */}
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleSyncUpPromote(workspace.id)}
                                disabled={syncingUpPromote === workspace.id}
                                className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`w-4 h-4 ${syncingUpPromote === workspace.id ? 'animate-spin' : ''}`} />
                                {syncingUpPromote === workspace.id ? 'Syncing...' : 'Sync Now'}
                              </button>
                            </div>

                            {/* Disconnect */}
                            <div className="pt-3 border-t border-border">
                              <button
                                onClick={() => handleDisconnectUpPromote(workspace.id)}
                                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
                              >
                                <Unlink className="w-4 h-4" />
                                Disconnect UpPromote
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Not Connected State */}
                            <p className="text-sm text-zinc-500 mb-4">
                              Track affiliate commissions and calculate True ROAS.
                            </p>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium mb-2">API Key</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={upPromoteApiKey[workspace.id] || ''}
                                    onChange={(e) => setUpPromoteApiKey(prev => ({
                                      ...prev,
                                      [workspace.id]: e.target.value
                                    }))}
                                    placeholder="paste-your-api-key-here"
                                    disabled={connectingUpPromote === workspace.id}
                                    className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
                                  />
                                  <button
                                    onClick={() => handleConnectUpPromote(workspace.id)}
                                    disabled={connectingUpPromote === workspace.id || !upPromoteApiKey[workspace.id]?.trim()}
                                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {connectingUpPromote === workspace.id ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Connecting...
                                      </>
                                    ) : (
                                      'Connect'
                                    )}
                                  </button>
                                </div>
                                <div className="flex items-start gap-2 mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-blue-400">
                                    Get your API key from <strong>UpPromote → Settings → API</strong>
                                  </p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

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

      {/* Manual Event Modal */}
      {showManualEventModal && (
        <ManualEventModal
          workspaceId={showManualEventModal}
          onClose={() => setShowManualEventModal(null)}
          onSuccess={() => {
            // Reload events for this workspace
            const wp = workspacePixels[showManualEventModal]
            if (wp) {
              loadPixelEvents(wp.pixel_id, showManualEventModal)
            }
          }}
        />
      )}
    </div>
  )
}
