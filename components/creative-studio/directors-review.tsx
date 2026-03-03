'use client'

import { useState } from 'react'
import {
  Clapperboard, Eye, Video, Zap, Sparkles, ChevronRight, ChevronDown, ChevronUp,
  Plus, Loader2, AlertCircle, RefreshCw, Check,
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
  // Script fields
  scene: string; onSceneChange: (v: string) => void
  subject: string; onSubjectChange: (v: string) => void
  action: string; onActionChange: (v: string) => void
  mood: string; onMoodChange: (v: string) => void

  // Veo prompt
  videoPrompt: string; onVideoPromptChange: (v: string) => void

  // Extensions
  extensionPrompts: string[]; onExtensionPromptsChange: (v: string[]) => void

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
  scene, onSceneChange,
  subject, onSubjectChange,
  action, onActionChange,
  mood, onMoodChange,
  videoPrompt, onVideoPromptChange,
  extensionPrompts, onExtensionPromptsChange,
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
  const [showVeoPrompt, setShowVeoPrompt] = useState(true)
  const [showExtensions, setShowExtensions] = useState(false)

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
    // Extensions only support 1 reference image; base supports up to 3
    const maxImages = isBase ? 3 : 1

    if (current.includes(imageIdx)) {
      updated[segmentIdx] = current.filter(i => i !== imageIdx)
    } else if (maxImages === 1) {
      // Extensions: replace selection (only 1 allowed)
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
        <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
          {isBase ? 'Images (up to 3):' : 'Image (1):'}
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
                  ? 'border-blue-500 ring-1 ring-blue-500/50'
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
                <div className="absolute top-0 right-0 bg-blue-500 rounded-bl text-white p-0.5">
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
    <div className="space-y-4">
      {/* Director's Review Card */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
          <Clapperboard className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-300">Director&apos;s Review</span>
          <span className="ml-auto text-xs text-amber-400/60">
            {duration}s · {extensionCount > 0 ? `${extensionCount + 1} segments` : '1 segment'}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Scene + Subject */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 mb-1">
                <Eye className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Scene</span>
              </label>
              <input
                type="text"
                value={scene}
                onChange={(e) => onSceneChange(e.target.value)}
                className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 mb-1">
                <Video className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Subject</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Action</span>
            </label>
            <textarea
              value={action}
              onChange={(e) => onActionChange(e.target.value)}
              rows={3}
              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          {/* Mood */}
          <div>
            <label className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Mood</span>
            </label>
            <input
              type="text"
              value={mood}
              onChange={(e) => onMoodChange(e.target.value)}
              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Veo Prompt (collapsible) — Segment 1 */}
          <div>
            <button
              onClick={() => setShowVeoPrompt(!showVeoPrompt)}
              className="flex items-center gap-1.5 mb-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronRight className={cn('w-3 h-3 transition-transform', showVeoPrompt && 'rotate-90')} />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Veo Prompt ({VEO_BASE_DURATION}s)</span>
            </button>
            {showVeoPrompt && (
              <div>
                <textarea
                  value={videoPrompt}
                  onChange={(e) => onVideoPromptChange(e.target.value)}
                  rows={6}
                  className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                />
                {renderImagePicker(0)}
              </div>
            )}
          </div>

          {/* Extension Prompts (collapsible) */}
          <div>
            <button
              onClick={() => setShowExtensions(!showExtensions)}
              className="flex items-center gap-1.5 mb-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronRight className={cn('w-3 h-3 transition-transform', showExtensions && 'rotate-90')} />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Extension Prompts ({extensionCount})</span>
            </button>
            {showExtensions && (
              <div className="space-y-2">
                {extensionPrompts.map((ep, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-500 uppercase">
                        Segment {idx + 2} ({VEO_BASE_DURATION + idx * VEO_EXTENSION_STEP + 1}s - {VEO_BASE_DURATION + (idx + 1) * VEO_EXTENSION_STEP}s)
                      </label>
                      <button
                        onClick={() => {
                          const updated = extensionPrompts.filter((_, i) => i !== idx)
                          onExtensionPromptsChange(updated)
                          // Also remove corresponding segment image indices
                          if (segmentImageIndices && onSegmentImageIndicesChange) {
                            const newIndices = [...segmentImageIndices]
                            newIndices.splice(idx + 1, 1) // +1 because segment 0 is base
                            onSegmentImageIndicesChange(newIndices)
                          }
                        }}
                        className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      value={ep}
                      onChange={(e) => {
                        const updated = [...extensionPrompts]
                        updated[idx] = e.target.value
                        onExtensionPromptsChange(updated)
                      }}
                      rows={3}
                      className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                    />
                    {renderImagePicker(idx + 1)}
                  </div>
                ))}
                {extensionCount < 3 && (
                  <button
                    onClick={() => {
                      onExtensionPromptsChange([...extensionPrompts, 'Continue from previous shot. '])
                      setShowExtensions(true)
                      // Add segment image indices for new extension (copy from base)
                      if (segmentImageIndices && onSegmentImageIndicesChange) {
                        const baseIndices = segmentImageIndices[0] || []
                        onSegmentImageIndicesChange([...segmentImageIndices, [...baseIndices]])
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs text-amber-400/70 hover:text-amber-300 transition-colors py-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add extension (+7s)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Overlays toggle */}
          <div className="flex items-center justify-between py-2 border-t border-amber-500/10">
            <span className="text-xs font-medium text-amber-300/80">Text Overlays</span>
            <button
              onClick={() => onOverlaysEnabledChange(!overlaysEnabled)}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors',
                overlaysEnabled ? 'bg-amber-500' : 'bg-zinc-700'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                overlaysEnabled ? 'left-[18px]' : 'left-0.5'
              )} />
            </button>
          </div>

          {/* Hook + Captions + CTA (shown when overlays enabled) */}
          {overlaysEnabled && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Hook</label>
                <input
                  value={hook}
                  onChange={(e) => onHookChange(e.target.value)}
                  placeholder="Opening text (first 2 seconds)"
                  className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              {captions && onCaptionsChange && captions.map((cap, ci) => (
                <div key={ci}>
                  <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Caption {ci + 1}</label>
                  <input
                    value={cap}
                    onChange={(e) => {
                      const newCaptions = [...captions]
                      newCaptions[ci] = e.target.value
                      onCaptionsChange(newCaptions)
                    }}
                    placeholder={`Caption for beat ${ci + 1}`}
                    className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              ))}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase mb-1 block">CTA</label>
                <input
                  value={cta}
                  onChange={(e) => onCtaChange(e.target.value)}
                  placeholder="Call-to-action button text"
                  className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          )}

          {/* Ad Copy (optional) */}
          {adCopy && onAdCopyChange && (
            <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Ad Copy (optional)</div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Primary Text</label>
                  <textarea
                    value={adCopy.primaryText}
                    onChange={(e) => onAdCopyChange({ ...adCopy, primaryText: e.target.value })}
                    rows={2}
                    className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Headline</label>
                    <input
                      value={adCopy.headline}
                      onChange={(e) => onAdCopyChange({ ...adCopy, headline: e.target.value })}
                      className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Description</label>
                    <input
                      value={adCopy.description}
                      onChange={(e) => onAdCopyChange({ ...adCopy, description: e.target.value })}
                      className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quality Selector */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Quality</label>
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
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('text-xs font-medium', isActive ? 'text-amber-300' : 'text-zinc-400')}>
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

          {/* Budget line */}
          <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-white tabular-nums">{duration}s video</p>
              <p className="text-xs text-zinc-500">
                Veo 3.1 {quality === 'premium' ? 'Standard' : 'Fast'}{' '}
                {extensionCount === 0 ? 'Single clip' : `8s base + ${extensionCount} extension${extensionCount > 1 ? 's' : ''}`}
                {' · '}{quality === 'premium' ? '1080p' : '720p'}
              </p>
            </div>
            <div className="text-right space-y-0.5">
              <p className={cn('text-sm font-bold tabular-nums', canAfford ? 'text-amber-400' : 'text-red-400')}>
                {creditCost} credits
              </p>
              {creditsRemaining !== null && (
                <p className="text-xs text-zinc-500">{creditsRemaining} remaining</p>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onGenerate}
              disabled={generating || !canAfford || !!hasActiveJob}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {generating || hasActiveJob ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating {duration}s video...
                </>
              ) : hasCompletedVideo ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Re-generate ({creditCost} credits)
                </>
              ) : (
                <>
                  <Clapperboard className="w-4 h-4" />
                  Action! ({creditCost} credits)
                </>
              )}
            </button>
            {onRewrite && (
              <button
                onClick={onRewrite}
                disabled={generating || !!hasActiveJob}
                className="px-4 py-3 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                title="Rewrite script"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rewrite link (shown when no onRewrite button / no active job) */}
      {!hasActiveJob && !hasCompletedVideo && !onRewrite && (
        <div className="text-center">
          <button
            onClick={onRewrite}
            className="text-sm text-zinc-500 hover:text-amber-400 transition-colors"
          >
            &#8592; Rewrite Concept
          </button>
        </div>
      )}
    </div>
  )
}
