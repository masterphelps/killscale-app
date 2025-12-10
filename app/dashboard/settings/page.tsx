'use client'

import { useState, useEffect } from 'react'
import { Save, RotateCcw, Loader2, AlertCircle } from 'lucide-react'
import { VerdictBadge } from '@/components/verdict-badge'
import { useAuth } from '@/lib/auth'
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
}

type AdAccount = {
  id: string
  name: string
}

export default function SettingsPage() {
  const { user } = useAuth()
  // Store as strings to allow proper editing (backspace, etc.)
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [currentAccount, setCurrentAccount] = useState<AdAccount | null>(null)

  // Load current account and rules on mount
  useEffect(() => {
    if (!user) return

    const loadAccountAndRules = async () => {
      // First, get the current selected account from meta_connections
      const { data: connection } = await supabase
        .from('meta_connections')
        .select('ad_accounts, selected_account_id')
        .eq('user_id', user.id)
        .single()

      let accountId: string | null = null
      let accountName: string | null = null

      if (connection?.selected_account_id && connection?.ad_accounts) {
        accountId = connection.selected_account_id
        const accounts = connection.ad_accounts as AdAccount[]
        const account = accounts.find(a => a.id === accountId)
        if (account) {
          accountId = account.id
          accountName = account.name
          setCurrentAccount({ id: account.id, name: account.name })
        }
      }

      // Load rules for this account (or user-level if no account)
      let query = supabase
        .from('rules')
        .select('*')
        .eq('user_id', user.id)

      if (accountId) {
        query = query.eq('ad_account_id', accountId)
      } else {
        query = query.is('ad_account_id', null)
      }

      const { data, error } = await query.single()

      console.log('Load result:', { data, error, accountId })

      if (data) {
        setRules({
          scale_roas: data.scale_roas?.toString() || DEFAULT_RULES.scale_roas,
          min_roas: data.min_roas?.toString() || DEFAULT_RULES.min_roas,
          learning_spend: data.learning_spend?.toString() || DEFAULT_RULES.learning_spend,
          scale_percentage: data.scale_percentage?.toString() || DEFAULT_RULES.scale_percentage,
        })
      }
      setLoading(false)
    }

    loadAccountAndRules()
  }, [user])

  // Listen for account changes from sidebar
  useEffect(() => {
    const handleAccountsUpdated = () => {
      // Reload when account changes
      if (user) {
        setLoading(true)
        window.location.reload() // Simple reload to get new account's rules
      }
    }
    window.addEventListener('meta-accounts-updated', handleAccountsUpdated)
    return () => window.removeEventListener('meta-accounts-updated', handleAccountsUpdated)
  }, [user])

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
  }

  const handleSave = async () => {
    if (!user) {
      console.log('No user found!')
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
      ad_account_id: currentAccount?.id || null,
      scale_roas: parsedRules.scale_roas,
      min_roas: parsedRules.min_roas,
      learning_spend: parsedRules.learning_spend,
      scale_percentage: parsedRules.scale_percentage,
      updated_at: new Date().toISOString(),
    }

    console.log('Saving rules:', payload)

    // Use user_id + ad_account_id as the conflict key
    const { data, error: upsertError } = await supabase
      .from('rules')
      .upsert(payload, {
        onConflict: 'user_id,ad_account_id'
      })
      .select()

    console.log('Save result:', { data, error: upsertError })

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
    setSaved(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Rules</h1>
        <p className="text-zinc-500">Configure how verdicts are calculated for your ads</p>
        {currentAccount ? (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg">
            <span className="text-xs text-zinc-400">Rules for:</span>
            <span className="text-sm font-medium text-accent">{currentAccount.name}</span>
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-amber-500">No account selected - rules will apply globally</span>
          </div>
        )}
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
