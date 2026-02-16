'use client'

import { useState, useEffect } from 'react'
import { Lock, Link2, Unlink, CheckCircle, AlertCircle, ChevronDown, Eye, EyeOff, Upload, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { CSVUpload } from '@/components/csv-upload'
import { CSVRow } from '@/lib/csv-parser'
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

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

type GoogleConnection = {
  id: string
  google_user_id: string
  google_user_email: string
  ad_accounts: AdAccount[]
  connected_at: string
  last_sync_at: string | null
  selected_account_id: string | null
}

const MAX_ACCOUNTS = 3

interface ConnectionsPanelProps {
  onClose: () => void
}

export function ConnectionsPanel({ onClose }: ConnectionsPanelProps) {
  const { user } = useAuth()
  const { refetch: refetchAccounts } = useAccount()

  const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null)
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(() => {
    // Check URL params for OAuth callback messages
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

  // Expandable sections
  const [metaExpanded, setMetaExpanded] = useState(true)
  const [googleExpanded, setGoogleExpanded] = useState(true)

  // CSV upload state - keyed by account ID
  const [csvUploadAccountId, setCsvUploadAccountId] = useState<string | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [accountCsvCounts, setAccountCsvCounts] = useState<Record<string, number>>({})

  const accountLimit = MAX_ACCOUNTS
  const metaAccountCount = metaConnection?.ad_accounts?.filter(a => a.in_dashboard).length || 0
  const googleAccountCount = googleConnection?.ad_accounts?.filter(a => a.in_dashboard).length || 0
  const totalDashboardCount = metaAccountCount + googleAccountCount

  useEffect(() => {
    if (user) loadConnections()
  }, [user])

  const loadConnections = async () => {
    if (!user) return
    setLoading(true)

    // Load Meta connection
    const { data: metaData } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (metaData) {
      setMetaConnection(metaData)
    }

    // Load Google connection
    const { data: googleData } = await supabase
      .from('google_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (googleData) {
      setGoogleConnection(googleData)
    }

    // Check CSV data counts per account
    if (metaData?.ad_accounts) {
      const counts: Record<string, number> = {}
      for (const account of metaData.ad_accounts) {
        const { count } = await supabase
          .from('ad_data')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('ad_account_id', account.id)
          .eq('source', 'csv')
        counts[account.id] = count || 0
      }
      setAccountCsvCounts(counts)
    }

    setLoading(false)
  }

  const handleCsvUpload = async (rows: CSVRow[], accountId: string) => {
    if (!user) return

    setCsvUploading(true)

    // Delete existing CSV data for this account
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)
      .eq('ad_account_id', accountId)
      .eq('source', 'csv')

    const insertData = rows.map(row => ({
      user_id: user.id,
      ad_account_id: accountId,
      source: 'csv',
      date_start: row.date_start,
      date_end: row.date_end,
      campaign_name: row.campaign_name,
      adset_name: row.adset_name,
      ad_name: row.ad_name,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      purchases: row.purchases,
      revenue: row.revenue,
    }))

    const { error } = await supabase
      .from('ad_data')
      .insert(insertData)

    if (!error) {
      setAccountCsvCounts(prev => ({ ...prev, [accountId]: rows.length }))
      setCsvUploadAccountId(null)
      setMessage({ type: 'success', text: `Imported ${rows.length} rows from CSV` })
    } else {
      console.error('Error saving CSV data:', error)
      setMessage({ type: 'error', text: 'Failed to save CSV data. Please try again.' })
    }

    setCsvUploading(false)
  }

  const handleDeleteCsvData = async (accountId: string) => {
    if (!user || !confirm('Delete imported CSV data for this account?')) return

    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)
      .eq('ad_account_id', accountId)
      .eq('source', 'csv')

    setAccountCsvCounts(prev => ({ ...prev, [accountId]: 0 }))
    setMessage({ type: 'success', text: 'CSV data deleted' })
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

    await supabase
      .from('meta_connections')
      .delete()
      .eq('user_id', user.id)

    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)
      .eq('source', 'meta_api')

    setMetaConnection(null)
    setMessage({ type: 'success', text: 'Meta account disconnected.' })
    refetchAccounts()
  }

  const handleDisconnectGoogle = async () => {
    if (!user || !confirm('Disconnect your Google account? This will remove all synced ad data.')) return

    await supabase
      .from('google_connections')
      .delete()
      .eq('user_id', user.id)

    await supabase
      .from('google_ad_data')
      .delete()
      .eq('user_id', user.id)

    setGoogleConnection(null)
    setMessage({ type: 'success', text: 'Google account disconnected.' })
    refetchAccounts()
  }

  const handleToggleWorkspace = async (platform: 'meta' | 'google', accountId: string) => {
    if (!user) return

    const connection = platform === 'meta' ? metaConnection : googleConnection
    if (!connection) return

    const account = connection.ad_accounts.find(a => a.id === accountId)
    if (!account) return

    const isCurrentlyIn = account.in_dashboard

    // Check limit when adding
    if (!isCurrentlyIn && totalDashboardCount >= accountLimit) {
      setMessage({
        type: 'error',
        text: `Account limit reached (${accountLimit} max). Contact support for more.`
      })
      return
    }

    // Update the ad_accounts array
    const updatedAccounts = connection.ad_accounts.map(a =>
      a.id === accountId ? { ...a, in_dashboard: !isCurrentlyIn } : a
    )

    const table = platform === 'meta' ? 'meta_connections' : 'google_connections'

    const { error } = await supabase
      .from(table)
      .update({ ad_accounts: updatedAccounts })
      .eq('user_id', user.id)

    if (!error) {
      if (platform === 'meta') {
        setMetaConnection({ ...connection, ad_accounts: updatedAccounts } as MetaConnection)
      } else {
        setGoogleConnection({ ...connection, ad_accounts: updatedAccounts } as GoogleConnection)
      }

      setMessage({
        type: 'success',
        text: isCurrentlyIn
          ? `${account.name} hidden from dropdown`
          : `${account.name} visible in dropdown`
      })

      refetchAccounts()
    }
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
        <h2 className="text-lg font-semibold">Connections</h2>
        <span className="text-xs text-zinc-500">{totalDashboardCount} / {accountLimit} visible</span>
      </div>

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
        {/* Meta Ads Section */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setMetaExpanded(!metaExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">Meta Ads</div>
                <div className="text-xs text-zinc-500">
                  {metaConnection
                    ? `Connected as ${metaConnection.meta_user_name}`
                    : 'Not connected'
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {metaConnection ? (
                <span className="flex items-center gap-2 text-xs text-verdict-scale">
                  <span className="w-2 h-2 bg-verdict-scale rounded-full" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="w-2 h-2 bg-zinc-500 rounded-full" />
                  Not connected
                </span>
              )}
              <ChevronDown className={cn('w-5 h-5 text-zinc-500 transition-transform', metaExpanded && 'rotate-180')} />
            </div>
          </button>

          {metaExpanded && (
            <div className="border-t border-border p-4">
              {metaConnection ? (
                <div className="space-y-3">
                  {/* Ad Accounts List */}
                  {metaConnection.ad_accounts?.length > 0 ? (
                    <div className="space-y-2">
                      {metaConnection.ad_accounts.map((account) => {
                        const isInWorkspace = account.in_dashboard
                        const canAdd = isInWorkspace || totalDashboardCount < accountLimit

                        const csvCount = accountCsvCounts[account.id] || 0
                        const isUploadingThis = csvUploadAccountId === account.id

                        return (
                          <div
                            key={account.id}
                            className={cn(
                              'p-3 rounded-lg border transition-colors bg-bg-dark border-border',
                              !isInWorkspace && 'opacity-60'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">
                                  {account.name}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {account.id.replace('act_', '')} &middot; {account.currency}
                                  {csvCount > 0 && (
                                    <span className="ml-2 text-accent">&middot; {csvCount} CSV rows</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {/* CSV Import/Delete */}
                                {csvCount > 0 ? (
                                  <button
                                    onClick={() => handleDeleteCsvData(account.id)}
                                    title="Delete CSV data"
                                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setCsvUploadAccountId(isUploadingThis ? null : account.id)}
                                    title="Import CSV data"
                                    className={cn(
                                      'p-2 rounded-lg transition-colors',
                                      isUploadingThis
                                        ? 'text-accent bg-accent/10'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-bg-hover'
                                    )}
                                  >
                                    <Upload className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Visibility toggle */}
                                <button
                                  onClick={() => handleToggleWorkspace('meta', account.id)}
                                  disabled={!canAdd && !isInWorkspace}
                                  title={isInWorkspace ? 'Hide from dropdown' : 'Show in dropdown'}
                                  className={cn(
                                    'p-2 rounded-lg transition-colors',
                                    isInWorkspace
                                      ? 'text-accent hover:bg-accent/10'
                                      : canAdd
                                        ? 'text-zinc-500 hover:text-zinc-300 hover:bg-bg-hover'
                                        : 'text-zinc-600 cursor-not-allowed'
                                  )}
                                >
                                  {isInWorkspace ? (
                                    <Eye className="w-5 h-5" />
                                  ) : (
                                    <EyeOff className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* CSV Upload area */}
                            {isUploadingThis && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <CSVUpload
                                  onUpload={(rows) => handleCsvUpload(rows, account.id)}
                                  isLoading={csvUploading}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No ad accounts found</p>
                  )}

                  {/* Disconnect */}
                  <div className="pt-3 border-t border-border">
                    <button
                      onClick={handleDisconnectMeta}
                      className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Unlink className="w-4 h-4" />
                      Disconnect Meta Account
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnectMeta}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
                >
                  <Link2 className="w-5 h-5" />
                  Connect Meta Account
                </button>
              )}
            </div>
          )}
        </div>

        {/* Google Ads Section */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setGoogleExpanded(!googleExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm flex items-center gap-2">
                  Google Ads
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">Beta</span>
                </div>
                <div className="text-xs text-zinc-500">
                  {googleConnection
                    ? `Connected as ${googleConnection.google_user_email}`
                    : 'Not connected'
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {googleConnection ? (
                <span className="flex items-center gap-2 text-xs text-verdict-scale">
                  <span className="w-2 h-2 bg-verdict-scale rounded-full" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="w-2 h-2 bg-zinc-500 rounded-full" />
                  Not connected
                </span>
              )}
              <ChevronDown className={cn('w-5 h-5 text-zinc-500 transition-transform', googleExpanded && 'rotate-180')} />
            </div>
          </button>

          {googleExpanded && (
            <div className="border-t border-border p-4">
              {googleConnection ? (
                <div className="space-y-3">
                  {/* Ad Accounts List */}
                  {googleConnection.ad_accounts?.length > 0 ? (
                    <div className="space-y-2">
                      {googleConnection.ad_accounts.map((account) => {
                        const isInWorkspace = account.in_dashboard
                        const canAdd = isInWorkspace || totalDashboardCount < accountLimit

                        return (
                          <div
                            key={account.id}
                            className={cn(
                              'p-3 rounded-lg border transition-colors bg-bg-dark border-border',
                              !isInWorkspace && 'opacity-60'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">
                                  {account.name}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {account.id} &middot; {account.currency}
                                </div>
                              </div>

                              <button
                                onClick={() => handleToggleWorkspace('google', account.id)}
                                disabled={!canAdd && !isInWorkspace}
                                title={isInWorkspace ? 'Hide from dropdown' : 'Show in dropdown'}
                                className={cn(
                                  'p-2 rounded-lg transition-colors',
                                  isInWorkspace
                                    ? 'text-accent hover:bg-accent/10'
                                    : canAdd
                                      ? 'text-zinc-500 hover:text-zinc-300 hover:bg-bg-hover'
                                      : 'text-zinc-600 cursor-not-allowed'
                                )}
                              >
                                {isInWorkspace ? (
                                  <Eye className="w-5 h-5" />
                                ) : (
                                  <EyeOff className="w-5 h-5" />
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No ad accounts found</p>
                  )}

                  {/* Disconnect */}
                  <div className="pt-3 border-t border-border">
                    <button
                      onClick={handleDisconnectGoogle}
                      className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <Unlink className="w-4 h-4" />
                      Disconnect Google Account
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-zinc-500 mb-4">
                    Connect your Google Ads account to view campaigns alongside Meta.
                  </p>
                  <button
                    onClick={handleConnectGoogle}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Connect Google Ads
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Limit warning */}
      {totalDashboardCount >= accountLimit && (
        <div className="mt-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-sm text-amber-500">
          <Lock className="w-4 h-4" />
          Account limit reached ({accountLimit} max)
        </div>
      )}

      {/* Help text */}
      <div className="mt-6 text-xs text-zinc-500 space-y-1.5">
        <p>Click the <Eye className="w-3.5 h-3.5 inline" /> icon to show or hide accounts in the sidebar dropdown.</p>
        <p>Visible accounts count against your limit ({accountLimit} max) and their data is shown in the dashboard.</p>
      </div>
    </div>
  )
}
