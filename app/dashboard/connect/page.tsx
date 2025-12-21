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
import { FEATURES } from '@/lib/feature-flags'

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

type GoogleCustomer = {
  id: string
  name: string
  currency: string
  manager?: boolean
  testAccount?: boolean
}

type GoogleConnection = {
  id: string
  google_user_id: string
  google_email: string | null
  customer_ids: GoogleCustomer[]
  connected_at: string
  last_sync_at: string | null
  selected_customer_id: string | null
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
  'Launch': 1,
  'Scale': 2,
  'Pro': 100,
}

export default function ConnectPage() {
  const { user } = useAuth()
  const { plan } = useSubscription()
  const { refetch: refetchAccounts } = useAccount()
  const searchParams = useSearchParams()
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [googleSyncing, setGoogleSyncing] = useState<string | null>(null)
  const [datePreset, setDatePreset] = useState('last_30d')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  const isPro = true // All plans can connect Meta API
  const accountLimit = ACCOUNT_LIMITS[plan] || 1
  const dashboardAccountCount = connection?.ad_accounts?.filter(a => a.in_dashboard).length || 0
  
  useEffect(() => {
    if (user) {
      loadConnection()
      if (FEATURES.GOOGLE_ADS_INTEGRATION) {
        loadGoogleConnection()
      }
    }
  }, [user])

  useEffect(() => {
    const success = searchParams.get('success')
    const googleSuccess = searchParams.get('google')
    const error = searchParams.get('error')

    if (success) {
      setMessage({ type: 'success', text: 'Meta account connected successfully!' })
      loadConnection()
      refetchAccounts()
    } else if (googleSuccess === 'success') {
      setMessage({ type: 'success', text: 'Google Ads account connected successfully!' })
      if (FEATURES.GOOGLE_ADS_INTEGRATION) {
        loadGoogleConnection()
      }
      refetchAccounts()
    } else if (error) {
      const errorMessages: Record<string, string> = {
        declined: 'You declined the permissions request.',
        missing_params: 'Missing required parameters.',
        expired: 'Connection request expired. Please try again.',
        token_failed: 'Failed to get access token.',
        no_ad_accounts: 'No ad accounts found on this Meta account.',
        no_google_ads_accounts: 'No Google Ads accounts found.',
        no_client_accounts: 'No accessible client accounts found.',
        no_refresh_token: 'Could not get refresh token. Please revoke access at myaccount.google.com and try again.',
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

  const loadGoogleConnection = async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('google_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data && !error) {
      setGoogleConnection(data)
    }
  }

  const handleGoogleConnect = () => {
    if (!user) return
    window.location.href = `/api/auth/google?user_id=${user.id}`
  }

  const handleGoogleDisconnect = async () => {
    if (!user || !confirm('Disconnect your Google Ads account? This will remove all synced ad data.')) return

    await supabase
      .from('google_connections')
      .delete()
      .eq('user_id', user.id)

    await supabase
      .from('google_ad_data')
      .delete()
      .eq('user_id', user.id)

    setGoogleConnection(null)
    setMessage({ type: 'success', text: 'Google Ads account disconnected.' })
    refetchAccounts()
  }

  const handleGoogleSync = async (customerId: string) => {
    if (!user) return

    setGoogleSyncing(customerId)
    setMessage(null)

    try {
      const response = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          customerId,
          dateStart: getDateFromPreset(datePreset).start,
          dateEnd: getDateFromPreset(datePreset).end,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: `Synced ${data.rowsProcessed} ads from Google Ads!` })
        loadGoogleConnection()
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Google Ads sync failed. Please try again.' })
    }

    setGoogleSyncing(null)
  }

  // Helper to convert date preset to actual dates
  const getDateFromPreset = (preset: string) => {
    const today = new Date()
    const end = today.toISOString().split('T')[0]
    let start: string

    switch (preset) {
      case 'today':
        start = end
        break
      case 'yesterday':
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        start = yesterday.toISOString().split('T')[0]
        break
      case 'last_7d':
        const week = new Date(today)
        week.setDate(week.getDate() - 7)
        start = week.toISOString().split('T')[0]
        break
      case 'last_14d':
        const twoWeeks = new Date(today)
        twoWeeks.setDate(twoWeeks.getDate() - 14)
        start = twoWeeks.toISOString().split('T')[0]
        break
      case 'last_30d':
      default:
        const month = new Date(today)
        month.setDate(month.getDate() - 30)
        start = month.toISOString().split('T')[0]
        break
    }

    return { start, end }
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
      
      {/* Google Ads Connection - Feature Flagged */}
      {FEATURES.GOOGLE_ADS_INTEGRATION && (
        <>
          <div className="border-t border-border my-8" />

          <div className="flex items-start justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-1">Connect Google Ads</h2>
              <p className="text-zinc-500">Link your Google Ads accounts for automatic data sync</p>
            </div>
          </div>

          {/* Google Connection Status */}
          <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Connection Status</h3>
              {googleConnection ? (
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

            {googleConnection ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-bg-dark rounded-lg">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{googleConnection.google_email || 'Google Account'}</div>
                    <div className="text-sm text-zinc-500">
                      Connected {new Date(googleConnection.connected_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={handleGoogleDisconnect}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <Unlink className="w-4 h-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGoogleConnect}
                className="flex items-center justify-center gap-2 w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors"
              >
                <Link2 className="w-5 h-5" />
                Connect Google Ads Account
              </button>
            )}
          </div>

          {/* Google Ads Accounts List */}
          {googleConnection && googleConnection.customer_ids?.length > 0 && (
            <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Google Ads Accounts</h3>
                <div className="text-sm text-zinc-500">
                  {googleConnection.customer_ids.length} account{googleConnection.customer_ids.length > 1 ? 's' : ''}
                </div>
              </div>

              <div className="space-y-3">
                {googleConnection.customer_ids.map((customer) => {
                  const isSyncing = googleSyncing === customer.id

                  return (
                    <div
                      key={customer.id}
                      className="p-4 rounded-lg border bg-bg-dark border-border"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {customer.name}
                            {customer.testAccount && (
                              <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">
                                Test
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-zinc-500">
                            {customer.id} • {customer.currency}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleGoogleSync(customer.id)}
                            disabled={isSyncing}
                            className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Sync'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Help text */}
      <div className="text-sm text-zinc-500 space-y-2">
        <p><strong>Sync:</strong> Pull the latest ad data for testing and review.</p>
        <p><strong>Add to Dashboard:</strong> Include this account in your main dashboard view. This counts against your plan&apos;s account limit.</p>
      </div>
    </div>
  )
}
