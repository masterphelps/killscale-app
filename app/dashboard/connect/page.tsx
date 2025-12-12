'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { useAccount } from '@/lib/account'
import { createClient } from '@supabase/supabase-js'
import { Lock, Link2, Unlink, RefreshCw, CheckCircle, AlertCircle, Zap, LayoutDashboard, Calendar } from 'lucide-react'
import Link from 'next/link'
import { Select } from '@/components/ui/select'

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

type MetaConnection = {
  id: string
  meta_user_id: string
  meta_user_name: string
  access_token: string
  ad_accounts: AdAccount[]
  connected_at: string
  last_sync_at: string | null
  selected_account_id: string | null
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

const ACCOUNT_LIMITS: Record<string, number> = {
  'Free': 1,
  'Starter': 1,
  'Pro': 2,
  'Agency': 100,
}

export default function ConnectPage() {
  const { user } = useAuth()
  const { plan } = useSubscription()
  const { refetch: refetchAccounts } = useAccount()
  const searchParams = useSearchParams()
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [datePreset, setDatePreset] = useState('last_30d')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  const isPro = true // All plans can connect Meta API
  const accountLimit = ACCOUNT_LIMITS[plan] || 1
  const dashboardAccountCount = connection?.ad_accounts?.filter(a => a.in_dashboard).length || 0
  
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
      // Refresh the global account context
      refetchAccounts()
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
    }
    setLoading(false)
  }
  
  const handleConnect = () => {
    if (!user) return
    window.location.href = `/api/auth/meta?user_id=${user.id}`
  }
  
  const handleDisconnect = async () => {
    if (!user || !confirm('Disconnect your Meta account? This will remove all synced ad data.')) return
    
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

    // Refresh the global account context
    refetchAccounts()
  }
  
  const handleToggleDashboard = async (accountId: string) => {
    if (!user || !connection) return
    
    const account = connection.ad_accounts.find(a => a.id === accountId)
    if (!account) return
    
    const isCurrentlyInDashboard = account.in_dashboard
    
    // Check limit when adding
    if (!isCurrentlyInDashboard && dashboardAccountCount >= accountLimit) {
      setMessage({ 
        type: 'error', 
        text: `${plan} plan is limited to ${accountLimit} dashboard account${accountLimit > 1 ? 's' : ''}. Upgrade to add more.` 
      })
      return
    }
    
    // Update the ad_accounts array
    const updatedAccounts = connection.ad_accounts.map(a => 
      a.id === accountId ? { ...a, in_dashboard: !isCurrentlyInDashboard } : a
    )
    
    // If adding first account, also set it as selected
    const newSelectedId = !isCurrentlyInDashboard && dashboardAccountCount === 0 
      ? accountId 
      : connection.selected_account_id
    
    const { error } = await supabase
      .from('meta_connections')
      .update({ 
        ad_accounts: updatedAccounts,
        selected_account_id: newSelectedId
      })
      .eq('user_id', user.id)
    
    if (!error) {
      setConnection({
        ...connection,
        ad_accounts: updatedAccounts,
        selected_account_id: newSelectedId
      })
      setMessage({
        type: 'success',
        text: isCurrentlyInDashboard
          ? `${account.name} removed from dashboard`
          : `${account.name} added to dashboard`
      })

      // Refresh the global account context
      refetchAccounts()
    }
  }
  
  const handleSync = async (accountId: string) => {
    if (!user) return
    
    setSyncing(accountId)
    setMessage(null)
    
    try {
      const response = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: accountId,
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
    
    setSyncing(null)
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }
  
  const canConnect = isPro
  
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Connect Meta</h1>
          <p className="text-zinc-500">Link your Meta Ads accounts for automatic data sync</p>
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
              <div className="flex-1">
                <div className="font-medium">{connection.meta_user_name}</div>
                <div className="text-sm text-zinc-500">
                  Connected {new Date(connection.connected_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <>
            {canConnect ? (
              <button
                onClick={handleConnect}
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
              >
                <Link2 className="w-5 h-5" />
                Connect Meta Account
              </button>
            ) : (
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 text-zinc-400 mb-3">
                  <Lock className="w-5 h-5" />
                  <span>Meta API requires Pro plan</span>
                </div>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  Upgrade to Pro
                </Link>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Ad Accounts List */}
      {connection && connection.ad_accounts?.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Ad Accounts</h2>
            <div className="text-sm text-zinc-500">
              {dashboardAccountCount} / {accountLimit} in dashboard
            </div>
          </div>
          
          {/* Date preset selector for syncing */}
          <div className="mb-4 p-3 bg-bg-dark rounded-lg">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-zinc-400" />
              <label className="text-sm text-zinc-400">Sync date range:</label>
              <Select
                value={datePreset}
                onChange={setDatePreset}
                options={DATE_PRESETS}
                className="flex-1"
              />
            </div>
          </div>
          
          <div className="space-y-3">
            {connection.ad_accounts.map((account) => {
              const isInDashboard = account.in_dashboard
              const isSyncing = syncing === account.id
              const canAddToDashboard = isInDashboard || dashboardAccountCount < accountLimit
              
              return (
                <div 
                  key={account.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    isInDashboard 
                      ? 'bg-accent/5 border-accent/30' 
                      : 'bg-bg-dark border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {account.name}
                        {isInDashboard && (
                          <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
                            In Dashboard
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {account.id.replace('act_', '')} • {account.currency}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Sync Button */}
                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync'}
                      </button>
                      
                      {/* Add to Dashboard Toggle */}
                      <button
                        onClick={() => handleToggleDashboard(account.id)}
                        disabled={!canAddToDashboard && !isInDashboard}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isInDashboard
                            ? 'bg-accent text-white hover:bg-accent-hover'
                            : canAddToDashboard
                              ? 'bg-bg-card border border-border text-zinc-400 hover:text-white hover:border-zinc-500'
                              : 'bg-bg-card border border-border text-zinc-600 cursor-not-allowed'
                        }`}
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        {isInDashboard ? 'In Dashboard' : 'Add to Dashboard'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* Limit warning */}
          {dashboardAccountCount >= accountLimit && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-amber-500">
                <Lock className="w-4 h-4" />
                Dashboard account limit reached
              </div>
              <Link
                href="/pricing"
                className="text-sm text-amber-500 hover:text-amber-400 font-medium"
              >
                Upgrade →
              </Link>
            </div>
          )}
        </div>
      )}
      
      {/* Help text */}
      <div className="text-sm text-zinc-500 space-y-2">
        <p><strong>Sync:</strong> Pull the latest ad data for testing and review.</p>
        <p><strong>Add to Dashboard:</strong> Include this account in your main dashboard view. This counts against your plan&apos;s account limit.</p>
      </div>
    </div>
  )
}
