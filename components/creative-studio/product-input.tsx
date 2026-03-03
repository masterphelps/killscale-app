'use client'

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react'
import {
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  Plus,
  X,
  Upload,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductKnowledge, ProductImage } from '@/lib/video-prompt-templates'

// ─── Pill categories ──────────────────────────────────────────────────────────

type PillCategory = 'name' | 'description' | 'features' | 'benefits' | 'keyMessages' | 'testimonials' | 'painPoints'

const SINGLE_SELECT: PillCategory[] = ['name', 'description']

const PILL_SECTIONS: { key: PillCategory; label: string; required?: boolean; hint: string }[] = [
  { key: 'name', label: 'Product Name', required: true, hint: 'pick one' },
  { key: 'description', label: 'Description', required: true, hint: 'pick one' },
  { key: 'features', label: 'Key Features', hint: 'select all that apply' },
  { key: 'benefits', label: 'Benefits', hint: 'select all that apply' },
  { key: 'keyMessages', label: 'Key Messages', hint: 'select all that apply' },
  { key: 'testimonials', label: 'Customer Voice', hint: 'select all that apply' },
  { key: 'painPoints', label: 'Problems It Solves', hint: 'select all that apply' },
]

// ─── Accent color mappings ──────────────────────────────────────────────────

const ACCENT = {
  amber: {
    pillSelected: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    analyze: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30',
    imageRing: 'border-amber-500 ring-amber-500/30',
    imageBadge: 'bg-amber-500',
    imageOverlay: 'bg-amber-500/20',
    addInput: 'border-amber-500/30',
    addHover: 'hover:text-amber-400 hover:border-amber-500/30',
    mediaBorder: 'hover:border-amber-500/40 hover:bg-amber-500/5',
    mediaIcon: 'text-amber-400',
  },
  purple: {
    pillSelected: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    analyze: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30',
    imageRing: 'border-purple-500 ring-purple-500/30',
    imageBadge: 'bg-purple-500',
    imageOverlay: 'bg-purple-500/20',
    addInput: 'border-purple-500/30',
    addHover: 'hover:text-purple-400 hover:border-purple-500/30',
    mediaBorder: 'hover:border-purple-500/40 hover:bg-purple-500/5',
    mediaIcon: 'text-purple-400',
  },
  blue: {
    pillSelected: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    analyze: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
    imageRing: 'border-blue-500 ring-blue-500/30',
    imageBadge: 'bg-blue-500',
    imageOverlay: 'bg-blue-500/20',
    addInput: 'border-blue-500/30',
    addHover: 'hover:text-blue-400 hover:border-blue-500/30',
    mediaBorder: 'hover:border-blue-500/40 hover:bg-blue-500/5',
    mediaIcon: 'text-blue-400',
  },
} as const

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProductInputProps {
  onChange: (knowledge: ProductKnowledge, images: ProductImage[], selectedIndices: number[]) => void
  onOpenMediaLibrary?: () => void
  onImageFromLibrary?: { base64: string; mimeType: string; preview: string } | null
  initialUrl?: string
  initialProductKnowledge?: ProductKnowledge
  initialProductImages?: ProductImage[]
  autoAnalyze?: boolean
  collapsed?: boolean
  onCollapsedChange?: (v: boolean) => void
  accentColor?: 'amber' | 'purple' | 'blue'
}

export interface ProductInputRef {
  assemble: () => ProductKnowledge
  getProductImages: () => { images: ProductImage[]; selectedIndices: number[]; include: boolean }
  hasAnalyzed: boolean
  canProceed: boolean
}

// ─── PillGroup Sub-Component ────────────────────────────────────────────────

function PillGroup({
  label,
  items,
  selectedIndices,
  multiSelect,
  onToggle,
  onAdd,
  required,
  hint,
  accent,
}: {
  label: string
  items: string[]
  selectedIndices: number[]
  multiSelect: boolean
  onToggle: (index: number) => void
  onAdd: (value: string) => void
  required?: boolean
  hint: string
  accent: typeof ACCENT[keyof typeof ACCENT]
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
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-zinc-500 border border-dashed border-zinc-700 transition-colors',
            accent.addHover
          )}
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
                  ? accent.pillSelected
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
              className={cn(
                'bg-bg-dark border rounded-full px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none w-48',
                accent.addInput
              )}
            />
            <button onClick={() => { setIsAdding(false); setInput('') }} className="text-zinc-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-zinc-600 border border-dashed border-zinc-700 transition-colors',
              accent.addHover
            )}
            title={`Add custom ${label.toLowerCase()}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

const ProductInput = forwardRef<ProductInputRef, ProductInputProps>(function ProductInput(
  {
    onChange,
    onOpenMediaLibrary,
    onImageFromLibrary,
    initialUrl,
    initialProductKnowledge,
    initialProductImages,
    autoAnalyze = false,
    collapsed = false,
    onCollapsedChange,
    accentColor = 'amber',
  },
  ref
) {
  const accent = ACCENT[accentColor]

  // ─── Internal state ─────────────────────────────────────────────────────

  const [productUrl, setProductUrl] = useState(initialUrl || '')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Product knowledge from analyze-product-url API
  const [productImages, setProductImages] = useState<ProductImage[]>(initialProductImages || [])
  const [selectedProductImageIndices, setSelectedProductImageIndices] = useState<number[]>(
    initialProductImages ? initialProductImages.slice(0, 3).map((_, i) => i) : []
  )
  const [includeProductImage, setIncludeProductImage] = useState(
    !!(initialProductImages && initialProductImages.length > 0)
  )

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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoAnalyzedRef = useRef(false)
  const initialKnowledgeAppliedRef = useRef(false)

  // ─── Derived state ──────────────────────────────────────────────────────

  const canProceed = selected.name.length > 0 && selected.description.length > 0
  const totalPillsFound = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)

  // ─── Assemble product knowledge from pills ───────────────────────────────

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

  // ─── Imperative handle ────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    assemble: assembleProductKnowledge,
    getProductImages: () => ({
      images: productImages,
      selectedIndices: selectedProductImageIndices,
      include: includeProductImage,
    }),
    hasAnalyzed,
    canProceed,
  }), [assembleProductKnowledge, productImages, selectedProductImageIndices, includeProductImage, hasAnalyzed, canProceed])

  // ─── Notify parent of changes ─────────────────────────────────────────────

  const prevNotifyRef = useRef<string>('')
  useEffect(() => {
    const knowledge = assembleProductKnowledge()
    const key = JSON.stringify({ knowledge, selectedProductImageIndices })
    if (key !== prevNotifyRef.current) {
      prevNotifyRef.current = key
      onChange(knowledge, productImages, selectedProductImageIndices)
    }
  }, [assembleProductKnowledge, productImages, selectedProductImageIndices, onChange])

  // ─── Pill toggle helpers ──────────────────────────────────────────────────

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

  // ─── Upload own product image ─────────────────────────────────────────────

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      const newImage: ProductImage = {
        base64,
        mimeType: file.type,
        description: file.name,
        type: 'uploaded',
      }
      setProductImages(prev => {
        const updated = [...prev, newImage]
        // Auto-select if under the 3-image limit
        setSelectedProductImageIndices(prevSel =>
          prevSel.length >= 3 ? prevSel : [...prevSel, updated.length - 1]
        )
        return updated
      })
      setIncludeProductImage(true)
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [])

  // ─── Accept image from parent (media library) ─────────────────────────────

  useEffect(() => {
    if (onImageFromLibrary) {
      const newImage: ProductImage = {
        base64: onImageFromLibrary.base64,
        mimeType: onImageFromLibrary.mimeType,
        description: 'Library image',
        type: 'library',
      }
      setProductImages(prev => {
        const updated = [...prev, newImage]
        // Auto-select if under the 3-image limit
        setSelectedProductImageIndices(prevSel =>
          prevSel.length >= 3 ? prevSel : [...prevSel, updated.length - 1]
        )
        return updated
      })
      setIncludeProductImage(true)
    }
  }, [onImageFromLibrary])

  // ─── Product Analysis ─────────────────────────────────────────────────────

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
          // Select first 3 product images by default (API max is 3)
          setSelectedProductImageIndices(data.productImages.slice(0, 3).map((_: unknown, i: number) => i))
        }
        setHasAnalyzed(true)
      }
    } catch {
      setAnalyzeError('Failed to analyze product URL')
    } finally {
      setIsAnalyzing(false)
    }
  }, [productUrl])

  // ─── Auto-analyze when initialUrl provided + autoAnalyze=true ─────────────

  useEffect(() => {
    if (autoAnalyze && initialUrl && !autoAnalyzedRef.current && !hasAnalyzed && !isAnalyzing) {
      autoAnalyzedRef.current = true
      handleAnalyzeUrl()
    }
  }, [autoAnalyze, initialUrl, hasAnalyzed, isAnalyzing, handleAnalyzeUrl])

  // ─── Pre-fill from initialProductKnowledge (Oracle handoff) ───────────────

  useEffect(() => {
    if (initialProductKnowledge && !initialKnowledgeAppliedRef.current) {
      initialKnowledgeAppliedRef.current = true
      const pk = initialProductKnowledge
      const newPools: Record<PillCategory, string[]> = {
        name: pk.name ? [pk.name] : [],
        description: pk.description ? [pk.description] : [],
        features: pk.features || [],
        benefits: pk.benefits || [],
        keyMessages: pk.keyMessages || [],
        testimonials: pk.testimonialPoints || [],
        painPoints: pk.painPoints || [],
      }
      setPools(newPools)
      // Auto-select all provided pills
      const newSelected: Record<PillCategory, number[]> = {
        name: newPools.name.length > 0 ? [0] : [],
        description: newPools.description.length > 0 ? [0] : [],
        features: newPools.features.map((_, i) => i),
        benefits: newPools.benefits.map((_, i) => i),
        keyMessages: newPools.keyMessages.map((_, i) => i),
        testimonials: newPools.testimonials.map((_, i) => i),
        painPoints: newPools.painPoints.map((_, i) => i),
      }
      setSelected(newSelected)
      setExtraContext({
        targetAudience: pk.targetAudience || '',
        category: pk.category || '',
        uniqueSellingPoint: pk.uniqueSellingPoint || '',
      })
      setVideoIntel({
        motionOpportunities: pk.motionOpportunities || [],
        sensoryDetails: pk.sensoryDetails || [],
        visualHooks: pk.visualHooks || [],
      })
      setHasAnalyzed(true)
    }
  }, [initialProductKnowledge])

  // ─── Collapsed view ───────────────────────────────────────────────────────

  if (collapsed) {
    const name = selected.name.length > 0 ? pools.name[selected.name[0]] : 'Product'
    const imageCount = selectedProductImageIndices.length
    return (
      <div className="bg-bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Thumbnail of first selected image */}
            {productImages.length > 0 && selectedProductImageIndices.length > 0 && (
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-zinc-700">
                <img
                  src={`data:${productImages[selectedProductImageIndices[0]].mimeType};base64,${productImages[selectedProductImageIndices[0]].base64}`}
                  alt=""
                  className="w-full h-full object-contain bg-zinc-900"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{name}</p>
              <p className="text-xs text-zinc-500">
                {imageCount > 0 ? `${imageCount} image${imageCount > 1 ? 's' : ''}` : 'No images'}
                {' | '}
                {totalSelected} pill{totalSelected !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            onClick={() => onCollapsedChange?.(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
          >
            Edit
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // ─── Full render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Section A: Product Input */}
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-white">What product is this ad for?</h2>
          {onCollapsedChange && hasAnalyzed && canProceed && (
            <button
              onClick={() => onCollapsedChange(true)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Collapse
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-sm text-zinc-500 mb-4">Enter a URL or add details manually below.</p>

        {/* URL input */}
        <div className="mb-4">
          <div className="flex gap-3">
            <input
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeUrl()}
              placeholder="yourstore.com/product"
              className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAnalyzeUrl}
              disabled={!productUrl.trim() || isAnalyzing}
              className={cn(
                'px-6 py-3 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2',
                accent.analyze
              )}
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

        {hasAnalyzed && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Check className="w-4 h-4" />
            Found {totalPillsFound} items -- select the ones you want in your creative brief
          </div>
        )}

        {/* Product image selection — multi-select grid */}
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300 block">
              Product images — select up to 3
              {productImages.length > 0 && (
                <span className="text-xs text-zinc-500 ml-2">
                  ({selectedProductImageIndices.length}/{Math.min(productImages.length, 3)})
                </span>
              )}
            </label>
            {selectedProductImageIndices.length > 0 && (
              <button
                onClick={() => { setSelectedProductImageIndices([]); setIncludeProductImage(false) }}
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Multi-select image grid */}
          {productImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {productImages.map((img, i) => {
                const isSelected = selectedProductImageIndices.includes(i)
                const selectionOrder = isSelected ? selectedProductImageIndices.indexOf(i) + 1 : 0
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedProductImageIndices(prev => {
                        if (prev.includes(i)) {
                          const next = prev.filter(idx => idx !== i)
                          if (next.length === 0) setIncludeProductImage(false)
                          return next
                        }
                        if (prev.length >= 3) return prev
                        setIncludeProductImage(true)
                        return [...prev, i]
                      })
                    }}
                    className={cn(
                      'relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all',
                      isSelected
                        ? cn(accent.imageRing, 'ring-2')
                        : 'border-zinc-700 hover:border-zinc-500'
                    )}
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.description || `Image ${i + 1}`}
                      className="w-full h-full object-contain bg-zinc-900"
                    />
                    {isSelected && (
                      <div className={cn('absolute inset-0 flex items-center justify-center', accent.imageOverlay)}>
                        <span className={cn('w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center', accent.imageBadge)}>
                          {selectionOrder}
                        </span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Media Library + Upload — always available */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onOpenMediaLibrary && (
              <button
                onClick={onOpenMediaLibrary}
                className={cn(
                  'flex flex-col items-center justify-center py-6 border-2 border-dashed border-zinc-700 rounded-xl transition-colors',
                  accent.mediaBorder
                )}
              >
                <Layers className={cn('w-6 h-6 mb-1', accent.mediaIcon)} />
                <p className="text-white font-medium text-sm">Media Library</p>
              </button>
            )}
            <label className={cn(
              'flex flex-col items-center justify-center py-6 border-2 border-dashed border-zinc-700 rounded-xl transition-colors cursor-pointer',
              accent.mediaBorder
            )}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Upload className={cn('w-6 h-6 mb-1', accent.mediaIcon)} />
              <p className="text-white font-medium text-sm">Upload Image</p>
            </label>
          </div>
        </div>
      </div>

      {/* Section B: Pill Selectors */}
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Creative Brief</h2>
          {totalSelected > 0 && (
            <span className="text-xs text-zinc-500">{totalSelected} selected</span>
          )}
        </div>
        <div className="space-y-5">
          {PILL_SECTIONS.map(({ key, label, required, hint }) => {
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
                accent={accent}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
})

// ─── Exports ────────────────────────────────────────────────────────────────

export default ProductInput
export { ProductInput }
export type { PillCategory }
