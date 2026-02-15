'use client'

import { useState, useEffect } from 'react'
import { Gift, Check, RefreshCw, Unlink, Info, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

type UpPromoteConnection = {
  id: string
  workspace_id: string
  api_key: string
  created_at: string
  last_sync_at?: string
}

interface UpPromotePanelProps {
  workspaceId: string | null
}

export function UpPromotePanel({ workspaceId }: UpPromotePanelProps) {
  const { user } = useAuth()

  const [upPromoteConnection, setUpPromoteConnection] = useState<UpPromoteConnection | null>(null)
  const [upPromoteApiKey, setUpPromoteApiKey] = useState('')
  const [connectingUpPromote, setConnectingUpPromote] = useState(false)
  const [syncingUpPromote, setSyncingUpPromote] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !workspaceId) {
      setLoading(false)
      return
    }
    load()
  }, [user, workspaceId])

  const load = async () => {
    if (!user?.id || !workspaceId) return
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('uppromote_connections')
        .select('id, workspace_id, api_key, created_at, last_sync_at')
        .eq('workspace_id', workspaceId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Failed to load UpPromote connection:', error)
        setUpPromoteConnection(null)
        setLoading(false)
        return
      }

      setUpPromoteConnection(data || null)
    } catch (err) {
      console.error('Failed to load UpPromote connection:', err)
      setUpPromoteConnection(null)
    }

    setLoading(false)
  }

  const handleConnect = async () => {
    const apiKey = upPromoteApiKey.trim()
    if (!apiKey || !user || !workspaceId) return

    setConnectingUpPromote(true)
    try {
      const res = await fetch('/api/auth/uppromote/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id, apiKey })
      })
      const data = await res.json()
      if (data.success) {
        await load()
        setUpPromoteApiKey('')
      } else {
        alert(data.error || 'Failed to connect UpPromote')
      }
    } catch (err) {
      console.error('UpPromote connect error:', err)
      alert('Failed to connect UpPromote')
    } finally {
      setConnectingUpPromote(false)
    }
  }

  const handleSync = async () => {
    if (!user || !workspaceId) return

    setSyncingUpPromote(true)
    try {
      const res = await fetch('/api/uppromote/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id })
      })
      if (res.ok) {
        await load()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to sync UpPromote')
      }
    } catch (err) {
      console.error('UpPromote sync error:', err)
      alert('Failed to sync UpPromote')
    } finally {
      setSyncingUpPromote(false)
    }
  }

  const handleDisconnect = async () => {
    if (!user || !workspaceId) return
    if (!confirm('Disconnect UpPromote? This will stop tracking affiliate commissions.')) return

    try {
      const res = await fetch('/api/uppromote/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id })
      })
      if (res.ok) {
        setUpPromoteConnection(null)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to disconnect UpPromote')
      }
    } catch (err) {
      console.error('UpPromote disconnect error:', err)
      alert('Failed to disconnect UpPromote')
    }
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (!workspaceId) {
    return (
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold mb-4">UpPromote</h2>
        <p className="text-sm text-zinc-500">Select a workspace to manage UpPromote settings.</p>
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
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold">UpPromote Affiliate</h2>
        </div>
        {upPromoteConnection && (
          <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-400">Connected</span>
        )}
      </div>

      {upPromoteConnection ? (
        <div className="space-y-4">
          {/* Connected State */}
          <div className="p-4 rounded-lg bg-bg-card border border-border">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-verdict-scale flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white">Connected</div>
                {upPromoteConnection.last_sync_at && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Last sync: {formatRelativeTime(upPromoteConnection.last_sync_at)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sync Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSync}
              disabled={syncingUpPromote}
              className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', syncingUpPromote && 'animate-spin')} />
              {syncingUpPromote ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {/* Disconnect */}
          <div className="pt-3 border-t border-border">
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
            >
              <Unlink className="w-4 h-4" />
              Disconnect UpPromote
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Track affiliate commissions and calculate True ROAS.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={upPromoteApiKey}
                  onChange={(e) => setUpPromoteApiKey(e.target.value)}
                  placeholder="paste-your-api-key-here"
                  disabled={connectingUpPromote}
                  className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
                />
                <button
                  onClick={handleConnect}
                  disabled={connectingUpPromote || !upPromoteApiKey.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connectingUpPromote ? (
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
                  Get your API key from <strong>UpPromote &rarr; Settings &rarr; API</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
