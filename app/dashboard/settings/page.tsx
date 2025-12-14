'use client'

import { useState, useEffect } from 'react'
import { Save, RotateCcw, Loader2, AlertCircle, Plus, X, Copy, Check, ExternalLink } from 'lucide-react'
import { VerdictBadge } from '@/components/verdict-badge'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_RULES = {
  scale_roas: '3.0',
  min_roas: '1.5',
  learning_spend: '100',
  scale_percentage: '20',
  // CPR thresholds for non-revenue campaigns (leads, registrations, etc.)
  target_cpr: '',
  max_cpr: '',
}

// All standard Meta conversion events (matches pixel-events API)
const STANDARD_EVENTS = [
  { key: 'purchase', label: 'Purchase' },
  { key: 'lead', label: 'Lead' },
  { key: 'complete_registration', label: 'Complete Registration' },
  { key: 'add_to_cart', label: 'Add to Cart' },
  { key: 'initiate_checkout', label: 'Initiate Checkout' },
  { key: 'add_payment_info', label: 'Add Payment Info' },
  { key: 'subscribe', label: 'Subscribe' },
  { key: 'contact', label: 'Contact' },
  { key: 'submit_application', label: 'Submit Application' },
  { key: 'start_trial', label: 'Start Trial' },
  { key: 'schedule', label: 'Schedule' },
]

type EventValues = Record<string, number>

type AdAccount = {
  id: string
  name: string
}

type PixelData = {
  pixel_id: string
  attribution_source: 'meta' | 'killscale'
  attribution_window: number
}

type PixelStatus = {
  is_active: boolean
  last_event_at: string | null
  events_today: number
  events_total: number
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { currentAccountId, currentAccount: contextAccount } = useAccount()

  // Store as strings to allow proper editing (backspace, etc.)
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [eventValues, setEventValues] = useState<EventValues>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Track last loaded account to detect changes
  const [lastLoadedAccountId, setLastLoadedAccountId] = useState<string | null>(null)

  // Pixel state
  const [pixelData, setPixelData] = useState<PixelData | null>(null)
  const [pixelStatus, setPixelStatus] = useState<PixelStatus | null>(null)
  const [pixelCopied, setPixelCopied] = useState(false)
  const [savingPixel, setSavingPixel] = useState(false)

  // Load rules when account changes
  useEffect(() => {
    if (!user) return
    if (currentAccountId === lastLoadedAccountId) return

    const loadRules = async () => {
      setLastLoadedAccountId(currentAccountId)

      // Load rules for this account (or user-level if no account)
      let query = supabase
        .from('rules')
        .select('*')
        .eq('user_id', user.id)

      if (currentAccountId) {
        query = query.eq('ad_account_id', currentAccountId)
      } else {
        query = query.is('ad_account_id', null)
      }

      const { data, error } = await query.single()

      if (data) {
        setRules({
          scale_roas: data.scale_roas?.toString() || DEFAULT_RULES.scale_roas,
          min_roas: data.min_roas?.toString() || DEFAULT_RULES.min_roas,
          learning_spend: data.learning_spend?.toString() || DEFAULT_RULES.learning_spend,
          scale_percentage: data.scale_percentage?.toString() || DEFAULT_RULES.scale_percentage,
          target_cpr: data.target_cpr?.toString() || '',
          max_cpr: data.max_cpr?.toString() || '',
        })
        // Load event values
        setEventValues(data.event_values || {})
      } else {
        // Reset to defaults when no rules found
        setEventValues({})
      }
      setLoading(false)
    }

    loadRules()
  }, [user, currentAccountId, lastLoadedAccountId])

  // Load pixel data when account changes
  useEffect(() => {
    if (!currentAccountId || !user) {
      setPixelData(null)
      setPixelStatus(null)
      return
    }

    const loadPixelData = async () => {
      // Load pixel config by meta_account_id
      let { data: pixel } = await supabase
        .from('pixels')
        .select('pixel_id, attribution_source, attribution_window')
        .eq('meta_account_id', currentAccountId)
        .eq('user_id', user.id)
        .single()

      // If no pixel exists, create one
      if (!pixel) {
        const { data: newPixel, error: createError } = await supabase
          .from('pixels')
          .insert({
            user_id: user.id,
            meta_account_id: currentAccountId,
            pixel_id: `KS-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            pixel_secret: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
            attribution_source: 'meta',
            attribution_window: 7,
          })
          .select('pixel_id, attribution_source, attribution_window')
          .single()

        if (!createError && newPixel) {
          pixel = newPixel
        }
      }

      if (pixel) {
        setPixelData(pixel)

        // Load pixel status
        const { data: status } = await supabase
          .from('pixel_status')
          .select('is_active, last_event_at, events_today, events_total')
          .eq('pixel_id', pixel.pixel_id)
          .single()

        setPixelStatus(status || null)
      }
    }

    loadPixelData()
  }, [currentAccountId, user])

  const handleChange = (field: keyof typeof rules, value: string) => {
    setRules(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  // Parse rules to numbers for saving and display
  const parsedRules = {
    scale_roas: parseFloat(rules.scale_roas) || 0,
    min_roas: parseFloat(rules.min_roas) || 0,
    learning_spend: parseFloat(rules.learning_spend) || 0,
    scale_percentage: parseFloat(rules.scale_percentage) || 20,
    target_cpr: rules.target_cpr ? parseFloat(rules.target_cpr) : null,
    max_cpr: rules.max_cpr ? parseFloat(rules.max_cpr) : null,
  }

  const handleSave = async () => {
    if (!user) {
      setError('Not logged in')
      return
    }

    // Validate that we have valid numbers
    if (parsedRules.scale_roas <= 0 || parsedRules.min_roas <= 0 || parsedRules.learning_spend <= 0) {
      setError('All values must be greater than 0')
      return
    }
    if (parsedRules.scale_percentage < 5 || parsedRules.scale_percentage > 50) {
      setError('Scale percentage must be between 5% and 50%')
      return
    }

    setSaving(true)
    setError('')

    const payload: Record<string, any> = {
      user_id: user.id,
      ad_account_id: currentAccountId || null,
      scale_roas: parsedRules.scale_roas,
      min_roas: parsedRules.min_roas,
      learning_spend: parsedRules.learning_spend,
      scale_percentage: parsedRules.scale_percentage,
      target_cpr: parsedRules.target_cpr,
      max_cpr: parsedRules.max_cpr,
      event_values: eventValues,
      updated_at: new Date().toISOString(),
    }

    // Use user_id + ad_account_id as the conflict key
    const { data, error: upsertError } = await supabase
      .from('rules')
      .upsert(payload, {
        onConflict: 'user_id,ad_account_id'
      })
      .select()

    setSaving(false)
    
    if (!upsertError) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      console.error('Error saving rules:', upsertError)
      setError(`Failed to save: ${upsertError.message}`)
    }
  }

  const handleReset = async () => {
    setRules(DEFAULT_RULES)
    setEventValues({})
    setSaved(false)
  }

  // Event values handlers
  const handleEventValueChange = (eventType: string, value: string) => {
    setSaved(false)
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0) {
      setEventValues(prev => ({ ...prev, [eventType]: numValue }))
    }
  }

  const handleRemoveEventValue = (eventType: string) => {
    setSaved(false)
    setEventValues(prev => {
      const next = { ...prev }
      delete next[eventType]
      return next
    })
  }

  const handleAddEventValue = (eventType: string) => {
    setSaved(false)
    setEventValues(prev => ({ ...prev, [eventType]: 0 }))
  }

  // Get events that haven't been added yet
  const availableEvents = STANDARD_EVENTS.filter(e => !(e.key in eventValues))

  // Get configured events for display
  const configuredEvents = Object.entries(eventValues).map(([key, value]) => {
    const event = STANDARD_EVENTS.find(e => e.key === key)
    return { key, label: event?.label || key, value }
  })

  // Pixel helpers
  const getPixelSnippet = (pixelId: string) => `<!-- KillScale Pixel -->
<script>
!function(k,s,p,i,x,e,l){if(k.ks)return;x=k.ks=function(){x.q.push(arguments)};
x.q=[];e=s.createElement(p);l=s.getElementsByTagName(p)[0];
e.async=1;e.src='https://pixel.killscale.com/ks.js';l.parentNode.insertBefore(e,l)
}(window,document,'script');

ks('init', '${pixelId}');
ks('pageview');
</script>
<!-- End KillScale Pixel -->`

  const copyPixelSnippet = async () => {
    if (!pixelData) return
    await navigator.clipboard.writeText(getPixelSnippet(pixelData.pixel_id))
    setPixelCopied(true)
    setTimeout(() => setPixelCopied(false), 2000)
  }

  const handlePixelSettingChange = async (field: string, value: string | number) => {
    if (!pixelData || !currentAccountId || !user) return
    setSavingPixel(true)

    const { error } = await supabase
      .from('pixels')
      .update({ [field]: value })
      .eq('meta_account_id', currentAccountId)
      .eq('user_id', user.id)

    if (!error) {
      setPixelData(prev => prev ? { ...prev, [field]: value } : null)
    }
    setSavingPixel(false)
  }

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    return `${diffDays} days ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  // Require an account to be selected
  if (!currentAccountId) {
    return (
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Rules</h1>
          <p className="text-zinc-500">Configure how verdicts are calculated for your ads</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <h2 className="text-lg font-medium mb-2">No Account Selected</h2>
          <p className="text-zinc-500 mb-4">
            Select an ad account from the sidebar to configure rules.
          </p>
          <p className="text-xs text-zinc-600">
            Rules are configured per ad account. Each account can have its own ROAS thresholds, learning spend, and CPR settings.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Rules</h1>
        <p className="text-zinc-500">Configure how verdicts are calculated for your ads</p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg">
          <span className="text-xs text-zinc-400">Rules for:</span>
          <span className="text-sm font-medium text-accent">{contextAccount?.name}</span>
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Scale ROAS */}
        <div>
          <label className="block text-sm font-medium mb-2">
            <span className="text-verdict-scale">↑</span> Scale ROAS Threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.1"
              min="0"
              value={rules.scale_roas}
              onChange={(e) => handleChange('scale_roas', e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white font-mono text-lg focus:outline-none focus:border-accent"
            />
            <span className="text-zinc-500 text-lg">x</span>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Ads with ROAS at or above this get the <span className="text-verdict-scale font-medium">SCALE</span> verdict
          </p>
        </div>

        {/* Min ROAS */}
        <div>
          <label className="block text-sm font-medium mb-2">
            <span className="text-verdict-watch">↔</span> Minimum ROAS Threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.1"
              min="0"
              value={rules.min_roas}
              onChange={(e) => handleChange('min_roas', e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white font-mono text-lg focus:outline-none focus:border-accent"
            />
            <span className="text-zinc-500 text-lg">x</span>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Ads below this (after learning phase) get the <span className="text-verdict-kill font-medium">KILL</span> verdict
          </p>
        </div>

        {/* Learning Spend */}
        <div>
          <label className="block text-sm font-medium mb-2">
            <span className="text-verdict-learn">○</span> Learning Phase Spend
          </label>
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-lg">$</span>
            <input
              type="number"
              step="10"
              min="0"
              value={rules.learning_spend}
              onChange={(e) => handleChange('learning_spend', e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white font-mono text-lg focus:outline-none focus:border-accent"
            />
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Ads with spend below this get the <span className="text-verdict-learn font-medium">LEARNING</span> verdict (not enough data)
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Budget Scaling</h3>
        </div>

        {/* Scale Percentage */}
        <div>
          <label className="block text-sm font-medium mb-2">
            <span className="text-accent">↑↓</span> Quick Scale Percentage
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="5"
              min="5"
              max="50"
              value={rules.scale_percentage}
              onChange={(e) => handleChange('scale_percentage', e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white font-mono text-lg focus:outline-none focus:border-accent"
            />
            <span className="text-zinc-500 text-lg">%</span>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            How much to increase or decrease budgets with the quick ↑/↓ buttons (5-50%)
          </p>
        </div>

        {/* Divider - KillScale Pixel */}
        {pixelData && (
          <>
            <div className="border-t border-border pt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-zinc-400">KillScale Pixel</h3>
                {/* Status indicator */}
                {pixelStatus?.is_active ? (
                  <div className="flex items-center gap-1.5 text-xs text-verdict-scale">
                    <div className="w-1.5 h-1.5 rounded-full bg-verdict-scale animate-pulse" />
                    Active
                  </div>
                ) : pixelStatus?.last_event_at ? (
                  <div className="flex items-center gap-1.5 text-xs text-yellow-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    Inactive
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                    Not Installed
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-600 mb-4">
                First-party conversion tracking. Choose which data source to use for verdicts.
              </p>
            </div>

            {/* Attribution Source Toggle */}
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handlePixelSettingChange('attribution_source', 'meta')}
                  disabled={savingPixel}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    pixelData.attribution_source === 'meta'
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-zinc-600'
                  }`}
                >
                  <div className="font-medium text-sm">Meta Pixel</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Use Meta's reported conversions</div>
                </button>
                <button
                  onClick={() => handlePixelSettingChange('attribution_source', 'killscale')}
                  disabled={savingPixel || !pixelStatus?.is_active}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    pixelData.attribution_source === 'killscale'
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-zinc-600'
                  } ${!pixelStatus?.is_active ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium text-sm">KillScale Pixel</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {pixelStatus?.is_active ? 'Use first-party tracking' : 'Install pixel first'}
                  </div>
                </button>
              </div>
            </div>

            {/* Pixel Code (collapsible-style) */}
            <details className="mb-6 group">
              <summary className="flex items-center justify-between cursor-pointer text-sm text-zinc-400 hover:text-white transition-colors">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs">{pixelData.pixel_id}</span>
                  <span className="text-xs">— View install code</span>
                </span>
                <span className="text-xs group-open:hidden">▸</span>
                <span className="text-xs hidden group-open:inline">▾</span>
              </summary>
              <div className="mt-3 space-y-3">
                <div className="relative">
                  <pre className="p-3 bg-bg-dark rounded-lg text-xs text-zinc-400 overflow-x-auto font-mono">
                    {getPixelSnippet(pixelData.pixel_id)}
                  </pre>
                  <button
                    onClick={copyPixelSnippet}
                    className="absolute top-2 right-2 p-1.5 bg-bg-hover hover:bg-zinc-700 rounded transition-colors"
                  >
                    {pixelCopied ? (
                      <Check className="w-3.5 h-3.5 text-verdict-scale" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-zinc-600">
                  Add to your site's <code className="text-zinc-400">&lt;head&gt;</code>.
                  For purchases: <code className="text-zinc-400">ks('purchase', {'{'} value: 99 {'}'})</code>
                </p>
              </div>
            </details>
          </>
        )}

        {/* Divider - Event Values */}
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Event Values</h3>
          <p className="text-xs text-zinc-600 mb-4">
            Assign dollar values to conversion events. When your campaigns generate results (leads, registrations, etc.), ROAS will be calculated using these values.
          </p>
        </div>

        {/* Configured Event Values */}
        <div className="space-y-3">
          {configuredEvents.map(({ key, label, value }) => (
            <div key={key} className="flex items-center gap-3 bg-bg-hover rounded-lg p-3">
              <div className="flex-1">
                <span className="text-sm font-medium text-white">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">$</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={value}
                  onChange={(e) => handleEventValueChange(key, e.target.value)}
                  className="w-24 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white font-mono text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={() => handleRemoveEventValue(key)}
                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {configuredEvents.length === 0 && (
            <div className="text-sm text-zinc-500 py-2">
              No event values configured. Add events below to track their value.
            </div>
          )}
        </div>

        {/* Add Event Dropdown */}
        {availableEvents.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <select
                id="add-event-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddEventValue(e.target.value)
                    e.target.value = ''
                  }
                }}
                className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer"
              >
                <option value="" disabled>Select an event to add...</option>
                {availableEvents.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <div className="p-2 text-accent">
                <Plus className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-600 mt-4">
          ROAS = (Results × Event Value) / Spend. For example: 10 leads × $29 value = $290 revenue.
        </p>

        {/* Divider - CPR Thresholds */}
        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Cost Per Result Thresholds</h3>
          <p className="text-xs text-zinc-600 mb-4">
            Set CPR thresholds to judge lead-gen campaigns by cost instead of ROAS. Optional - leave blank to use event values above.
          </p>
        </div>

        {/* Target CPR */}
        <div>
          <label className="block text-sm font-medium mb-2">
            <span className="text-verdict-scale">↑</span> Target Cost Per Result (Scale)
          </label>
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-lg">$</span>
            <input
              type="number"
              step="1"
              min="0"
              placeholder="e.g., 25"
              value={rules.target_cpr}
              onChange={(e) => handleChange('target_cpr', e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white font-mono text-lg focus:outline-none focus:border-accent placeholder:text-zinc-700"
            />
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Lead-gen ads with CPR at or below this get the <span className="text-verdict-scale font-medium">SCALE</span> verdict
          </p>
        </div>

        {/* Max CPR */}
        <div>
          <label className="block text-sm font-medium mb-2">
            <span className="text-verdict-kill">↓</span> Maximum Cost Per Result (Kill)
          </label>
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-lg">$</span>
            <input
              type="number"
              step="1"
              min="0"
              placeholder="e.g., 50"
              value={rules.max_cpr}
              onChange={(e) => handleChange('max_cpr', e.target.value)}
              className="flex-1 px-4 py-3 bg-bg-dark border border-border rounded-lg text-white font-mono text-lg focus:outline-none focus:border-accent placeholder:text-zinc-700"
            />
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Lead-gen ads with CPR above this get the <span className="text-verdict-kill font-medium">KILL</span> verdict
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-border">
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
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Rules'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-bg-dark border border-border hover:border-border-light text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Verdict Preview */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mt-6">
        <h2 className="font-semibold mb-4">How Verdicts Work</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">ROAS ≥ {parsedRules.scale_roas}x</span>
              <p className="text-xs text-zinc-600">Crushing it — increase budget</p>
            </div>
            <VerdictBadge verdict="scale" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">{parsedRules.min_roas}x ≤ ROAS &lt; {parsedRules.scale_roas}x</span>
              <p className="text-xs text-zinc-600">Acceptable — monitor closely</p>
            </div>
            <VerdictBadge verdict="watch" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">ROAS &lt; {parsedRules.min_roas}x (after ${parsedRules.learning_spend} spend)</span>
              <p className="text-xs text-zinc-600">Underperforming — turn it off</p>
            </div>
            <VerdictBadge verdict="kill" />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm">Spend &lt; ${parsedRules.learning_spend}</span>
              <p className="text-xs text-zinc-600">Still gathering data — let it run</p>
            </div>
            <VerdictBadge verdict="learn" />
          </div>
        </div>
      </div>
    </div>
  )
}
