'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, Sparkles, DollarSign, MousePointerClick, Eye, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OwnAd } from './types'

interface OwnAdModalProps {
  ad: OwnAd
  onClose: () => void
  onUseThisAd: (ad: OwnAd) => void
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-600'
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 25) return 'text-orange-400'
  return 'text-red-400'
}

function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-zinc-800'
  if (score >= 75) return 'bg-emerald-500/10 border-emerald-500/20'
  if (score >= 50) return 'bg-amber-500/10 border-amber-500/20'
  if (score >= 25) return 'bg-orange-500/10 border-orange-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(2)}`
}

export function OwnAdModal({ ad, onClose, onUseThisAd }: OwnAdModalProps) {
  const [copiedBody, setCopiedBody] = useState(false)
  const [copiedHeadline, setCopiedHeadline] = useState(false)

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const copyToClipboard = (text: string, type: 'body' | 'headline') => {
    navigator.clipboard.writeText(text)
    if (type === 'body') {
      setCopiedBody(true)
      setTimeout(() => setCopiedBody(false), 2000)
    } else {
      setCopiedHeadline(true)
      setTimeout(() => setCopiedHeadline(false), 2000)
    }
  }

  const mediaUrl = ad.storageUrl || ad.imageUrl || ad.thumbnailUrl

  const scores = [
    { label: 'Hook', key: 'hookScore' as const, icon: Eye, value: ad.hookScore },
    { label: 'Hold', key: 'holdScore' as const, icon: TrendingUp, value: ad.holdScore },
    { label: 'Click', key: 'clickScore' as const, icon: MousePointerClick, value: ad.clickScore },
    { label: 'Convert', key: 'convertScore' as const, icon: DollarSign, value: ad.convertScore },
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-bg-card border border-border rounded-2xl overflow-hidden flex flex-col lg:flex-row"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Left: Media */}
          <div className="lg:w-1/2 bg-black flex items-center justify-center min-h-[300px] lg:min-h-full relative">
            {mediaUrl ? (
              <img
                src={mediaUrl}
                alt={ad.ad_name}
                className="max-w-full max-h-[50vh] lg:max-h-[80vh] object-contain"
              />
            ) : (
              <div className="flex items-center justify-center text-zinc-500">
                <Eye className="w-12 h-12" />
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="lg:w-1/2 flex flex-col max-h-[50vh] lg:max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4 flex-1">
              {/* Header */}
              <div>
                <h2 className="font-semibold text-white text-lg">{ad.ad_name}</h2>
                <div className="text-sm text-zinc-400 mt-1">{ad.campaign_name}</div>
                <div className="text-xs text-zinc-500">{ad.adset_name}</div>
              </div>

              {/* Score Cards */}
              <div className="grid grid-cols-2 gap-3">
                {scores.map(({ label, icon: Icon, value }) => (
                  <div
                    key={label}
                    className={cn(
                      'rounded-xl p-3 border',
                      getScoreBg(value)
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={cn('w-4 h-4', getScoreColor(value))} />
                      <span className="text-xs text-zinc-400">{label}</span>
                    </div>
                    <div className={cn('text-2xl font-bold', getScoreColor(value))}>
                      {value !== null ? value : '\u2014'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-bg-dark rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Spend</div>
                  <div className="text-sm font-semibold text-white">{formatCurrency(ad.spend)}</div>
                </div>
                <div className="bg-bg-dark rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Revenue</div>
                  <div className="text-sm font-semibold text-white">{formatCurrency(ad.revenue)}</div>
                </div>
                <div className="bg-bg-dark rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">ROAS</div>
                  <div className={cn(
                    'text-sm font-semibold',
                    ad.roas >= 3 ? 'text-emerald-400' : ad.roas >= 1.5 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {ad.roas > 0 ? `${ad.roas.toFixed(2)}x` : '\u2014'}
                  </div>
                </div>
                <div className="bg-bg-dark rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">CTR</div>
                  <div className="text-sm font-semibold text-white">{ad.ctr > 0 ? `${ad.ctr.toFixed(2)}%` : '\u2014'}</div>
                </div>
                <div className="bg-bg-dark rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">CPC</div>
                  <div className="text-sm font-semibold text-white">{ad.cpc > 0 ? `$${ad.cpc.toFixed(2)}` : '\u2014'}</div>
                </div>
                <div className="bg-bg-dark rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Status</div>
                  <div className={cn(
                    'text-sm font-semibold',
                    ad.status === 'ACTIVE' ? 'text-emerald-400' : 'text-zinc-400'
                  )}>
                    {ad.status === 'ACTIVE' ? 'Active' : 'Paused'}
                  </div>
                </div>
              </div>

              {/* Ad Copy */}
              {ad.primary_text && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Primary Text</span>
                    <button
                      onClick={() => copyToClipboard(ad.primary_text!, 'body')}
                      className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedBody ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{ad.primary_text}</p>
                </div>
              )}

              {ad.headline && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Headline</span>
                    <button
                      onClick={() => copyToClipboard(ad.headline!, 'headline')}
                      className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedHeadline ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-white font-medium">{ad.headline}</p>
                </div>
              )}

              {ad.description && (
                <div className="space-y-2">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Description</span>
                  <p className="text-sm text-zinc-400">{ad.description}</p>
                </div>
              )}
            </div>

            {/* CTA Button */}
            <div className="p-6 border-t border-border bg-bg-dark/50">
              <button
                onClick={() => onUseThisAd(ad)}
                className="w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Sparkles className="w-5 h-5" />
                Use This Ad
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
