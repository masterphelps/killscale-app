'use client'

import { useState, useEffect } from 'react'
import { Save, RotateCcw, Loader2, AlertCircle } from 'lucide-react'
import { VerdictBadge } from '@/components/verdict-badge'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { supabase } from '@/lib/supabase-browser'

const DEFAULT_RULES = {
  scale_roas: '3.0',
  min_roas: '1.5',
  learning_spend: '100',
  scale_percentage: '20',
  target_cpr: '',
  max_cpr: '',
}


export default function RulesPage() {
  const { user } = useAuth()
  const { currentAccountId, currentAccount: contextAccount } = useAccount()

  const [rules, setRules] = useState(DEFAULT_RULES)
  const [eventValues, setEventValues] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [lastLoadedAccountId, setLastLoadedAccountId] = useState<string | null>(null)

  // Load rules when account changes
  useEffect(() => {
    if (!user) return
    if (currentAccountId === lastLoadedAccountId) return

    const loadRules = async () => {
      setLastLoadedAccountId(currentAccountId)

      let query = supabase
        .from('rules')
        .select('*')
        .eq('user_id', user.id)

      if (currentAccountId) {
        query = query.eq('ad_account_id', currentAccountId)
      } else {
        query = query.is('ad_account_id', null)
      }

      const { data: rulesRows } = await query.limit(1)

      const data = rulesRows?.[0]
      if (data) {
        setRules({
          scale_roas: data.scale_roas?.toString() || DEFAULT_RULES.scale_roas,
          min_roas: data.min_roas?.toString() || DEFAULT_RULES.min_roas,
          learning_spend: data.learning_spend?.toString() || DEFAULT_RULES.learning_spend,
          scale_percentage: data.scale_percentage?.toString() || DEFAULT_RULES.scale_percentage,
          target_cpr: data.target_cpr?.toString() || '',
          max_cpr: data.max_cpr?.toString() || '',
        })
        setEventValues(data.event_values || {})
      } else {
        setRules(DEFAULT_RULES)
        setEventValues({})
      }
      setLoading(false)
    }

    loadRules()
  }, [user, currentAccountId, lastLoadedAccountId])

  const handleChange = (field: keyof typeof rules, value: string) => {
    setRules(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

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

    const { error: upsertError } = await supabase
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

  const handleReset = () => {
    setRules(DEFAULT_RULES)
    setEventValues({})
    setSaved(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!currentAccountId) {
    return (
      <div className="max-w-2xl mx-auto">
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
    <div className="max-w-2xl mx-auto">
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
            How much to increase or decrease budgets with the quick buttons (5-50%)
          </p>
        </div>

        {/* CPR Thresholds Section */}
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
              <span className="text-sm">ROAS {'>'}= {parsedRules.scale_roas}x</span>
              <p className="text-xs text-zinc-600">Crushing it - increase budget</p>
            </div>
            <VerdictBadge verdict="scale" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">{parsedRules.min_roas}x {'<'}= ROAS {'<'} {parsedRules.scale_roas}x</span>
              <p className="text-xs text-zinc-600">Acceptable - monitor closely</p>
            </div>
            <VerdictBadge verdict="watch" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">ROAS {'<'} {parsedRules.min_roas}x (after ${parsedRules.learning_spend} spend)</span>
              <p className="text-xs text-zinc-600">Underperforming - turn it off</p>
            </div>
            <VerdictBadge verdict="kill" />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm">Spend {'<'} ${parsedRules.learning_spend}</span>
              <p className="text-xs text-zinc-600">Still gathering data - let it run</p>
            </div>
            <VerdictBadge verdict="learn" />
          </div>
        </div>
      </div>
    </div>
  )
}
