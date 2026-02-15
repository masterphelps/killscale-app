'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check, RotateCcw, Save } from 'lucide-react'
import { VerdictBadge } from '@/components/verdict-badge'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

const DEFAULT_RULES = {
  scale_roas: '3.0',
  min_roas: '1.5',
  learning_spend: '100',
  scale_percentage: '20',
  target_cpr: '',
  max_cpr: '',
}

interface GeneralPanelProps {
  workspaceId: string | null
}

export function GeneralPanel({ workspaceId }: GeneralPanelProps) {
  const { user } = useAuth()

  const [workspaceName, setWorkspaceName] = useState('')
  const [businessType, setBusinessType] = useState<'ecommerce' | 'leadgen'>('ecommerce')
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    load()
  }, [user, workspaceId])

  const load = async () => {
    if (!user) return
    setLoading(true)

    if (workspaceId) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('name, business_type')
        .eq('id', workspaceId)
        .single()

      if (ws) {
        setWorkspaceName(ws.name)
        setBusinessType(ws.business_type || 'ecommerce')
      }
    }

    // Load rules (use null ad_account_id for workspace-level rules)
    let query = supabase.from('rules').select('*').eq('user_id', user.id)
    query = query.is('ad_account_id', null)

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
    } else {
      setRules(DEFAULT_RULES)
    }

    setLoading(false)
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
    if (!user) return
    setSaving(true)
    setError('')

    if (parsedRules.scale_roas <= 0 || parsedRules.min_roas <= 0 || parsedRules.learning_spend <= 0) {
      setError('All values must be greater than 0')
      setSaving(false)
      return
    }

    if (parsedRules.scale_percentage < 5 || parsedRules.scale_percentage > 50) {
      setError('Scale percentage must be between 5% and 50%')
      setSaving(false)
      return
    }

    if (workspaceId && workspaceName.trim()) {
      await supabase
        .from('workspaces')
        .update({ name: workspaceName.trim(), business_type: businessType })
        .eq('id', workspaceId)
    }

    const { error: upsertError } = await supabase
      .from('rules')
      .upsert({
        user_id: user.id,
        ad_account_id: null,
        scale_roas: parsedRules.scale_roas,
        min_roas: parsedRules.min_roas,
        learning_spend: parsedRules.learning_spend,
        scale_percentage: parsedRules.scale_percentage,
        target_cpr: parsedRules.target_cpr,
        max_cpr: parsedRules.max_cpr,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,ad_account_id' })

    setSaving(false)
    if (upsertError) {
      setError(`Failed to save: ${upsertError.message}`)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handleReset = () => {
    setRules(DEFAULT_RULES)
    setSaved(false)
  }

  if (!workspaceId) {
    return (
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold mb-4">General</h2>
        <p className="text-sm text-zinc-500">Select a workspace to manage settings.</p>
      </div>
    )
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
      <h2 className="text-lg font-semibold mb-6">General</h2>

      <div className="space-y-5">
        {/* Workspace Name */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Workspace Name</label>
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white focus:outline-none focus:border-accent text-sm"
          />
        </div>

        {/* Business Type */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Business Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setBusinessType('ecommerce')}
              className={cn(
                'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                businessType === 'ecommerce'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-bg-dark text-zinc-400 border border-border hover:border-zinc-500'
              )}
            >
              E-commerce
            </button>
            <button
              onClick={() => setBusinessType('leadgen')}
              className={cn(
                'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                businessType === 'leadgen'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-bg-dark text-zinc-400 border border-border hover:border-zinc-500'
              )}
            >
              Lead Gen
            </button>
          </div>
        </div>

        {/* Verdict Thresholds */}
        <div className="border-t border-border pt-5">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Verdict Thresholds</h3>

          {/* Scale ROAS / Target CPR */}
          <div className="space-y-4">
            {businessType === 'ecommerce' ? (
              <>
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
                      onChange={(e) => setRules({ ...rules, scale_roas: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent text-sm"
                    />
                    <span className="text-zinc-500">x</span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Ads with ROAS at or above this get the <span className="text-verdict-scale font-medium">SCALE</span> verdict
                  </p>
                </div>

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
                      onChange={(e) => setRules({ ...rules, min_roas: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent text-sm"
                    />
                    <span className="text-zinc-500">x</span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Ads below this (after learning phase) get the <span className="text-verdict-kill font-medium">KILL</span> verdict
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <span className="text-verdict-scale">↑</span> Target Cost Per Result (Scale)
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500">$</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="e.g., 25"
                      value={rules.target_cpr}
                      onChange={(e) => setRules({ ...rules, target_cpr: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent text-sm placeholder:text-zinc-700"
                    />
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Lead-gen ads with CPR at or below this get the <span className="text-verdict-scale font-medium">SCALE</span> verdict
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    <span className="text-verdict-kill">↓</span> Maximum Cost Per Result (Kill)
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500">$</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="e.g., 50"
                      value={rules.max_cpr}
                      onChange={(e) => setRules({ ...rules, max_cpr: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent text-sm placeholder:text-zinc-700"
                    />
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    Lead-gen ads with CPR above this get the <span className="text-verdict-kill font-medium">KILL</span> verdict
                  </p>
                </div>
              </>
            )}

            {/* Learning Spend */}
            <div>
              <label className="block text-sm font-medium mb-2">
                <span className="text-verdict-learn">○</span> Learning Phase Spend
              </label>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500">$</span>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={rules.learning_spend}
                  onChange={(e) => setRules({ ...rules, learning_spend: e.target.value })}
                  className="flex-1 px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent text-sm"
                />
              </div>
              <p className="text-xs text-zinc-600 mt-1">
                Ads with spend below this get the <span className="text-verdict-learn font-medium">LEARNING</span> verdict (not enough data)
              </p>
            </div>

            {/* Scale Percentage */}
            <div className="border-t border-border pt-4">
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
                  onChange={(e) => setRules({ ...rules, scale_percentage: e.target.value })}
                  className="flex-1 px-3 py-2.5 bg-bg-card border border-border rounded-lg text-white font-mono focus:outline-none focus:border-accent text-sm"
                />
                <span className="text-zinc-500">%</span>
              </div>
              <p className="text-xs text-zinc-600 mt-1">
                How much to increase or decrease budgets with the quick buttons (5-50%)
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Rules'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Verdict Preview */}
        <div className="border-t border-border pt-5">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">How Verdicts Work</h3>
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-3">
            {businessType === 'ecommerce' ? (
              <>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <span className="text-sm">ROAS {'>'} = {parsedRules.scale_roas}x</span>
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
              </>
            ) : (
              <>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <span className="text-sm">CPR {'<'}= ${parsedRules.target_cpr || '?'}</span>
                    <p className="text-xs text-zinc-600">On target - increase budget</p>
                  </div>
                  <VerdictBadge verdict="scale" />
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <span className="text-sm">${parsedRules.target_cpr || '?'} {'<'} CPR {'<'}= ${parsedRules.max_cpr || '?'}</span>
                    <p className="text-xs text-zinc-600">Acceptable - monitor closely</p>
                  </div>
                  <VerdictBadge verdict="watch" />
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <span className="text-sm">CPR {'>'} ${parsedRules.max_cpr || '?'} (after ${parsedRules.learning_spend} spend)</span>
                    <p className="text-xs text-zinc-600">Too expensive - turn it off</p>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
