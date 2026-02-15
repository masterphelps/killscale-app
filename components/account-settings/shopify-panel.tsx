'use client'

import { useState, useEffect } from 'react'
import { ShoppingBag, Check, RefreshCw, Activity, AlertCircle, Info, Loader2, Unlink } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

type ShopifyConnection = {
  shop_domain: string
  shop_name?: string
  created_at: string
  last_sync_at?: string
  order_count?: number
}

type WebhookInfo = {
  id: string
  topic: string
  address: string
  created_at: string
}

type WebhookStatus = {
  active: boolean
  webhooks: WebhookInfo[]
  missing: string[]
}

interface ShopifyPanelProps {
  workspaceId: string | null
}

export function ShopifyPanel({ workspaceId }: ShopifyPanelProps) {
  const { user } = useAuth()

  const [shopifyConnection, setShopifyConnection] = useState<ShopifyConnection | null>(null)
  const [shopifyDomainInput, setShopifyDomainInput] = useState('')
  const [connectingShopify, setConnectingShopify] = useState(false)
  const [syncingShopify, setSyncingShopify] = useState(false)
  const [disconnectingShopify, setDisconnectingShopify] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [registeringWebhooks, setRegisteringWebhooks] = useState(false)
  const [businessType, setBusinessType] = useState<'ecommerce' | 'leadgen'>('ecommerce')
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

    // Load workspace business_type
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('business_type')
      .eq('id', workspaceId)
      .single()

    if (workspace?.business_type) {
      setBusinessType(workspace.business_type)
    }

    // Load Shopify connection
    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('shop_domain, shop_name, created_at, last_sync_at')
        .eq('workspace_id', workspaceId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Failed to load Shopify connection:', error)
        setShopifyConnection(null)
        setLoading(false)
        return
      }

      if (data) {
        // Get order count
        const { count } = await supabase
          .from('shopify_orders')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)

        setShopifyConnection({ ...data, order_count: count || 0 })

        // Load webhook status
        try {
          const webhookRes = await fetch(`/api/shopify/webhooks?workspaceId=${workspaceId}&userId=${user.id}`)
          if (webhookRes.ok) {
            const webhookData = await webhookRes.json()
            setWebhookStatus(webhookData)
          }
        } catch (webhookErr) {
          console.error('Failed to load webhook status:', webhookErr)
        }
      } else {
        setShopifyConnection(null)
      }
    } catch (err) {
      console.error('Failed to load Shopify connection:', err)
      setShopifyConnection(null)
    }

    setLoading(false)
  }

  const handleSync = async () => {
    if (!user || !workspaceId) return
    setSyncingShopify(true)
    try {
      const response = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id }),
      })
      if (response.ok) {
        await load()
      }
    } catch (err) {
      console.error('Shopify sync error:', err)
    } finally {
      setSyncingShopify(false)
    }
  }

  const handleRegisterWebhooks = async () => {
    if (!user || !workspaceId) return
    setRegisteringWebhooks(true)
    try {
      const response = await fetch('/api/shopify/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id }),
      })
      if (response.ok) {
        await load()
      }
    } catch (err) {
      console.error('Webhook registration error:', err)
    } finally {
      setRegisteringWebhooks(false)
    }
  }

  const handleDisconnect = async () => {
    if (!user || !workspaceId) return
    if (!confirm('Disconnect your Shopify store? This will stop tracking orders from this store.')) return

    setDisconnectingShopify(true)
    try {
      const response = await fetch('/api/shopify/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId: user.id }),
      })
      if (response.ok) {
        setShopifyConnection(null)
        setWebhookStatus(null)
      }
    } catch (err) {
      console.error('Shopify disconnect error:', err)
    } finally {
      setDisconnectingShopify(false)
    }
  }

  const handleConnect = () => {
    const shop = shopifyDomainInput.trim()
    if (!shop || !user || !workspaceId) return
    setConnectingShopify(true)
    const normalizedDomain = shop.replace('.myshopify.com', '')
    window.location.href = `/api/auth/shopify?user_id=${user.id}&workspace_id=${workspaceId}&shop=${normalizedDomain}`
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
        <h2 className="text-lg font-semibold mb-4">Shopify</h2>
        <p className="text-sm text-zinc-500">Select a workspace to manage Shopify settings.</p>
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
          <ShoppingBag className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold">Shopify Store</h2>
        </div>
        {shopifyConnection && (
          <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">Connected</span>
        )}
      </div>

      {shopifyConnection ? (
        <div className="space-y-4">
          {/* Store Info Box */}
          <div className="p-4 rounded-lg bg-bg-card border border-border">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-verdict-scale flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white">
                  {shopifyConnection.shop_name || shopifyConnection.shop_domain.replace('.myshopify.com', '')}
                </div>
                <div className="text-sm text-zinc-500">
                  {shopifyConnection.shop_domain}
                </div>
                <div className="text-xs text-zinc-600 mt-1">
                  Connected {new Date(shopifyConnection.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                {businessType === 'ecommerce' && (
                  <div className="text-xs text-green-400 mt-2 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Shopify is your revenue source
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Order Sync Box */}
          <div className="p-4 rounded-lg bg-bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-400">Order Sync</span>
              {shopifyConnection.last_sync_at && (
                <span className="text-xs text-zinc-500">
                  Last sync: {formatRelativeTime(shopifyConnection.last_sync_at)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-mono text-white">
                  {(shopifyConnection.order_count ?? 0).toLocaleString()}
                </span>
                <span className="text-sm text-zinc-500 ml-2">orders</span>
              </div>
              <button
                onClick={handleSync}
                disabled={syncingShopify}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', syncingShopify && 'animate-spin')} />
                {syncingShopify ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>

          {/* Webhook Status Box */}
          <div className="p-4 rounded-lg bg-bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-400">Real-time Webhooks</span>
              {webhookStatus && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  webhookStatus.active
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-amber-500/20 text-amber-400'
                )}>
                  {webhookStatus.active ? 'Active' : 'Setup Required'}
                </span>
              )}
            </div>
            {webhookStatus ? (
              <div className="space-y-2">
                {webhookStatus.active ? (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <Activity className="w-4 h-4" />
                    <span>{webhookStatus.webhooks.length} webhooks registered</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-amber-400 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>Missing: {webhookStatus.missing.join(', ')}</span>
                    </div>
                    <button
                      onClick={handleRegisterWebhooks}
                      disabled={registeringWebhooks}
                      className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {registeringWebhooks ? (
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
              onClick={handleDisconnect}
              disabled={disconnectingShopify}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <Unlink className="w-4 h-4" />
              {disconnectingShopify ? 'Disconnecting...' : 'Disconnect Shopify Store'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {businessType === 'leadgen' ? (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-400 font-medium mb-1">
                    Shopify integration is for e-commerce
                  </p>
                  <p className="text-xs text-amber-400/80">
                    Switch to E-commerce mode in General settings to use Shopify.
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
                        value={shopifyDomainInput}
                        onChange={(e) => setShopifyDomainInput(e.target.value)}
                        placeholder="mystore"
                        disabled={connectingShopify}
                        className="w-full px-3 py-2 pr-32 bg-bg-dark border border-border rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">
                        .myshopify.com
                      </div>
                    </div>
                    <button
                      onClick={handleConnect}
                      disabled={connectingShopify || !shopifyDomainInput.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      {connectingShopify ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Enter your store name (e.g., &quot;mystore&quot; for mystore.myshopify.com)
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
