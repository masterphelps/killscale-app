'use client'

import { useState } from 'react'
import { ShoppingBag, Unlink, Link2, CheckCircle, RefreshCw, Package, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShopifyConnectProps {
  userId: string
  workspaceId: string
  connection: {
    shop_domain: string
    shop_name?: string
    created_at: string
    last_sync_at?: string | null
    order_count?: number
  } | null
  onConnect: () => void
  onDisconnect: () => void
}

export function ShopifyConnect({ userId, workspaceId, connection, onConnect, onDisconnect }: ShopifyConnectProps) {
  const [shopDomain, setShopDomain] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const handleConnect = async () => {
    setError(null)

    if (!shopDomain.trim()) {
      setError('Please enter your shop domain')
      return
    }

    setIsSubmitting(true)

    // Normalize shop domain (remove .myshopify.com if present, we'll add it back)
    const normalizedDomain = shopDomain.trim().replace('.myshopify.com', '')

    // Redirect to Shopify OAuth flow
    window.location.href = `/api/auth/shopify?user_id=${userId}&workspace_id=${workspaceId}&shop=${normalizedDomain}`
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Shopify store? This will stop tracking conversions from your store.')) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/shopify/disconnect', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspaceId, userId }),
      })

      if (!response.ok) {
        throw new Error('Failed to disconnect')
      }

      onDisconnect()
    } catch (err) {
      console.error('Error disconnecting Shopify:', err)
      setError('Failed to disconnect. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setError(null)
    setSyncMessage(null)

    try {
      const response = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed')
      }

      setSyncMessage(`Synced ${data.count} orders`)
      onConnect() // Refresh connection data to get updated order count
    } catch (err) {
      console.error('Shopify sync error:', err)
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Collapsible Header - matches Meta/Google pattern */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-left">
            <div className="font-semibold">Shopify Store</div>
            <div className="text-sm text-zinc-500">
              {connection
                ? connection.shop_name || connection.shop_domain
                : 'Not connected'
              }
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <ChevronDown className={cn(
            'w-5 h-5 text-zinc-500 transition-transform',
            isExpanded && 'rotate-180'
          )} />
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-border p-4">
          {connection ? (
            // Connected State
            <div className="space-y-4">
              {/* Store Info */}
              <div className="p-3 rounded-lg bg-bg-dark border border-border">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-verdict-scale flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {connection.shop_name || connection.shop_domain}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {connection.shop_domain}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-zinc-500 mt-2 pl-8">
                  Connected on {formatDate(connection.created_at)}
                </div>
              </div>

              {/* Sync Status Section */}
              <div className="p-3 rounded-lg bg-bg-dark border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Package className="w-4 h-4" />
                    <span>Order Sync</span>
                  </div>
                  {connection.last_sync_at && (
                    <span className="text-xs text-zinc-500">
                      Last sync: {formatRelativeTime(connection.last_sync_at)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {connection.order_count !== undefined ? (
                      <span className="font-mono text-white">
                        {connection.order_count.toLocaleString()} orders
                      </span>
                    ) : (
                      <span className="text-zinc-500">No orders synced yet</span>
                    )}
                  </div>
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      'bg-green-500/20 text-green-400 hover:bg-green-500/30',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>

                {/* Sync success message */}
                {syncMessage && (
                  <div className="mt-2 text-xs text-verdict-scale">
                    ✓ {syncMessage}
                  </div>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 rounded-lg bg-verdict-kill/10 border border-verdict-kill/30 text-verdict-kill text-sm">
                  {error}
                </div>
              )}

              {/* Disconnect */}
              <div className="pt-3 border-t border-border">
                <button
                  onClick={handleDisconnect}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Unlink className="w-4 h-4" />
                  {isSubmitting ? 'Disconnecting...' : 'Disconnect Shopify Store'}
                </button>
              </div>
            </div>
          ) : (
            // Not Connected State
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Connect your Shopify store to track purchases and attribute them to your Meta and Google ads.
              </p>

              <div className="space-y-2">
                <label htmlFor="shop-domain" className="block text-sm font-medium">
                  Shop Domain
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      id="shop-domain"
                      type="text"
                      value={shopDomain}
                      onChange={(e) => setShopDomain(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleConnect()
                        }
                      }}
                      placeholder="mystore"
                      disabled={isSubmitting}
                      className={cn(
                        'w-full px-3 py-2 pr-32 bg-bg-dark border border-border rounded-lg',
                        'text-white placeholder:text-zinc-600',
                        'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-colors duration-150'
                      )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">
                      .myshopify.com
                    </div>
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={isSubmitting || !shopDomain.trim()}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                      'bg-green-600 hover:bg-green-700 text-white',
                      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600'
                    )}
                  >
                    <Link2 className="w-4 h-4" />
                    {isSubmitting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  Enter your store name only (e.g., "mystore" for mystore.myshopify.com)
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-verdict-kill/10 border border-verdict-kill/30 text-verdict-kill text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
