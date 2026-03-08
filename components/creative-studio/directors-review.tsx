'use client'

import { useState } from 'react'
import {
  Film, Plus, Loader2, AlertCircle, RefreshCw, Check, Type, Sparkles,
  ChevronDown, Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductImage } from '@/lib/video-prompt-templates'

// ─── Constants ──────────────────────────────────────────────────────────────
export const VEO_BASE_DURATION = 8
export const VEO_EXTENSION_STEP = 7
export const QUALITY_COSTS = {
  standard: { base: 20, extension: 30 },
  premium: { base: 50, extension: 75 },
}

// ─── Props ──────────────────────────────────────────────────────────────────
export interface DirectorsReviewProps {
  // Veo prompt (the main input now)
  videoPrompt: string; onVideoPromptChange: (v: string) => void

  // Extensions
  extensionPrompts: string[]; onExtensionPromptsChange: (v: string[]) => void

  // Dialogue (optional — shown separately from visual prompt)
  dialogue?: string; onDialogueChange?: (v: string) => void
  extensionDialogue?: string; onExtensionDialogueChange?: (v: string) => void

  // Overlays
  overlaysEnabled: boolean; onOverlaysEnabledChange: (v: boolean) => void
  hook: string; onHookChange: (v: string) => void
  captions?: string[]; onCaptionsChange?: (v: string[]) => void
  cta: string; onCtaChange: (v: string) => void

  // Ad copy (optional)
  adCopy?: { primaryText: string; headline: string; description: string } | null
  onAdCopyChange?: (v: { primaryText: string; headline: string; description: string } | null) => void

  // Quality
  quality: 'standard' | 'premium'; onQualityChange: (v: 'standard' | 'premium') => void

  // Per-segment image assignment
  productImages?: ProductImage[]
  segmentImageIndices?: number[][]
  onSegmentImageIndicesChange?: (v: number[][]) => void

  // Actions
  onGenerate: () => void
  onRewrite?: () => void
  generating: boolean
  creditsRemaining: number | null
  error: string | null

  // Optional: job state for re-generate display
  hasActiveJob?: boolean
  hasCompletedVideo?: boolean
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function DirectorsReview({
  videoPrompt, onVideoPromptChange,
  extensionPrompts, onExtensionPromptsChange,
  dialogue, onDialogueChange,
  extensionDialogue, onExtensionDialogueChange,
  overlaysEnabled, onOverlaysEnabledChange,
  hook, onHookChange,
  captions, onCaptionsChange,
  cta, onCtaChange,
  adCopy, onAdCopyChange,
  quality, onQualityChange,
  productImages,
  segmentImageIndices,
  onSegmentImageIndicesChange,
  onGenerate,
  onRewrite,
  generating,
  creditsRemaining,
  error,
  hasActiveJob,
  hasCompletedVideo,
}: DirectorsReviewProps) {
  const [showExtensions, setShowExtensions] = useState(extensionPrompts.length > 0)
  const [showOverlayFields, setShowOverlayFields] = useState(false)

  // Derived
  const extensionCount = extensionPrompts.length
  const duration = VEO_BASE_DURATION + extensionCount * VEO_EXTENSION_STEP
  const costs = QUALITY_COSTS[quality]
  const creditCost = costs.base + extensionCount * costs.extension
  const canAfford = creditsRemaining !== null ? creditsRemaining >= creditCost : true

  // Has product images for per-segment picker?
  const hasSegmentImages = productImages && productImages.length > 0 && segmentImageIndices && onSegmentImageIndicesChange

  const toggleSegmentImage = (segmentIdx: number, imageIdx: number) => {
    if (!segmentImageIndices || !onSegmentImageIndicesChange) return
    const updated = [...segmentImageIndices]
    const current = updated[segmentIdx] || []
    const isBase = segmentIdx === 0
    const maxImages = isBase ? 3 : 1

    if (current.includes(imageIdx)) {
      updated[segmentIdx] = current.filter(i => i !== imageIdx)
    } else if (maxImages === 1) {
      updated[segmentIdx] = [imageIdx]
    } else if (current.length < maxImages) {
      updated[segmentIdx] = [...current, imageIdx]
    }
    onSegmentImageIndicesChange(updated)
  }

  const renderImagePicker = (segmentIdx: number) => {
    if (!hasSegmentImages || !productImages || productImages.length === 0) return null
    const selected = segmentImageIndices?.[segmentIdx] || []
    const isBase = segmentIdx === 0

    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-zinc-500">
          {isBase ? 'Source images (up to 3):' : 'Source image:'}
        </span>
        {productImages.map((img, imgIdx) => {
          const isSelected = selected.includes(imgIdx)
          return (
            <button
              key={imgIdx}
              onClick={() => toggleSegmentImage(segmentIdx, imgIdx)}
              className={cn(
                'relative w-10 h-10 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0',
                isSelected
                  ? 'border-purple-500 ring-1 ring-purple-500/50'
                  : 'border-zinc-700 opacity-40 hover:opacity-70'
              )}
              title={img.description || `Image ${imgIdx + 1}`}
            >
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt={img.description || `Product ${imgIdx + 1}`}
                className="w-full h-full object-cover"
              />
              {isSelected && (
                <div className="absolute top-0 right-0 bg-purple-500 rounded-bl text-white p-0.5">
                  <Check className="w-2 h-2" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Main Prompt Card ── */}
      <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/40 overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-zinc-200">Video Script</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{duration}s</span>
            {onRewrite && (
              <button
                onClick={onRewrite}
                disabled={generating || !!hasActiveJob}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-purple-400 disabled:opacity-40 transition-colors"
                title="Rewrite script"
              >
                <RefreshCw className="w-3 h-3" />
                Rewrite
              </button>
            )}
          </div>
        </div>

        {/* Main prompt textarea */}
        <div className="p-4">
          <textarea
            value={videoPrompt}
            onChange={(e) => onVideoPromptChange(e.target.value)}
            rows={6}
            placeholder="Describe your video scene..."
            className="w-full bg-transparent text-sm text-zinc-100 leading-relaxed placeholder:text-zinc-600 focus:outline-none resize-none"
          />
          {renderImagePicker(0)}
        </div>

        {/* Dialogue (if present) */}
        {dialogue !== undefined && onDialogueChange && (
          <div className="px-4 pb-4">
            <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Type className="w-3 h-3 text-zinc-500" />
                  <span className="text-xs text-zinc-400">Dialogue</span>
                </div>
                <button
                  onClick={() => onDialogueChange('')}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Clear
                </button>
              </div>
              <textarea
                value={dialogue}
                onChange={(e) => onDialogueChange(e.target.value)}
                rows={2}
                placeholder="What the speaker says..."
                className="w-full bg-transparent text-sm text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Extensions ── */}
      {(extensionCount > 0 || true) && (
        <div className="space-y-2">
          {extensionPrompts.map((ep, idx) => (
            <div key={idx} className="rounded-2xl border border-zinc-700/40 bg-zinc-900/40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60">
                <span className="text-xs text-zinc-400">
                  Extension {idx + 1} &middot; {VEO_BASE_DURATION + idx * VEO_EXTENSION_STEP + 1}s&ndash;{VEO_BASE_DURATION + (idx + 1) * VEO_EXTENSION_STEP}s
                </span>
                <button
                  onClick={() => {
                    const updated = extensionPrompts.filter((_, i) => i !== idx)
                    onExtensionPromptsChange(updated)
                    if (segmentImageIndices && onSegmentImageIndicesChange) {
                      const newIndices = [...segmentImageIndices]
                      newIndices.splice(idx + 1, 1)
                      onSegmentImageIndicesChange(newIndices)
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Minus className="w-3 h-3" />
                  Remove
                </button>
              </div>
              <div className="p-4">
                <textarea
                  value={ep}
                  onChange={(e) => {
                    const updated = [...extensionPrompts]
                    updated[idx] = e.target.value
                    onExtensionPromptsChange(updated)
                  }}
                  rows={3}
                  placeholder="Continue from previous shot..."
                  className="w-full bg-transparent text-sm text-zinc-100 leading-relaxed placeholder:text-zinc-600 focus:outline-none resize-none"
                />
                {renderImagePicker(idx + 1)}
              </div>

              {/* Extension dialogue */}
              {idx === 0 && extensionDialogue !== undefined && onExtensionDialogueChange && extensionDialogue && (
                <div className="px-4 pb-4">
                  <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/30 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Type className="w-3 h-3 text-zinc-500" />
                      <span className="text-xs text-zinc-400">Continued dialogue</span>
                    </div>
                    <textarea
                      value={extensionDialogue}
                      onChange={(e) => onExtensionDialogueChange(e.target.value)}
                      rows={2}
                      placeholder="What the speaker says in this segment..."
                      className="w-full bg-transparent text-sm text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add extension button */}
          {extensionCount < 3 && (
            <button
              onClick={() => {
                onExtensionPromptsChange([...extensionPrompts, 'Continue from previous shot. '])
                if (segmentImageIndices && onSegmentImageIndicesChange) {
                  const baseIndices = segmentImageIndices[0] || []
                  onSegmentImageIndicesChange([...segmentImageIndices, [...baseIndices]])
                }
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-zinc-700/50 text-xs text-zinc-500 hover:text-purple-400 hover:border-purple-500/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add extension (+7s)
            </button>
          )}
        </div>
      )}

      {/* ── Options row (overlays + quality) ── */}
      <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/40 overflow-hidden">
        {/* Overlays toggle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-sm text-zinc-300">Text Overlays</span>
          </div>
          <button
            onClick={() => {
              onOverlaysEnabledChange(!overlaysEnabled)
              if (!overlaysEnabled) setShowOverlayFields(true)
            }}
            className={cn(
              'relative w-9 h-5 rounded-full transition-colors',
              overlaysEnabled ? 'bg-purple-500' : 'bg-zinc-700'
            )}
          >
            <div className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
              overlaysEnabled ? 'left-[18px]' : 'left-0.5'
            )} />
          </button>
        </div>

        {/* Overlay fields (expanded when enabled) */}
        {overlaysEnabled && (
          <div className="px-4 py-3 space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Hook text</label>
              <input
                value={hook}
                onChange={(e) => onHookChange(e.target.value)}
                placeholder="Opening text (first 2 seconds)"
                className="w-full bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            {captions && onCaptionsChange && captions.map((cap, ci) => (
              <div key={ci}>
                <label className="text-xs text-zinc-500 mb-1 block">Caption {ci + 1}</label>
                <input
                  value={cap}
                  onChange={(e) => {
                    const newCaptions = [...captions]
                    newCaptions[ci] = e.target.value
                    onCaptionsChange(newCaptions)
                  }}
                  placeholder={`Caption for beat ${ci + 1}`}
                  className="w-full bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">CTA button</label>
              <input
                value={cta}
                onChange={(e) => onCtaChange(e.target.value)}
                placeholder="Call-to-action text"
                className="w-full bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>
        )}

        {/* Quality selector */}
        <div className="px-4 py-3 border-t border-zinc-800/60">
          <div className="flex gap-2">
            {(['standard', 'premium'] as const).map(q => {
              const isActive = quality === q
              const qCosts = QUALITY_COSTS[q]
              const totalCost = qCosts.base + extensionCount * qCosts.extension
              return (
                <button
                  key={q}
                  onClick={() => onQualityChange(q)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg border transition-all text-left',
                    isActive
                      ? 'bg-purple-500/10 border-purple-500/30'
                      : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-xs font-medium', isActive ? 'text-purple-300' : 'text-zinc-400')}>
                      {q === 'standard' ? 'Standard' : 'Premium'}
                    </span>
                    <span className="text-[10px] text-zinc-500">{q === 'standard' ? '720p' : '1080p'}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{totalCost} credits</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Ad Copy (optional) ── */}
      {adCopy && onAdCopyChange && (
        <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/40 p-4 space-y-3">
          <div className="text-xs text-zinc-500">Ad Copy (optional)</div>
          <textarea
            value={adCopy.primaryText}
            onChange={(e) => onAdCopyChange({ ...adCopy, primaryText: e.target.value })}
            rows={2}
            placeholder="Primary text"
            className="w-full bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50 resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={adCopy.headline}
              onChange={(e) => onAdCopyChange({ ...adCopy, headline: e.target.value })}
              placeholder="Headline"
              className="w-full bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
            />
            <input
              value={adCopy.description}
              onChange={(e) => onAdCopyChange({ ...adCopy, description: e.target.value })}
              placeholder="Description"
              className="w-full bg-zinc-800/50 border border-zinc-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
            />
          </div>
        </div>
      )}

      {/* ── Generate bar ── */}
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-700/40 bg-zinc-900/40 p-3">
        {/* Budget info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200 tabular-nums">{duration}s</span>
            <span className="text-xs text-zinc-600">&middot;</span>
            <span className="text-xs text-zinc-500">
              {quality === 'premium' ? '1080p' : '720p'}
              {extensionCount > 0 && ` · ${extensionCount + 1} segments`}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-xs font-medium tabular-nums', canAfford ? 'text-purple-400' : 'text-red-400')}>
              {creditCost} credits
            </span>
            {creditsRemaining !== null && (
              <span className="text-[10px] text-zinc-600">{creditsRemaining} remaining</span>
            )}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={generating || !canAfford || !!hasActiveJob}
          className={cn(
            'flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all',
            'bg-purple-500 text-white hover:bg-purple-400',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {generating || hasActiveJob ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : hasCompletedVideo ? (
            <>
              <RefreshCw className="w-4 h-4" />
              Re-generate
            </>
          ) : (
            <>
              <Film className="w-4 h-4" />
              Generate
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
