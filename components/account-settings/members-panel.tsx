'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Copy, Check, X, Loader2, Globe, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

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

interface MembersPanelProps {
  workspaceId: string | null
}

export function MembersPanel({ workspaceId }: MembersPanelProps) {
  const { user } = useAuth()

  // Team management state
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteCanLogWalkins, setInviteCanLogWalkins] = useState(true)
  const [sending, setSending] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Client Portal state
  const [portalSettings, setPortalSettings] = useState<{ enabled: boolean; url: string | null; hasPin: boolean } | null>(null)
  const [portalPin, setPortalPin] = useState('')
  const [savingPortal, setSavingPortal] = useState(false)
  const [copiedPortalUrl, setCopiedPortalUrl] = useState(false)
  const [expandedPortal, setExpandedPortal] = useState(false)
  const [showPin, setShowPin] = useState(false)

  // Load team data
  useEffect(() => {
    if (!user || !workspaceId) {
      setLoading(false)
      return
    }
    loadTeamData()
  }, [user, workspaceId])

  // Load portal settings when expanded
  useEffect(() => {
    if (expandedPortal && !portalSettings && workspaceId && user) {
      loadPortalSettings()
    }
  }, [expandedPortal])

  const loadTeamData = async () => {
    if (!workspaceId || !user) return
    setLoading(true)

    try {
      // Load members
      const membersRes = await fetch(`/api/workspace/members?workspaceId=${workspaceId}&userId=${user.id}`)
      const membersData = await membersRes.json()
      if (membersData.members) {
        setMembers(membersData.members)
      }

      // Load invites
      const invitesRes = await fetch(`/api/workspace/invite?workspaceId=${workspaceId}&userId=${user.id}`)
      const invitesData = await invitesRes.json()
      if (invitesData.invites) {
        setInvites(invitesData.invites)
      }
    } catch (err) {
      console.error('Failed to load team data:', err)
    }

    setLoading(false)
  }

  const loadPortalSettings = async () => {
    if (!workspaceId || !user) return

    try {
      const res = await fetch(`/api/portal/settings?workspaceId=${workspaceId}&userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setPortalSettings({
          enabled: data.portalEnabled,
          url: data.portalUrl,
          hasPin: data.hasPin
        })
      }
    } catch (err) {
      console.error('Failed to load portal settings:', err)
    }
  }

  const handleSendInvite = async () => {
    if (!user || !workspaceId || !inviteEmail.trim()) return
    setSending(true)
    setError('')

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
      setInvites(prev => [
        ...prev,
        {
          id: data.invite.id,
          email: data.invite.email,
          role: data.invite.role,
          canLogWalkins: inviteCanLogWalkins,
          inviteUrl: data.invite.inviteUrl,
          expiresAt: data.invite.expiresAt
        }
      ])

      // Reset form
      setInviteEmail('')
      setInviteRole('viewer')
      setInviteCanLogWalkins(true)
      setShowInviteForm(false)
    } catch {
      setError('Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    if (!user) return

    try {
      const res = await fetch(`/api/workspace/invite?inviteId=${inviteId}&userId=${user.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setInvites(prev => prev.filter(inv => inv.id !== inviteId))
      }
    } catch (err) {
      console.error('Failed to cancel invite:', err)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!user || !confirm('Remove this member?')) return

    try {
      const res = await fetch(`/api/workspace/members?memberId=${memberId}&userId=${user.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== memberId))
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

  const handleSetupPortal = async () => {
    if (!user || !workspaceId || !portalPin || portalPin.length < 4) {
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

      setPortalSettings({
        enabled: data.portalEnabled,
        url: data.portalUrl,
        hasPin: true
      })
      setPortalPin('')
    } catch {
      setError('Failed to setup portal')
    } finally {
      setSavingPortal(false)
    }
  }

  const handleTogglePortal = async (enabled: boolean) => {
    if (!user || !workspaceId) return

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
        setPortalSettings(prev => prev ? { ...prev, enabled } : null)
      }
    } catch (err) {
      console.error('Failed to toggle portal:', err)
    }
  }

  const copyPortalUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedPortalUrl(true)
    setTimeout(() => setCopiedPortalUrl(false), 2000)
  }

  if (!workspaceId) {
    return (
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold mb-4">Members</h2>
        <p className="text-sm text-zinc-500">Select a workspace to manage members.</p>
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

  return (
    <div className="max-w-lg space-y-6">
      {/* Team Management */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          Team Members
        </h2>

        <div className="space-y-2">
          {/* Owner row */}
          <div className="p-3 bg-bg-card border border-border rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">{user?.email}</span>
              <span className="px-2 py-0.5 text-xs rounded bg-accent/20 text-accent">Owner</span>
            </div>
          </div>

          {/* Member rows */}
          {members.map((member) => (
            <div key={member.id} className="p-3 bg-bg-card border border-border rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{member.email}</span>
                <span className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-400 capitalize">{member.role}</span>
                {member.canLogWalkins && (
                  <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-400">Walk-ins</span>
                )}
              </div>
              <button
                onClick={() => handleRemoveMember(member.id)}
                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Pending Invites */}
          {invites.map((invite) => (
            <div key={invite.id} className="p-3 bg-bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">{invite.email}</span>
                  <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">Pending</span>
                </div>
                <button
                  onClick={() => handleCancelInvite(invite.id)}
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
          {showInviteForm ? (
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

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendInvite}
                  disabled={sending || !inviteEmail.trim()}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {sending ? (
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
                    setShowInviteForm(false)
                    setInviteEmail('')
                    setError('')
                  }}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowInviteForm(true)}
              className="w-full py-2 border border-dashed border-purple-500/30 hover:border-purple-500 rounded-lg text-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* Client Portal */}
      <div className="border-t border-border pt-6">
        <button
          onClick={() => setExpandedPortal(!expandedPortal)}
          className="w-full flex items-center justify-between mb-4"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Client Portal</h2>
            {portalSettings?.enabled && (
              <span className="px-2 py-0.5 text-xs rounded bg-cyan-500/20 text-cyan-400">Active</span>
            )}
          </div>
        </button>

        {expandedPortal && (
          <div className="space-y-3">
            {portalSettings?.hasPin ? (
              <>
                {/* Portal URL and toggle */}
                <div className="p-3 bg-bg-card border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Portal Status</span>
                    <button
                      onClick={() => handleTogglePortal(!portalSettings.enabled)}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors",
                        portalSettings.enabled ? "bg-cyan-600" : "bg-zinc-700"
                      )}
                    >
                      <span className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                        portalSettings.enabled ? "left-6" : "left-1"
                      )} />
                    </button>
                  </div>
                  {portalSettings.url && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={portalSettings.url}
                        readOnly
                        className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 truncate"
                      />
                      <button
                        onClick={() => copyPortalUrl(portalSettings.url!)}
                        className="p-2 text-zinc-500 hover:text-white transition-colors"
                        title="Copy URL"
                      >
                        {copiedPortalUrl ? <Check className="w-4 h-4 text-cyan-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={portalSettings.url}
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
                  <div className="relative flex-1">
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={portalPin}
                      onChange={(e) => setPortalPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 4-6 digit PIN"
                      maxLength={6}
                      className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent pr-10"
                    />
                    <button
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white transition-colors"
                      type="button"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={handleSetupPortal}
                    disabled={savingPortal || portalPin.length < 4}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    {savingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Setup Portal'}
                  </button>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
