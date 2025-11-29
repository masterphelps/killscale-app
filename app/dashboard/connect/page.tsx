'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { createClient } from '@supabase/supabase-js'
import { Lock, Link2, Unlink, RefreshCw, CheckCircle, AlertCircle, Zap } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type AdAccount = {
  id: string
  name: string
  account_status: number
  currency: string
}

type MetaConnection = {
  id: string
  meta_user_id: string
  meta_user_name: string
  ad_accounts: AdAccount[]
  connected_at: string
  last_sync_at: string | null
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 Days' },
  { value: 'last_14d', label: 'Last 14 Days' },
  { value: 'last_30d', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
]

export default function ConnectPage() {
  const { user } = useAuth()
  const { plan } = useSubscription()
  const searchParams = useSearchParams()
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [datePreset, setDatePreset] = useState('last_30d')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  const isPro = plan === 'Pro' || plan === 'Agency'
  
  useEffect(() => {
    if (user) {
      loadConnection()
    }
  }, [user])
  
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success) {
      setMessage({ type: 'success', text: 'Meta account connected successfully!' })
      loadConnection()
    } else if (error) {
      const errorMessages: Record<string, string> = {
        declined: 'You declined the permissions request.',
        missing_params: 'Missing required parameters.',
        expired: 'Connection request expired. Please try again.',
        token_failed: 'Failed to get access token.',
        no_ad_accounts: 'No ad accounts found on this Meta account.',
        db_failed: 'Failed to save connection.',
        unknown: 'An unknown error occurred.',
      }
      setMessage({ type: 'error', text: errorMessages[error] || 'Connection failed.' })
    }
  }, [searchParams])
  
  const loadConnection = async () => {
    if (!user) return
    
    setLoading(true)
    const { data, error } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (data && !error) {
      setConnection(data)
      if (data.ad_accounts?.length > 0) {
        setSelectedAccount(data.ad_accounts[0].id)
      }
    }
    setLoading(false)
  }
  
  const handleConnect = () => {
    if (!user) return
    window.location.href = `/api/auth/meta?user_id=${user.id}`
  }
  
  const handleDisconnect = async () => {
    if (!user || !confirm('Disconnect your Meta account? This will remove synced ad data.')) return
    
    await supabase
      .from('meta_connections')
      .delete()
      .eq('user_id', user.id)
    
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)
      .eq('source', 'meta_api')
    
    setConnection(null)
    setMessage({ type: 'success', text: 'Meta account disconnected.' })
  }
  
  const handleSync = async () => {
    if (!user || !selectedAccount) return
    
    setSyncing(true)
    setMessage(null)
    
    try {
      const response = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: selectedAccount,
          datePreset,
        }),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setMessage({ type: 'success', text: `Synced ${data.count} ads successfully!` })
        loadConnection()
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Sync failed. Please try again.' })
    }
    
    setSyncing(false)
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }
  
  // Gate for non-Pro users
  if (!isPro) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Connect Meta</h1>
            <p className="text-zinc-500">Link your Meta Ads account for automatic data sync</p>
          </div>
        </div>
        
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Pro Feature</h2>
          <p className="text-zinc-400 mb-6 max-w-md mx-auto">
            Meta API integration is available on Pro and Agency plans. 
            Connect your ad accounts for automatic daily syncing - no more CSV uploads!
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-semibold transition-colors"
          >
            <Zap className="w-4 h-4" />
            Upgrade to Pro
          </Link>
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Connect Meta</h1>
          <p className="text-zinc-500">Link your Meta Ads account for automatic data sync</p>
        </div>
      </div>
      
      {/* Status Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' 
            ? 'bg-verdict-scale/10 border border-verdict-scale/30 text-verdict-scale'
            : 'bg-verdict-kill/10 border border-verdict-kill/30 text-verdict-kill'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}
      
      {/* Connection Status */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Connection Status</h2>
          {connection ? (
            <span className="flex items-center gap-2 text-sm text-verdict-scale">
              <span className="w-2 h-2 bg-verdict-scale rounded-full" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="w-2 h-2 bg-zinc-500 rounded-full" />
              Not connected
            </span>
          )}
        </div>
        
        {connection ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-bg-dark rounded-lg">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <div className="font-medium">{connection.meta_user_name}</div>
                <div className="text-sm text-zinc-500">
                  Connected {new Date(connection.connected_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
            >
              <Unlink className="w-4 h-4" />
              Disconnect account
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            <Link2 className="w-5 h-5" />
            Connect Meta Account
          </button>
        )}
      </div>
      
      {/* Sync Controls */}
      {connection && connection.ad_accounts?.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Sync Ad Data</h2>
          
          <div className="space-y-4">
            {/* Ad Account Selector */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Ad Account</label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-4 py-2 bg-bg-dark border border-border rounded-lg text-white focus:border-accent focus:outline-none"
              >
                {connection.ad_accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.id.replace('act_', '')})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Date Range Selector */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Date Range</label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="w-full px-4 py-2 bg-bg-dark border border-border rounded-lg text-white focus:border-accent focus:outline-none"
              >
                {DATE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Last Sync Info */}
            {connection.last_sync_at && (
              <div className="text-sm text-zinc-500">
                Last synced: {new Date(connection.last_sync_at).toLocaleString()}
              </div>
            )}
            
            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={syncing || !selectedAccount}
              className="flex items-center justify-center gap-2 w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
