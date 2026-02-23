'use client'

import { useState, useCallback } from 'react'
import {
  Globe,
  Type,
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  Plus,
  X,
  ChevronLeft,
  Lightbulb,
  Pencil,
  Film,
  Link2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductKnowledge, ProductImage } from '@/lib/video-prompt-templates'

// ─── Pill categories ──────────────────────────────────────────────────────────

type PillCategory = 'name' | 'description' | 'features' | 'benefits' | 'keyMessages' | 'testimonials' | 'painPoints'

const SINGLE_SELECT: PillCategory[] = ['name', 'description']

const PILL_SECTIONS: { key: PillCategory; label: string; required?: boolean; hint: string }[] = [
  { key: 'name', label: 'Product Name', required: true, hint: 'pick one' },
  { key: 'description', label: 'Description', hint: 'pick one' },
  { key: 'features', label: 'Key Features', hint: 'select all that apply' },
  { key: 'benefits', label: 'Benefits', hint: 'select all that apply' },
  { key: 'keyMessages', label: 'Key Messages', hint: 'select all that apply' },
  { key: 'testimonials', label: 'Customer Voice', hint: 'select all that apply' },
  { key: 'painPoints', label: 'Problems It Solves', hint: 'select all that apply' },
]

// ─── Pill Selector Component ──────────────────────────────────────────────────

function PillGroup({
  label,
  items,
  selectedIndices,
  multiSelect,
  onToggle,
  onAdd,
  required,
  hint,
}: {
  label: string
  items: string[]
  selectedIndices: number[]
  multiSelect: boolean
  onToggle: (index: number) => void
  onAdd: (value: string) => void
  required?: boolean
  hint: string
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (!input.trim()) return
    onAdd(input.trim())
    setInput('')
    setIsAdding(false)
  }

  if (items.length === 0 && !isAdding) {
    return (
      <div>
        <label className="text-sm font-medium text-zinc-300 mb-2 block">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-zinc-500 border border-dashed border-zinc-700 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add {label.toLowerCase()}
        </button>
      </div>
    )
  }

  return (
    <div>
      <label className="text-sm font-medium text-zinc-300 mb-2 block">
        {label} {required && <span className="text-red-400">*</span>}
        {items.length > 0 && (
          <span className="text-xs text-zinc-600 ml-2">{hint}</span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => {
          const isSelected = selectedIndices.includes(i)
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer text-left max-w-full',
                isSelected
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
              )}
            >
              <span className="line-clamp-2">{item}</span>
            </button>
          )
        })}

        {isAdding ? (
          <div className="flex items-center gap-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setIsAdding(false); setInput('') }
              }}
              autoFocus
              placeholder="Type and press Enter"
              className="bg-bg-dark border border-blue-500/30 rounded-full px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none w-48"
            />
            <button onClick={() => { setIsAdding(false); setInput('') }} className="text-zinc-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-zinc-600 border border-dashed border-zinc-700 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
            title={`Add custom ${label.toLowerCase()}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface URLToVideoProps {
  userId: string
  adAccountId: string
  credits: { remaining: number; totalAvailable: number } | null
  onCreditsChanged: () => void
  onBack: () => void
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function URLToVideo({
  userId,
  adAccountId,
  credits,
  onCreditsChanged,
  onBack,
}: URLToVideoProps) {
  // Product input
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url')
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Product knowledge from analyze-product-url API
  const [productKnowledge, setProductKnowledge] = useState<ProductKnowledge | null>(null)
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [selectedProductImageIdx, setSelectedProductImageIdx] = useState(0)
  const [includeProductImage, setIncludeProductImage] = useState(true)

  // Pill pools (7 categories)
  const [pools, setPools] = useState<Record<PillCategory, string[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })
  const [selected, setSelected] = useState<Record<PillCategory, number[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })
  const [extraContext, setExtraContext] = useState({
    targetAudience: '',
    category: '',
    uniqueSellingPoint: '',
  })
  const [videoIntel, setVideoIntel] = useState<{
    motionOpportunities: string[]
    sensoryDetails: string[]
    visualHooks: string[]
  }>({ motionOpportunities: [], sensoryDetails: [], visualHooks: [] })

  // Sub-mode toggle
  const [subMode, setSubMode] = useState<'concepts' | 'direct'>('concepts')

  // ─── Pill toggle helpers ────────────────────────────────────────────────────

  const togglePill = useCallback((category: PillCategory, index: number) => {
    const isSingle = SINGLE_SELECT.includes(category)
    setSelected(prev => ({
      ...prev,
      [category]: isSingle
        ? (prev[category].includes(index) ? [] : [index])
        : (prev[category].includes(index)
            ? prev[category].filter(i => i !== index)
            : [...prev[category], index]),
    }))
  }, [])

  const addToPool = useCallback((category: PillCategory, value: string) => {
    const isSingle = SINGLE_SELECT.includes(category)
    setPools(prev => {
      const newPool = [...prev[category], value]
      const newIndex = newPool.length - 1
      // Auto-select newly added items
      setSelected(sel => ({
        ...sel,
        [category]: isSingle ? [newIndex] : [...sel[category], newIndex],
      }))
      return { ...prev, [category]: newPool }
    })
  }, [])

  // ─── Product Analysis ───────────────────────────────────────────────────────

  const handleAnalyzeUrl = useCallback(async () => {
    if (!productUrl.trim()) return
    setIsAnalyzing(true)
    setAnalyzeError(null)
    try {
      const res = await fetch('/api/creative-studio/analyze-product-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAnalyzeError(data.error || 'Failed to analyze product')
        return
      }
      if (data.product) {
        const p = data.product
        // Populate pill pools from analysis
        setPools({
          name: p.name ? [p.name] : [],
          description: p.description ? [p.description] : [],
          features: p.features || [],
          benefits: p.benefits || [],
          keyMessages: p.keyMessages || [],
          testimonials: p.testimonialPoints || [],
          painPoints: p.painPoints || [],
        })
        // All pills start unselected -- user picks what matters
        setSelected({
          name: [], description: [], features: [], benefits: [],
          keyMessages: [], testimonials: [], painPoints: [],
        })
        // Store extra context
        setExtraContext({
          targetAudience: p.targetAudience || '',
          category: p.category || '',
          uniqueSellingPoint: p.uniqueSellingPoint || '',
        })
        // Store video-specific intelligence
        setVideoIntel({
          motionOpportunities: p.motionOpportunities || [],
          sensoryDetails: p.sensoryDetails || [],
          visualHooks: p.visualHooks || [],
        })
        if (data.productImages?.length > 0) {
          setProductImages(data.productImages)
        }
        setHasAnalyzed(true)
      }
    } catch {
      setAnalyzeError('Failed to analyze product URL')
    } finally {
      setIsAnalyzing(false)
    }
  }, [productUrl])

  // ─── Assemble product knowledge from pills ─────────────────────────────────

  const assembleProductKnowledge = useCallback((): ProductKnowledge => {
    return {
      name: selected.name.length > 0 ? pools.name[selected.name[0]] : '',
      description: selected.description.length > 0 ? pools.description[selected.description[0]] : undefined,
      features: selected.features.map(i => pools.features[i]),
      benefits: selected.benefits.map(i => pools.benefits[i]),
      painPoints: selected.painPoints.map(i => pools.painPoints[i]),
      testimonialPoints: selected.testimonials.map(i => pools.testimonials[i]),
      keyMessages: selected.keyMessages.map(i => pools.keyMessages[i]),
      targetAudience: extraContext.targetAudience || undefined,
      category: extraContext.category || undefined,
      uniqueSellingPoint: extraContext.uniqueSellingPoint || undefined,
      motionOpportunities: videoIntel.motionOpportunities.length > 0 ? videoIntel.motionOpportunities : undefined,
      sensoryDetails: videoIntel.sensoryDetails.length > 0 ? videoIntel.sensoryDetails : undefined,
      visualHooks: videoIntel.visualHooks.length > 0 ? videoIntel.visualHooks : undefined,
    }
  }, [pools, selected, extraContext, videoIntel])

  // ─── Derived state ─────────────────────────────────────────────────────────

  const canProceed = selected.name.length > 0
  const totalPillsFound = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-[1000px] mx-auto px-4 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Link2 className="w-7 h-7 text-blue-400" />
                URL to Video
              </h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1 ml-7">Enter a product URL to generate video ad concepts</p>
          </div>
          {credits && (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
              <Sparkles className="w-3 h-3" />
              {credits.remaining} credits remaining
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Section A: Product Input */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">What product is this ad for?</h2>
            <p className="text-sm text-zinc-500 mb-4">We&apos;ll find your value props and turn them into video ad concepts.</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('url')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'url' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Globe className="w-4 h-4" />
                Product URL
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'manual' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Type className="w-4 h-4" />
                Enter Manually
              </button>
            </div>

            {inputMode === 'url' && (
              <div className="mb-4">
                <div className="flex gap-3">
                  <input
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeUrl()}
                    placeholder="https://yourstore.com/product"
                    className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={!productUrl.trim() || isAnalyzing}
                    className="px-6 py-3 rounded-lg bg-blue-500/20 text-blue-300 font-medium hover:bg-blue-500/30 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                </div>
                {analyzeError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
                    <AlertCircle className="w-4 h-4" />
                    {analyzeError}
                  </div>
                )}
              </div>
            )}

            {hasAnalyzed && inputMode === 'url' && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <Check className="w-4 h-4" />
                Found {totalPillsFound} items -- select the ones you want in your creative brief
              </div>
            )}

            {/* Product image picker */}
            {productImages.length > 1 && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Product image for video generation -- click to change</label>
                <div className="flex flex-wrap gap-2">
                  {productImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedProductImageIdx(i)}
                      className={cn(
                        'relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all',
                        selectedProductImageIdx === i
                          ? 'border-blue-500 ring-2 ring-blue-500/30'
                          : 'border-border hover:border-zinc-500'
                      )}
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt={img.description || `Image ${i + 1}`}
                        className="w-full h-full object-contain bg-zinc-900"
                      />
                      {selectedProductImageIdx === i && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Include product image toggle */}
            {productImages.length > 0 && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProductImage}
                  onChange={(e) => setIncludeProductImage(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-xs text-zinc-400">Include product image in video</span>
              </label>
            )}
          </div>

          {/* Section B: Pill Selectors */}
          {(hasAnalyzed || inputMode === 'manual') && (
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">Creative Brief</h2>
                {totalSelected > 0 && (
                  <span className="text-xs text-zinc-500">{totalSelected} selected</span>
                )}
              </div>
              <div className="space-y-5">
                {PILL_SECTIONS.map(({ key, label, required, hint }) => {
                  // Hide empty sections that have no items (unless required or has items)
                  if (pools[key].length === 0 && !required && key !== 'features' && key !== 'benefits') return null
                  return (
                    <PillGroup
                      key={key}
                      label={label}
                      items={pools[key]}
                      selectedIndices={selected[key]}
                      multiSelect={!SINGLE_SELECT.includes(key)}
                      onToggle={(index) => togglePill(key, index)}
                      onAdd={(value) => addToPool(key, value)}
                      required={required}
                      hint={hint}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Section C: Sub-mode toggle */}
          {(hasAnalyzed || inputMode === 'manual') && canProceed && (
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-3">Generation Mode</h2>
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setSubMode('concepts')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                    subMode === 'concepts'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                  )}
                >
                  <Lightbulb className="w-4 h-4" />
                  Generate Concepts
                </button>
                <button
                  onClick={() => setSubMode('direct')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                    subMode === 'direct'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                  )}
                >
                  <Pencil className="w-4 h-4" />
                  Direct
                </button>
              </div>

              {/* Sub-mode placeholder content */}
              {subMode === 'concepts' ? (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 mb-3">
                    <Lightbulb className="w-6 h-6 text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Generate 4 unique video concepts from your product</p>
                  <p className="text-xs text-zinc-500">AI will create concepts with different angles, visual metaphors, and scripts tailored to your product</p>
                  <button
                    disabled
                    className="mt-4 flex items-center gap-2 mx-auto px-6 py-3 rounded-lg bg-blue-500 text-white font-medium opacity-50 cursor-not-allowed"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Concepts
                  </button>
                  <p className="text-xs text-zinc-600 mt-2">Coming in Task 6</p>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 mb-3">
                    <Pencil className="w-6 h-6 text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Write your own video concept</p>
                  <p className="text-xs text-zinc-500">Describe the video you want and AI will plan the scene, then generate the video</p>
                  <button
                    disabled
                    className="mt-4 flex items-center gap-2 mx-auto px-6 py-3 rounded-lg bg-blue-500 text-white font-medium opacity-50 cursor-not-allowed"
                  >
                    <Film className="w-4 h-4" />
                    Plan Scene
                  </button>
                  <p className="text-xs text-zinc-600 mt-2">Coming in Task 7</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
