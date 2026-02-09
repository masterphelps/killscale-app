'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, User, CreditCard, Bell, Globe, ExternalLink, CheckCircle, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-browser'

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
]

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (\u20AC)' },
  { value: 'GBP', label: 'GBP (\u00A3)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'JPY', label: 'JPY (\u00A5)' },
]

type UserPreferences = {
  timezone: string
  currency: string
  email_digest_enabled: boolean
  alert_emails_enabled: boolean
  marketing_emails_enabled: boolean
}

export default function GeneralSettingsPage() {
  const { user } = useAuth()
  const { plan, subscription } = useSubscription()

  const [preferences, setPreferences] = useState<UserPreferences>({
    timezone: 'America/New_York',
    currency: 'USD',
    email_digest_enabled: true,
    alert_emails_enabled: true,
    marketing_emails_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [aiUsage, setAiUsage] = useState<{ used: number; planLimit: number; purchased: number; totalAvailable: number; remaining: number; status: string; history?: Array<{ generation_type: string; generation_label: string; credit_cost: number; created_at: string }> } | null>(null)
  const [showUsageLog, setShowUsageLog] = useState(false)

  // Load user preferences
  useEffect(() => {
    if (!user) return

    // Fetch AI credit usage
    fetch(`/api/ai/usage?userId=${user.id}&includeHistory=true`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAiUsage(data) })
      .catch(() => {})

    const loadPreferences = async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setPreferences({
          timezone: data.timezone || 'America/New_York',
          currency: data.currency || 'USD',
          email_digest_enabled: data.email_digest_enabled ?? true,
          alert_emails_enabled: data.alert_emails_enabled ?? true,
          marketing_emails_enabled: data.marketing_emails_enabled ?? false,
        })
      }
      setLoading(false)
    }

    loadPreferences()
  }, [user])

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleChange = (field: keyof UserPreferences, value: string | boolean) => {
    setPreferences(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleOpenBillingPortal = async () => {
    if (!user) return
    setBillingLoading(true)
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Unable to open billing portal')
      }
    } catch (error) {
      console.error('Error opening billing portal:', error)
      alert('Failed to open billing portal')
    } finally {
      setBillingLoading(false)
    }
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const userEmail = user?.email || ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">General</h1>
        <p className="text-zinc-500">Manage your account preferences and settings</p>
      </div>

      {/* Profile Section */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-zinc-400" />
          <h2 className="font-semibold">Profile</h2>
        </div>

        <div className="flex items-center gap-4 p-4 bg-bg-dark rounded-lg">
          <div className="w-12 h-12 bg-gradient-to-br from-accent to-purple-500 rounded-xl flex items-center justify-center text-lg font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-medium">{userName}</div>
            <div className="text-sm text-zinc-500">{userEmail}</div>
          </div>
          <Link
            href="/account"
            className="text-sm text-accent hover:text-accent-hover transition-colors"
          >
            Edit Profile
          </Link>
        </div>
      </div>

      {/* Plan Section */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-5 h-5 text-zinc-400" />
          <h2 className="font-semibold">Subscription</h2>
        </div>

        <div className="p-4 bg-bg-dark rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{plan} Plan</span>
                {subscription?.status === 'active' && (
                  <span className="px-2 py-0.5 bg-verdict-scale/20 text-verdict-scale text-xs rounded">
                    Active
                  </span>
                )}
                {subscription?.status === 'trialing' && (
                  <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded">
                    Trial
                  </span>
                )}
              </div>
              {subscription?.status === 'trialing' && subscription?.current_period_end ? (
                <div className="text-sm text-amber-400 mt-1">
                  Trial: {Math.max(0, Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining
                </div>
              ) : subscription?.current_period_end ? (
                <div className="text-sm text-zinc-500 mt-1">
                  Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {!subscription?.status || subscription?.status === 'canceled' || subscription?.status === 'expired' ? (
                <Link
                  href="/pricing"
                  className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg font-medium transition-colors"
                >
                  Subscribe
                </Link>
              ) : null}
              {(subscription?.status === 'active' || subscription?.status === 'trialing') && (
                <button
                  onClick={handleOpenBillingPortal}
                  disabled={billingLoading}
                  className="flex items-center gap-1 px-3 py-1.5 bg-bg-hover text-zinc-400 hover:text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {billingLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3 h-3" />
                  )}
                  Manage
                </button>
              )}
            </div>
          </div>

          {/* Plan Features */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                Unlimited campaigns
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                3 ad accounts
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                First Party Pixel
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle className="w-4 h-4 text-verdict-scale" />
                Workspaces
              </div>
            </div>
          </div>

          {/* AI Credits */}
          {aiUsage && aiUsage.totalAvailable > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-zinc-300">AI Credits</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowUsageLog(!showUsageLog)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {showUsageLog ? 'Hide Usage' : 'See Usage'}
                  </button>
                  <span className="text-xs text-zinc-500">
                    {aiUsage.status === 'trial' ? 'Trial total' : 'Resets monthly'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      aiUsage.remaining <= 0
                        ? 'bg-red-500'
                        : aiUsage.remaining <= aiUsage.totalAvailable * 0.2
                        ? 'bg-amber-500'
                        : 'bg-purple-500'
                    }`}
                    style={{ width: `${Math.min(100, (aiUsage.used / aiUsage.totalAvailable) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                  {aiUsage.used} / {aiUsage.totalAvailable}
                </span>
              </div>
              {aiUsage.purchased > 0 && (
                <p className="text-xs text-zinc-500 mt-1">
                  {aiUsage.planLimit} plan + {aiUsage.purchased} purchased
                </p>
              )}
              {aiUsage.remaining <= 0 && (
                <p className="text-xs text-red-400 mt-1.5">
                  Limit reached{aiUsage.status === 'active' ? ' — resets next month' : ''}
                </p>
              )}

              {/* Usage Log */}
              {showUsageLog && aiUsage.history && aiUsage.history.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto border border-border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-zinc-500">
                        <th className="text-left px-3 py-1.5">Date</th>
                        <th className="text-left px-3 py-1.5">Type</th>
                        <th className="text-right px-3 py-1.5">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiUsage.history.map((entry, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-1.5 text-zinc-500 tabular-nums">
                            {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-3 py-1.5 text-zinc-300">
                            {entry.generation_label || entry.generation_type || 'Image'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">
                            {entry.credit_cost || 5}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {showUsageLog && (!aiUsage.history || aiUsage.history.length === 0) && (
                <p className="text-xs text-zinc-500 mt-3">No usage yet this period.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preferences Section */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-5 h-5 text-zinc-400" />
          <h2 className="font-semibold">Preferences</h2>
        </div>

        <div className="space-y-4">
          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium mb-2">Timezone</label>
            <select
              value={preferences.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-600 mt-2">Used for displaying dates and scheduling reports</p>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium mb-2">Display Currency</label>
            <select
              value={preferences.currency}
              onChange={(e) => handleChange('currency', e.target.value)}
              className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {CURRENCIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-600 mt-2">Ad data is shown in your ad account's currency regardless of this setting</p>
          </div>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-zinc-400" />
          <h2 className="font-semibold">Email Notifications</h2>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-bg-dark rounded-lg cursor-pointer hover:bg-bg-hover transition-colors">
            <div>
              <div className="font-medium text-sm">Weekly Digest</div>
              <div className="text-xs text-zinc-500">Summary of your ad performance every Monday</div>
            </div>
            <input
              type="checkbox"
              checked={preferences.email_digest_enabled}
              onChange={(e) => handleChange('email_digest_enabled', e.target.checked)}
              className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-bg-dark rounded-lg cursor-pointer hover:bg-bg-hover transition-colors">
            <div>
              <div className="font-medium text-sm">Alert Notifications</div>
              <div className="text-xs text-zinc-500">Get notified when ads need attention</div>
            </div>
            <input
              type="checkbox"
              checked={preferences.alert_emails_enabled}
              onChange={(e) => handleChange('alert_emails_enabled', e.target.checked)}
              className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-bg-dark rounded-lg cursor-pointer hover:bg-bg-hover transition-colors">
            <div>
              <div className="font-medium text-sm">Product Updates</div>
              <div className="text-xs text-zinc-500">New features and improvements</div>
            </div>
            <input
              type="checkbox"
              checked={preferences.marketing_emails_enabled}
              onChange={(e) => handleChange('marketing_emails_enabled', e.target.checked)}
              className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
            />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
