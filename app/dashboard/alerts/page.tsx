'use client'

import { useState, useEffect } from 'react'
import { 
  Bell, 
  BellOff, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp,
  DollarSign,
  Pause,
  Play,
  Check,
  X,
  CheckCheck,
  Trash2,
  RefreshCw,
  Rocket,
  Settings,
  List
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { createClient } from '@supabase/supabase-js'
import { StatusChangeModal } from '@/components/confirm-modal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Alert = {
  id: string
  type: 'high_spend_no_conv' | 'roas_below_min' | 'roas_above_scale' | 'status_changed' | 'ad_fatigue'
  priority: 'high' | 'medium' | 'low'
  title: string
  message: string
  entity_type?: 'campaign' | 'adset' | 'ad'
  entity_id?: string
  entity_name?: string
  data?: Record<string, any>
  is_read: boolean
  is_dismissed: boolean
  action_taken?: string
  created_at: string
}

type AlertSetting = {
  alert_type: string
  enabled: boolean
  threshold: number | null
  email_enabled: boolean
}

const ALERT_ICONS: Record<string, any> = {
  high_spend_no_conv: AlertTriangle,
  roas_below_min: TrendingDown,
  roas_above_scale: Rocket,
  status_changed: Bell,
  ad_fatigue: TrendingDown,
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-l-red-500 bg-red-500/5',
  medium: 'border-l-amber-500 bg-amber-500/5',
  low: 'border-l-green-500 bg-green-500/5',
}

const PRIORITY_ICON_COLORS: Record<string, string> = {
  high: 'text-red-500 bg-red-500/10',
  medium: 'text-amber-500 bg-amber-500/10',
  low: 'text-green-500 bg-green-500/10',
}

const ALERT_TYPE_INFO: Record<string, { 
  title: string
  description: string
  icon: any
  thresholdLabel?: string
  thresholdSuffix?: string
  priority: 'high' | 'medium' | 'low'
}> = {
  high_spend_no_conv: {
    title: 'High Spend, No Conversions',
    description: 'Alert when spend exceeds threshold with zero purchases',
    icon: AlertTriangle,
    thresholdLabel: 'Minimum spend',
    thresholdSuffix: '$',
    priority: 'high',
  },
  roas_below_min: {
    title: 'ROAS Below Minimum',
    description: 'Alert when ROAS drops below your minimum threshold (set in Rules)',
    icon: TrendingDown,
    priority: 'medium',
  },
  roas_above_scale: {
    title: 'Scaling Opportunity',
    description: 'Alert when ROAS exceeds your scale threshold (set in Rules)',
    icon: Rocket,
    priority: 'low',
  },
  status_changed: {
    title: 'Status Changed',
    description: 'Alert when a campaign/ad is paused or activated externally',
    icon: Bell,
    priority: 'medium',
  },
  ad_fatigue: {
    title: 'Ad Fatigue Detection',
    description: 'Alert when CTR declines for consecutive days',
    icon: TrendingDown,
    thresholdLabel: 'Days of decline',
    thresholdSuffix: 'days',
    priority: 'medium',
  },
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<'alerts' | 'settings'>('alerts')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [settings, setSettings] = useState<Record<string, AlertSetting>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'high'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusModal, setStatusModal] = useState<{
    isOpen: boolean
    entityId: string
    entityType: 'campaign' | 'adset' | 'ad'
    entityName: string
    action: 'pause' | 'resume'
    alertId: string
  } | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const { user } = useAuth()
  const { plan } = useSubscription()

  const canManageAds = plan === 'Pro' || plan === 'Agency'

  const loadAlerts = async () => {
    if (!user) return
    
    try {
      const res = await fetch(`/api/alerts?userId=${user.id}`)
      const data = await res.json()
      
      if (data.alerts) {
        setAlerts(data.alerts)
      }
    } catch (err) {
      console.error('Failed to load alerts:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadSettings = async () => {
    if (!user) return
    
    try {
      const res = await fetch(`/api/alerts/settings?userId=${user.id}`)
      const data = await res.json()
      
      if (data.settings) {
        setSettings(data.settings)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setIsLoadingSettings(false)
    }
  }

  const updateSetting = async (alertType: string, updates: Partial<AlertSetting>) => {
    if (!user) return
    
    // Optimistic update
    setSettings(prev => ({
      ...prev,
      [alertType]: { ...prev[alertType], ...updates }
    }))
    
    try {
      await fetch('/api/alerts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          alertType,
          updates
        })
      })
    } catch (err) {
      console.error('Failed to update setting:', err)
      // Reload on error
      loadSettings()
    }
  }

  const refreshAlerts = async () => {
    if (!user) return
    
    setIsRefreshing(true)
    try {
      await fetch('/api/alerts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      })
      
      await loadAlerts()
    } catch (err) {
      console.error('Failed to refresh alerts:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (user) {
      loadAlerts()
      loadSettings()
    }
  }, [user])

  const markAsRead = async (alertId: string) => {
    if (!user) return
    
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          userId: user.id,
          updates: { is_read: true }
        })
      })
      
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, is_read: true } : a
      ))
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }

  const dismissAlert = async (alertId: string) => {
    if (!user) return
    
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          userId: user.id,
          updates: { is_dismissed: true }
        })
      })
      
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    } catch (err) {
      console.error('Failed to dismiss:', err)
    }
  }

  const markAllRead = async () => {
    if (!user) return
    
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'mark_all_read'
        })
      })
      
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
    } catch (err) {
      console.error('Failed to mark all read:', err)
    }
  }

  const dismissAll = async () => {
    if (!user) return
    
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'dismiss_all'
        })
      })
      
      setAlerts([])
    } catch (err) {
      console.error('Failed to dismiss all:', err)
    }
  }

  const handlePauseClick = (alert: Alert) => {
    if (!alert.entity_id || !alert.entity_type) return
    
    setStatusModal({
      isOpen: true,
      entityId: alert.entity_id,
      entityType: alert.entity_type,
      entityName: alert.entity_name || 'Unknown',
      action: 'pause',
      alertId: alert.id
    })
  }

  const handleStatusConfirm = async () => {
    if (!statusModal || !user) return
    
    setIsUpdatingStatus(true)
    try {
      const res = await fetch('/api/meta/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: statusModal.entityId,
          entityType: statusModal.entityType,
          status: 'PAUSED'
        })
      })
      
      if (res.ok) {
        await fetch('/api/alerts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertId: statusModal.alertId,
            userId: user.id,
            updates: { action_taken: 'paused', is_read: true }
          })
        })
        
        setAlerts(prev => prev.map(a => 
          a.id === statusModal.alertId 
            ? { ...a, is_read: true, action_taken: 'paused' } 
            : a
        ))
      }
    } catch (err) {
      console.error('Failed to pause:', err)
    } finally {
      setIsUpdatingStatus(false)
      setStatusModal(null)
    }
  }

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'unread') return !alert.is_read
    if (filter === 'high') return alert.priority === 'high'
    return true
  })

  const unreadCount = alerts.filter(a => !a.is_read).length
  const highPriorityCount = alerts.filter(a => a.priority === 'high' && !a.is_read).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Alerts</h1>
          <p className="text-zinc-500">
            {activeTab === 'alerts' ? (
              unreadCount > 0 
                ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}`
                : 'All caught up!'
            ) : (
              'Configure your alert preferences'
            )}
          </p>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-bg-card border border-border rounded-lg p-1">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'alerts'
                ? 'bg-accent text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
            Alerts
            {unreadCount > 0 && (
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-xs flex items-center justify-center ${
                activeTab === 'alerts' ? 'bg-white/20' : 'bg-red-500 text-white'
              }`}>
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-accent text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* ALERTS TAB */}
      {activeTab === 'alerts' && (
        <>
          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            {/* Filters */}
            <div className="flex gap-2">
              {[
                { key: 'all', label: 'All', count: alerts.length },
                { key: 'unread', label: 'Unread', count: unreadCount },
                { key: 'high', label: 'High Priority', count: highPriorityCount },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key as any)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === key
                      ? 'bg-accent text-white'
                      : 'bg-bg-card border border-border text-zinc-400 hover:text-white'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className={`ml-1.5 ${filter === key ? 'text-white/70' : 'text-zinc-500'}`}>
                      ({count})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={refreshAlerts}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm hover:border-zinc-500 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Scan</span>
              </button>
              
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm hover:border-zinc-500 transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Read all</span>
                </button>
              )}
              
              {alerts.length > 0 && (
                <button
                  onClick={dismissAll}
                  className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Alerts List */}
          {filteredAlerts.length === 0 ? (
            <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
              <BellOff className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No alerts</h3>
              <p className="text-zinc-500">
                {filter === 'all' 
                  ? "You're all caught up! Alerts will appear here when something needs your attention."
                  : filter === 'unread'
                    ? "No unread alerts. Nice work!"
                    : "No high priority alerts right now."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map(alert => {
                const Icon = ALERT_ICONS[alert.type] || Bell
                const priorityClass = PRIORITY_COLORS[alert.priority]
                const iconClass = PRIORITY_ICON_COLORS[alert.priority]
                
                return (
                  <div
                    key={alert.id}
                    className={`bg-bg-card border border-border rounded-xl p-4 border-l-4 transition-all ${priorityClass} ${
                      !alert.is_read ? 'ring-1 ring-accent/30' : 'opacity-80'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`font-medium ${!alert.is_read ? 'text-white' : 'text-zinc-300'}`}>
                            {alert.title}
                            {!alert.is_read && (
                              <span className="ml-2 inline-block w-2 h-2 bg-accent rounded-full" />
                            )}
                          </h3>
                          <span className="text-xs text-zinc-500 whitespace-nowrap">
                            {formatTimeAgo(alert.created_at)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-zinc-400 mb-3">
                          {alert.message}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          {canManageAds && 
                           alert.entity_id && 
                           (alert.type === 'high_spend_no_conv' || alert.type === 'roas_below_min') &&
                           !alert.action_taken && (
                            <button
                              onClick={() => handlePauseClick(alert)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              Pause Now
                            </button>
                          )}
                          
                          {alert.action_taken && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-sm">
                              <Check className="w-3.5 h-3.5" />
                              {alert.action_taken === 'paused' ? 'Paused' : alert.action_taken}
                            </span>
                          )}
                          
                          {!alert.is_read && (
                            <button
                              onClick={() => markAsRead(alert.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-dark border border-border text-zinc-400 rounded-lg text-sm hover:text-white hover:border-zinc-500 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Mark read
                            </button>
                          )}
                          
                          <button
                            onClick={() => dismissAlert(alert.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 rounded-lg text-sm hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          {Object.entries(ALERT_TYPE_INFO).map(([alertType, info]) => {
            const setting = settings[alertType]
            const Icon = info.icon
            const priorityColor = PRIORITY_ICON_COLORS[info.priority]
            
            return (
              <div
                key={alertType}
                className={`bg-bg-card border rounded-xl p-5 transition-colors ${
                  setting?.enabled ? 'border-border' : 'border-border opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      setting?.enabled ? priorityColor : 'bg-bg-dark text-zinc-600'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium">{info.title}</h3>
                      <p className="text-sm text-zinc-500">{info.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting(alertType, { enabled: !setting?.enabled })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      setting?.enabled ? 'bg-accent' : 'bg-bg-dark border border-border'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      setting?.enabled ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>

                {setting?.enabled && info.thresholdLabel && (
                  <div className="pt-4 border-t border-border">
                    <label className="text-sm text-zinc-400 mb-2 block">
                      {info.thresholdLabel}
                    </label>
                    <div className="flex items-center gap-2">
                      {info.thresholdSuffix === '$' && (
                        <span className="text-zinc-500">$</span>
                      )}
                      <input
                        type="number"
                        value={setting?.threshold || ''}
                        onChange={(e) => updateSetting(alertType, { 
                          threshold: e.target.value ? parseInt(e.target.value) : null 
                        })}
                        className="w-24 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent"
                        placeholder="50"
                      />
                      {info.thresholdSuffix !== '$' && (
                        <span className="text-zinc-500">{info.thresholdSuffix}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Info Note */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
            <Bell className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-accent">How alerts work</p>
              <p className="text-sm text-zinc-400">
                Alerts are generated automatically when you sync data. ROAS thresholds use the values from your Rules settings. 
                High priority alerts (red) indicate money being wasted. Low priority alerts (green) are scaling opportunities.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusModal && (
        <StatusChangeModal
          isOpen={statusModal.isOpen}
          onClose={() => setStatusModal(null)}
          onConfirm={handleStatusConfirm}
          entityType={statusModal.entityType}
          entityName={statusModal.entityName}
          action={statusModal.action}
          isLoading={isUpdatingStatus}
        />
      )}
    </div>
  )
}
