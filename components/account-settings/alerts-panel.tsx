'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'

export function AlertsPanel() {
  const { user } = useAuth()

  const [emailDigest, setEmailDigest] = useState(true)
  const [alertEmails, setAlertEmails] = useState(true)
  const [marketingEmails, setMarketingEmails] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user) return

    const load = async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('email_digest_enabled, alert_emails_enabled, marketing_emails_enabled')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setEmailDigest(data.email_digest_enabled ?? true)
        setAlertEmails(data.alert_emails_enabled ?? true)
        setMarketingEmails(data.marketing_emails_enabled ?? false)
      }
      setLoading(false)
    }

    load()
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        email_digest_enabled: emailDigest,
        alert_emails_enabled: alertEmails,
        marketing_emails_enabled: marketingEmails,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  const toggles = [
    {
      label: 'Weekly Digest',
      description: 'Summary of your ad performance every Monday',
      value: emailDigest,
      onChange: setEmailDigest,
    },
    {
      label: 'Alert Notifications',
      description: 'Get notified when ads need attention',
      value: alertEmails,
      onChange: setAlertEmails,
    },
    {
      label: 'Product Updates',
      description: 'New features and improvements',
      value: marketingEmails,
      onChange: setMarketingEmails,
    },
  ]

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-6">Alerts</h2>

      <div className="space-y-2 mb-6">
        {toggles.map((toggle) => (
          <label
            key={toggle.label}
            className="flex items-center justify-between p-3 bg-bg-card border border-border rounded-lg cursor-pointer hover:bg-bg-hover transition-colors"
          >
            <div>
              <div className="text-sm font-medium">{toggle.label}</div>
              <div className="text-xs text-zinc-500">{toggle.description}</div>
            </div>
            <input
              type="checkbox"
              checked={toggle.value}
              onChange={(e) => toggle.onChange(e.target.checked)}
              className="w-5 h-5 rounded border-border bg-bg-dark text-accent focus:ring-accent focus:ring-offset-0"
            />
          </label>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
