'use client'

import { useState, useEffect } from 'react'
import { Link2, Unlink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

interface ConnectionsPanelProps {
  onClose: () => void
}

export function ConnectionsPanel({ onClose }: ConnectionsPanelProps) {
  const { user } = useAuth()
  const { refetch: refetchAccounts } = useAccount()

  const [metaConnected, setMetaConnected] = useState(false)
  const [metaUserName, setMetaUserName] = useState('')
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleUserEmail, setGoogleUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('meta') === 'success' || params.get('google') === 'success') {
        return { type: 'success', text: 'Account connected successfully!' }
      }
      const errorParam = params.get('error')
      if (errorParam) {
        const messages: Record<string, string> = {
          declined: 'Connection was declined or cancelled.',
          missing_params: 'Missing parameters. Please try again.',
          expired: 'Session expired. Please try again.',
          token_failed: 'Failed to get access token. Please try again.',
          no_refresh_token: 'No refresh token received. Please try again.',
          no_google_ads_accounts: 'No Google Ads accounts found.',
          no_client_accounts: 'No client accounts found.',
          db_failed: 'Failed to save connection. Please try again.',
        }
        return { type: 'error', text: messages[errorParam] || `Connection error: ${errorParam}` }
      }
    }
    return null
  })

  useEffect(() => {
    if (user) loadConnections()
  }, [user])

  const loadConnections = async () => {
    if (!user) return
    setLoading(true)

    const [{ data: metaData }, { data: googleData }] = await Promise.all([
      supabase.from('meta_connections').select('meta_user_name').eq('user_id', user.id).single(),
      supabase.from('google_connections').select('google_user_email').eq('user_id', user.id).single(),
    ])

    if (metaData) {
      setMetaConnected(true)
      setMetaUserName(metaData.meta_user_name || '')
    }
    if (googleData) {
      setGoogleConnected(true)
      setGoogleUserEmail(googleData.google_user_email || '')
    }

    setLoading(false)
  }

  const handleConnectMeta = () => {
    if (!user) return
    onClose()
    window.location.href = `/api/auth/meta?user_id=${user.id}`
  }

  const handleConnectGoogle = () => {
    if (!user) return
    onClose()
    window.location.href = `/api/auth/google?user_id=${user.id}`
  }

  const handleDisconnectMeta = async () => {
    if (!user || !confirm('Disconnect your Meta account? This will remove all synced ad data.')) return

    await supabase.from('meta_connections').delete().eq('user_id', user.id)
    await supabase.from('ad_data').delete().eq('user_id', user.id).eq('source', 'meta_api')

    setMetaConnected(false)
    setMetaUserName('')
    setMessage({ type: 'success', text: 'Meta account disconnected.' })
    refetchAccounts()
  }

  const handleDisconnectGoogle = async () => {
    if (!user || !confirm('Disconnect your Google account? This will remove all synced ad data.')) return

    await supabase.from('google_connections').delete().eq('user_id', user.id)
    await supabase.from('google_ad_data').delete().eq('user_id', user.id)

    setGoogleConnected(false)
    setGoogleUserEmail('')
    setMessage({ type: 'success', text: 'Google account disconnected.' })
    refetchAccounts()
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
      <h2 className="text-lg font-semibold mb-1">Connections</h2>
      <p className="text-xs text-zinc-500 mb-6">Connect your ad platforms. Assign accounts to workspaces in Data Sources.</p>

      {/* Status Message */}
      {message && (
        <div className={cn(
          'mb-4 p-3 rounded-lg flex items-center gap-2 text-sm',
          message.type === 'success'
            ? 'bg-verdict-scale/10 border border-verdict-scale/30 text-verdict-scale'
            : 'bg-verdict-kill/10 border border-verdict-kill/30 text-verdict-kill'
        )}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {/* Meta Ads */}
        <div className="bg-bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Meta Ads</div>
              <div className="text-xs text-zinc-500">
                {metaConnected ? metaUserName : 'Not connected'}
              </div>
            </div>
          </div>

          {metaConnected ? (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-verdict-scale">
                <span className="w-1.5 h-1.5 bg-verdict-scale rounded-full" />
                Connected
              </span>
              <button
                onClick={handleDisconnectMeta}
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Disconnect"
              >
                <Unlink className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectMeta}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
            >
              <Link2 className="w-4 h-4" />
              Connect
            </button>
          )}
        </div>

        {/* Google Ads */}
        <div className="bg-bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                Google Ads
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">Beta</span>
              </div>
              <div className="text-xs text-zinc-500">
                {googleConnected ? googleUserEmail : 'Not connected'}
              </div>
            </div>
          </div>

          {googleConnected ? (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-verdict-scale">
                <span className="w-1.5 h-1.5 bg-verdict-scale rounded-full" />
                Connected
              </span>
              <button
                onClick={handleDisconnectGoogle}
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Disconnect"
              >
                <Unlink className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogle}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-medium transition-colors"
            >
              <Link2 className="w-4 h-4" />
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
