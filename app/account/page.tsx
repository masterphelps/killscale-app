'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { createClient } from '@supabase/supabase-js'
import { DeleteAccountModal } from '@/components/account/delete-account-modal'
import {
  User,
  CreditCard,
  Key,
  ArrowLeft,
  Settings,
  Bell,
  Shield,
  Trash2,
  BarChart3,
  ExternalLink,
  Check,
  Loader2
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
]

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CAD', label: 'CAD ($)' },
  { value: 'AUD', label: 'AUD ($)' },
]

const DATE_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
]

const LANDING_PAGES = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'trends', label: 'Trends' },
  { value: 'alerts', label: 'Alerts' },
]

type Profile = {
  full_name: string
  company: string
}

type Preferences = {
  timezone: string
  currency: string
  date_range_default: number
  default_landing_page: string
  email_digest_enabled: boolean
  alert_emails_enabled: boolean
  marketing_emails_enabled: boolean
}

type Usage = {
  campaignCount: number
  adAccountCount: number
}

const PLAN_LIMITS: Record<string, { campaigns: number | null; adAccounts: number | null }> = {
  Free: { campaigns: 2, adAccounts: 1 },
  Starter: { campaigns: 20, adAccounts: 1 },
  Pro: { campaigns: null, adAccounts: 5 },
  Agency: { campaigns: null, adAccounts: null },
}

export default function AccountPage() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { plan, subscription } = useSubscription()

  // Profile state
  const [profile, setProfile] = useState<Profile>({ full_name: '', company: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Preferences state
  const [preferences, setPreferences] = useState<Preferences>({
    timezone: 'UTC',
    currency: 'USD',
    date_range_default: 7,
    default_landing_page: 'dashboard',
    email_digest_enabled: true,
    alert_emails_enabled: true,
    marketing_emails_enabled: false,
  })
  const [preferencesLoading, setPreferencesLoading] = useState(false)
  const [preferencesSaved, setPreferencesSaved] = useState(false)

  // Password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Usage state
  const [usage, setUsage] = useState<Usage>({ campaignCount: 0, adAccountCount: 0 })

  // Billing state
  const [billingLoading, setBillingLoading] = useState(false)

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Initial data load
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadAccountData()
    }
  }, [user])

  const loadAccountData = async () => {
    if (!user) return

    try {
      // Fetch profile and preferences
      const response = await fetch(`/api/account/profile?userId=${user.id}`)
      if (response.ok) {
        const data = await response.json()
        setProfile({
          full_name: data.profile?.full_name || user.user_metadata?.full_name || '',
          company: data.profile?.company || '',
        })
        setPreferences({
          timezone: data.preferences?.timezone || 'UTC',
          currency: data.preferences?.currency || 'USD',
          date_range_default: data.preferences?.date_range_default || 7,
          default_landing_page: data.preferences?.default_landing_page || 'dashboard',
          email_digest_enabled: data.preferences?.email_digest_enabled ?? true,
          alert_emails_enabled: data.preferences?.alert_emails_enabled ?? true,
          marketing_emails_enabled: data.preferences?.marketing_emails_enabled ?? false,
        })
      }

      // Fetch usage stats
      const { data: metaConnection } = await supabase
        .from('meta_connections')
        .select('ad_accounts')
        .eq('user_id', user.id)
        .single()

      const adAccounts = metaConnection?.ad_accounts || []
      const activeAccounts = adAccounts.filter((a: any) => a.in_dashboard)

      // Get campaign count from selected account
      const { data: selectedAccount } = await supabase
        .from('meta_connections')
        .select('selected_account_id')
        .eq('user_id', user.id)
        .single()

      let campaignCount = 0
      if (selectedAccount?.selected_account_id) {
        const { count } = await supabase
          .from('ad_data')
          .select('campaign_name', { count: 'exact', head: true })
          .eq('ad_account_id', selectedAccount.selected_account_id)

        // Get distinct campaign count
        const { data: campaigns } = await supabase
          .from('ad_data')
          .select('campaign_name')
          .eq('ad_account_id', selectedAccount.selected_account_id)

        const uniqueCampaigns = new Set(campaigns?.map(c => c.campaign_name) || [])
        campaignCount = uniqueCampaigns.size
      }

      setUsage({
        campaignCount,
        adAccountCount: activeAccounts.length,
      })
    } catch (error) {
      console.error('Error loading account data:', error)
    } finally {
      setInitialLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return
    setProfileLoading(true)
    setProfileSaved(false)

    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, profile }),
      })

      if (response.ok) {
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 3000)
      }
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setProfileLoading(false)
    }
  }

  const handleSavePreferences = async () => {
    if (!user) return
    setPreferencesLoading(true)
    setPreferencesSaved(false)

    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, preferences }),
      })

      if (response.ok) {
        setPreferencesSaved(true)
        setTimeout(() => setPreferencesSaved(false), 3000)
      }
    } catch (error) {
      console.error('Error saving preferences:', error)
    } finally {
      setPreferencesLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }

    setPasswordLoading(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSuccess('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    }

    setPasswordLoading(false)
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

  const handleDeleteAccount = async (confirmEmail: string) => {
    if (!user) return
    setDeleteLoading(true)

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, confirmEmail }),
      })

      const data = await response.json()

      if (data.success) {
        await signOut()
        router.push('/')
      } else {
        alert(data.error || 'Failed to delete account')
      }
    } catch (error) {
      console.error('Error deleting account:', error)
      alert('Failed to delete account')
    } finally {
      setDeleteLoading(false)
    }
  }

  const planFeatures: Record<string, string> = {
    Free: 'CSV upload, 2 campaigns max',
    Starter: 'CSV upload, 20 campaigns, custom rules',
    Pro: '5 ad accounts, Meta API, pause/resume, alerts',
    Agency: 'Unlimited accounts, priority support',
  }

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.Free

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-dark">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <svg width="160" height="36" viewBox="0 0 280 50">
              <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a" />
              <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <text x="55" y="33" fill="white" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="24">KillScale</text>
            </svg>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <h1 className="text-3xl font-bold mb-8">Account Settings</h1>

        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            {/* Profile Section */}
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <User className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold">Profile</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Email</label>
                  <div className="px-4 py-3 bg-bg-dark border border-border rounded-lg text-zinc-400">
                    {user.email}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Company</label>
                  <input
                    type="text"
                    value={profile.company}
                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                    placeholder="Your company"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Timezone</label>
                  <select
                    value={preferences.timezone}
                    onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={profileLoading}
                  className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {profileLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : profileSaved ? (
                    <Check className="w-4 h-4" />
                  ) : null}
                  {profileSaved ? 'Saved' : 'Save Profile'}
                </button>
              </div>
            </div>

            {/* Subscription & Billing Section */}
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <CreditCard className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold">Subscription & Billing</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-bg-dark border border-border rounded-lg">
                  <div>
                    <div className="text-white font-medium">{plan} Plan</div>
                    <div className="text-sm text-zinc-500">
                      {planFeatures[plan] || 'Basic features'}
                    </div>
                  </div>
                  <Link
                    href="/pricing"
                    className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                  >
                    {plan === 'Free' ? 'Upgrade' : 'Change Plan'}
                  </Link>
                </div>

                {plan !== 'Free' && (
                  <button
                    onClick={handleOpenBillingPortal}
                    disabled={billingLoading}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-2"
                  >
                    {billingLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    Manage Billing & Invoices
                  </button>
                )}
              </div>
            </div>

            {/* Usage & Limits Section */}
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <BarChart3 className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold">Usage & Limits</h2>
              </div>

              <div className="space-y-4">
                {/* Campaigns usage */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-zinc-400">Campaigns</span>
                    <span className="text-sm text-white">
                      {usage.campaignCount} / {limits.campaigns ?? '∞'}
                    </span>
                  </div>
                  <div className="h-2 bg-bg-dark rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{
                        width: limits.campaigns
                          ? `${Math.min((usage.campaignCount / limits.campaigns) * 100, 100)}%`
                          : '10%'
                      }}
                    />
                  </div>
                </div>

                {/* Ad Accounts usage */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-zinc-400">Ad Accounts</span>
                    <span className="text-sm text-white">
                      {usage.adAccountCount} / {limits.adAccounts ?? '∞'}
                    </span>
                  </div>
                  <div className="h-2 bg-bg-dark rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{
                        width: limits.adAccounts
                          ? `${Math.min((usage.adAccountCount / limits.adAccounts) * 100, 100)}%`
                          : '10%'
                      }}
                    />
                  </div>
                </div>

                {(limits.campaigns && usage.campaignCount >= limits.campaigns) ||
                  (limits.adAccounts && usage.adAccountCount >= limits.adAccounts) ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
                    You're at your plan limit.{' '}
                    <Link href="/pricing" className="underline hover:no-underline">
                      Upgrade for more
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Preferences Section */}
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold">Preferences</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Default Date Range</label>
                  <select
                    value={preferences.date_range_default}
                    onChange={(e) => setPreferences({ ...preferences, date_range_default: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                  >
                    {DATE_RANGES.map((range) => (
                      <option key={range.value} value={range.value}>{range.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Currency Display</label>
                  <select
                    value={preferences.currency}
                    onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                  >
                    {CURRENCIES.map((curr) => (
                      <option key={curr.value} value={curr.value}>{curr.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-zinc-500 mb-1">Default Landing Page</label>
                  <select
                    value={preferences.default_landing_page}
                    onChange={(e) => setPreferences({ ...preferences, default_landing_page: e.target.value })}
                    className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                  >
                    {LANDING_PAGES.map((page) => (
                      <option key={page.value} value={page.value}>{page.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleSavePreferences}
                  disabled={preferencesLoading}
                  className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {preferencesLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : preferencesSaved ? (
                    <Check className="w-4 h-4" />
                  ) : null}
                  {preferencesSaved ? 'Saved' : 'Save Preferences'}
                </button>
              </div>
            </div>

            {/* Email & Notification Preferences Section */}
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Bell className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold">Email & Notifications</h2>
              </div>

              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-bg-dark border border-border rounded-lg cursor-pointer hover:border-zinc-500 transition-colors">
                  <div>
                    <div className="text-white">Email Digest</div>
                    <div className="text-sm text-zinc-500">Receive daily summary of your ad performance</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.email_digest_enabled}
                    onChange={(e) => setPreferences({ ...preferences, email_digest_enabled: e.target.checked })}
                    className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-bg-dark border border-border rounded-lg cursor-pointer hover:border-zinc-500 transition-colors">
                  <div>
                    <div className="text-white">Alert Notifications</div>
                    <div className="text-sm text-zinc-500">Get notified when alerts are triggered</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.alert_emails_enabled}
                    onChange={(e) => setPreferences({ ...preferences, alert_emails_enabled: e.target.checked })}
                    className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-bg-dark border border-border rounded-lg cursor-pointer hover:border-zinc-500 transition-colors">
                  <div>
                    <div className="text-white">Marketing Emails</div>
                    <div className="text-sm text-zinc-500">Receive tips, updates, and promotions</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.marketing_emails_enabled}
                    onChange={(e) => setPreferences({ ...preferences, marketing_emails_enabled: e.target.checked })}
                    className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
                  />
                </label>

                <button
                  onClick={handleSavePreferences}
                  disabled={preferencesLoading}
                  className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {preferencesLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : preferencesSaved ? (
                    <Check className="w-4 h-4" />
                  ) : null}
                  {preferencesSaved ? 'Saved' : 'Save Notification Settings'}
                </button>
              </div>
            </div>

            {/* Security Section */}
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold">Security</h2>
              </div>

              <div className="space-y-6">
                {/* Password Change */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Change Password
                  </h3>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                        placeholder="••••••••"
                        minLength={6}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                        placeholder="••••••••"
                        minLength={6}
                        required
                      />
                    </div>

                    {passwordError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                        {passwordSuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                    >
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Danger Zone - Delete Account */}
            <div className="bg-bg-card border border-red-500/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Trash2 className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
              </div>

              <p className="text-zinc-400 text-sm mb-4">
                Once you delete your account, there is no going back. All your data will be permanently removed.
              </p>

              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-6 py-2.5 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 font-medium rounded-lg transition-colors"
              >
                Delete Account
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        userEmail={user?.email || ''}
        isLoading={deleteLoading}
      />
    </div>
  )
}
