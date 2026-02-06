'use client'

import { useState, useEffect } from 'react'
import Masonry from 'react-masonry-css'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles, Image, Film, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InspirationCard } from './inspiration-card'
import { InspirationModal } from './inspiration-modal'
import { SkeletonCard } from './skeleton-card'
import type { InspirationExample, AdFormat } from './types'
import { AD_FORMAT_LABELS, AD_FORMAT_COLORS } from './types'

interface InspirationGalleryProps {
  onSelectExample: (example: InspirationExample) => void
  onBack: () => void
}

const breakpointColumns = {
  default: 4,
  1536: 4,
  1280: 3,
  1024: 3,
  768: 2,
  640: 1,
}

const FORMAT_TABS: Array<{ value: AdFormat | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ugc', label: 'UGC' },
  { value: 'product_hero', label: 'Product Hero' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'bold', label: 'Bold' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'before_after', label: 'Before/After' },
]

export function InspirationGallery({ onSelectExample, onBack }: InspirationGalleryProps) {
  const [examples, setExamples] = useState<InspirationExample[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState<AdFormat | 'all'>('all')
  const [selectedExample, setSelectedExample] = useState<InspirationExample | null>(null)
  const [stats, setStats] = useState<{ total: number; byFormat: Record<string, number> }>({
    total: 0,
    byFormat: {},
  })

  useEffect(() => {
    const fetchExamples = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (selectedFormat !== 'all') {
          params.set('format', selectedFormat)
        }

        const response = await fetch(`/api/creative-studio/inspiration?${params}`)
        if (!response.ok) throw new Error('Failed to fetch')

        const data = await response.json()
        setExamples(data.examples || [])
        setStats(data.stats || { total: 0, byFormat: {} })
      } catch (error) {
        console.error('Error fetching inspiration gallery:', error)
        setExamples([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchExamples()
  }, [selectedFormat])

  const handleUseAsInspiration = (example: InspirationExample) => {
    setSelectedExample(null)
    onSelectExample(example)
  }

  const getFormatCount = (format: AdFormat | 'all') => {
    if (format === 'all') return stats.total
    return stats.byFormat[format] || 0
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-bg-hover transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-400" />
              Inspiration Gallery
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Browse curated examples of winning ad formats
            </p>
          </div>
        </div>
      </div>

      {/* Format Tabs */}
      <div className="flex flex-wrap gap-2">
        {FORMAT_TABS.map((tab) => {
          const count = getFormatCount(tab.value)
          const isSelected = selectedFormat === tab.value
          const colors = tab.value !== 'all' ? AD_FORMAT_COLORS[tab.value as AdFormat] : null

          return (
            <button
              key={tab.value}
              onClick={() => setSelectedFormat(tab.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all',
                'border',
                isSelected
                  ? colors
                    ? `${colors.bg} ${colors.text} border-current`
                    : 'bg-white/10 text-white border-white/20'
                  : 'bg-bg-card text-zinc-400 border-border hover:bg-bg-hover hover:text-white'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'ml-2 px-1.5 py-0.5 rounded text-xs',
                  isSelected ? 'bg-white/20' : 'bg-zinc-800'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </div>
        </div>
      ) : examples.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
            {selectedFormat === 'all' ? (
              <Sparkles className="w-8 h-8 text-zinc-600" />
            ) : selectedFormat === 'ugc' || selectedFormat === 'testimonial' ? (
              <Film className="w-8 h-8 text-zinc-600" />
            ) : (
              <Image className="w-8 h-8 text-zinc-600" />
            )}
          </div>
          <p className="text-zinc-400 text-lg font-medium">
            No {selectedFormat === 'all' ? '' : AD_FORMAT_LABELS[selectedFormat as AdFormat]} examples yet
          </p>
          <p className="text-zinc-600 text-sm mt-1">
            Check back soon - we're adding new inspiration daily
          </p>
        </div>
      ) : (
        <div className="max-w-[1200px] mx-auto">
          <Masonry
            breakpointCols={breakpointColumns}
            className="flex -ml-6 w-auto"
            columnClassName="pl-6 bg-clip-padding"
          >
            {examples.map((example, index) => (
              <div key={example.id} className="mb-6">
                <InspirationCard
                  example={example}
                  index={index}
                  onClick={() => setSelectedExample(example)}
                />
              </div>
            ))}
          </Masonry>
        </div>
      )}

      {/* Modal */}
      {selectedExample && (
        <InspirationModal
          example={selectedExample}
          onClose={() => setSelectedExample(null)}
          onUseAsInspiration={handleUseAsInspiration}
        />
      )}
    </div>
  )
}
