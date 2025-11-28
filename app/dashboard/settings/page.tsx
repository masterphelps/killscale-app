'use client'

import { useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { VerdictBadge } from '@/components/verdict-badge'

const DEFAULT_RULES = {
  scale_roas: 3.0,
  min_roas: 1.5,
  learning_spend: 100,
}

export default function SettingsPage() {
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [saved, setSaved] = useState(false)

  const handleChange = (field: keyof typeof rules, value: string) => {
    const numValue = parseFloat(value) || 0
    setRules(prev => ({ ...prev, [field]: numValue }))
    setSaved(false)
  }

  const handleSave = () => {
    // TODO: Save to Supabase
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setRules(DEFAULT_RULES)
    setSaved(false)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Rules</h1>
        <p className="text-zinc-500">Configure how verdicts are calculated for your ads</p>
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
            <span className="text-verdict-watch">●</span> Minimum ROAS Threshold
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
            Ads below this (after learning phase) get the <span className="text-verdict-cut font-medium">CUT</span> verdict
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
            Ads with spend below this get the <span className="text-verdict-learn font-medium">LEARN</span> verdict (not enough data)
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save Rules'}
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
              <span className="text-sm">ROAS ≥ {rules.scale_roas}x</span>
              <p className="text-xs text-zinc-600">Crushing it — increase budget</p>
            </div>
            <VerdictBadge verdict="scale" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">{rules.min_roas}x ≤ ROAS &lt; {rules.scale_roas}x</span>
              <p className="text-xs text-zinc-600">Acceptable — monitor closely</p>
            </div>
            <VerdictBadge verdict="watch" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <span className="text-sm">ROAS &lt; {rules.min_roas}x (after ${rules.learning_spend} spend)</span>
              <p className="text-xs text-zinc-600">Underperforming — consider pausing</p>
            </div>
            <VerdictBadge verdict="cut" />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm">Spend &lt; ${rules.learning_spend}</span>
              <p className="text-xs text-zinc-600">Still gathering data — let it run</p>
            </div>
            <VerdictBadge verdict="learn" />
          </div>
        </div>
      </div>
    </div>
  )
}
