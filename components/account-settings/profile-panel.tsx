'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { DeleteAccountModal } from '@/components/account/delete-account-modal'
import { useRouter } from 'next/navigation'

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'JPY', label: 'JPY (¥)' },
]

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
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

export function ProfilePanel() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [currency, setCurrency] = useState('USD')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!user) return

    const load = async () => {
      const res = await fetch(`/api/account/profile?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setFullName(data.profile?.full_name || user.user_metadata?.full_name || '')
        setTimezone(data.preferences?.timezone || 'UTC')
        setCurrency(data.preferences?.currency || 'USD')
      }
      setLoading(false)
    }

    load()
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)

    const res = await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        profile: { full_name: fullName },
        preferences: { timezone, currency },
      }),
    })

    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }

    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSuccess('Password updated')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordLoading(false)
  }

  const handleDeleteAccount = async (confirmEmail: string) => {
    if (!user) return
    setDeleteLoading(true)

    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, confirmEmail }),
    })

    const data = await res.json()
    if (data.success) {
      await signOut()
      router.push('/')
    } else {
      alert(data.error || 'Failed to delete account')
    }
    setDeleteLoading(false)
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
      <h2 className="text-lg font-semibold mb-6">My Profile</h2>

      {/* Avatar + Name */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-accent to-purple-500 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0">
          {(fullName || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{fullName || 'User'}</div>
          <div className="text-sm text-zinc-500 truncate">{user?.email}</div>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white focus:outline-none focus:border-accent text-sm"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
          <div className="px-3 py-2.5 bg-bg-card border border-border rounded-lg text-zinc-500 text-sm">
            {user?.email}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white focus:outline-none focus:border-accent text-sm"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Display Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white focus:outline-none focus:border-accent text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-zinc-600 mt-1.5">Ad data is shown in your ad account's currency regardless of this setting</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
          {saved ? 'Saved' : 'Save Profile'}
        </button>
      </div>

      {/* Password */}
      <div className="border-t border-border pt-6 mb-8">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Change Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white focus:outline-none focus:border-accent text-sm"
            placeholder="New password"
            minLength={6}
            required
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white focus:outline-none focus:border-accent text-sm"
            placeholder="Confirm new password"
            minLength={6}
            required
          />

          {passwordError && (
            <p className="text-sm text-red-400">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-green-400">{passwordSuccess}</p>
          )}

          <button
            type="submit"
            disabled={passwordLoading}
            className="px-4 py-2 bg-bg-card border border-border hover:border-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Delete Account */}
      <div className="border-t border-red-500/20 pt-6">
        <h3 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Permanently delete your account and all data.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors"
        >
          Delete Account
        </button>
      </div>

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
