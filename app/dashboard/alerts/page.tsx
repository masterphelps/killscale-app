'use client'

import { Bell, BellOff, Mail, AlertTriangle, TrendingDown, DollarSign } from 'lucide-react'
import { useState } from 'react'

type Alert = {
  id: string
  type: 'roas_drop' | 'spend_spike' | 'no_conversions'
  enabled: boolean
  threshold?: number
  email: boolean
}

const DEFAULT_ALERTS: Alert[] = [
  { id: '1', type: 'roas_drop', enabled: true, threshold: 20, email: true },
  { id: '2', type: 'spend_spike', enabled: false, threshold: 50, email: false },
  { id: '3', type: 'no_conversions', enabled: true, email: true },
]

const ALERT_CONFIG = {
  roas_drop: {
    icon: TrendingDown,
    title: 'ROAS Drop Alert',
    description: 'Get notified when ROAS drops significantly',
    thresholdLabel: 'Alert when ROAS drops more than',
    thresholdSuffix: '%',
  },
  spend_spike: {
    icon: DollarSign,
    title: 'Spend Spike Alert',
    description: 'Get notified when daily spend exceeds normal',
    thresholdLabel: 'Alert when spend increases more than',
    thresholdSuffix: '%',
  },
  no_conversions: {
    icon: AlertTriangle,
    title: 'No Conversions Alert',
    description: 'Get notified when an ad has spend but no conversions',
    thresholdLabel: null,
    thresholdSuffix: null,
  },
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(DEFAULT_ALERTS)

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    ))
  }

  const toggleEmail = (id: string) => {
    setAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, email: !a.email } : a
    ))
  }

  const updateThreshold = (id: string, value: number) => {
    setAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, threshold: value } : a
    ))
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Alerts</h1>
        <p className="text-zinc-500">Get notified when something needs your attention</p>
      </div>

      {/* Alert Cards */}
      <div className="space-y-4">
        {alerts.map(alert => {
          const config = ALERT_CONFIG[alert.type]
          const Icon = config.icon

          return (
            <div 
              key={alert.id}
              className={`bg-bg-card border rounded-xl p-5 transition-colors ${
                alert.enabled ? 'border-border' : 'border-border opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    alert.enabled ? 'bg-accent/10 text-accent' : 'bg-bg-dark text-zinc-600'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{config.title}</h3>
                    <p className="text-sm text-zinc-500">{config.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleAlert(alert.id)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    alert.enabled ? 'bg-accent' : 'bg-bg-dark border border-border'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    alert.enabled ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              {alert.enabled && (
                <div className="space-y-4 pt-4 border-t border-border">
                  {config.thresholdLabel && (
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">
                        {config.thresholdLabel}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={alert.threshold}
                          onChange={(e) => updateThreshold(alert.id, parseInt(e.target.value) || 0)}
                          className="w-24 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent"
                        />
                        <span className="text-zinc-500">{config.thresholdSuffix}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Mail className="w-4 h-4" />
                      Email notifications
                    </div>
                    <button
                      onClick={() => toggleEmail(alert.id)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        alert.email ? 'bg-verdict-scale' : 'bg-bg-dark border border-border'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        alert.email ? 'left-5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pro Feature Note */}
      <div className="mt-6 bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
        <Bell className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-accent">Pro Feature</p>
          <p className="text-sm text-zinc-400">
            Email alerts require a Pro subscription. Upgrade to get notified when your ads need attention.
          </p>
        </div>
      </div>
    </div>
  )
}
