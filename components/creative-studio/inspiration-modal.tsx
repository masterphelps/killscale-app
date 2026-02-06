'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Pause, ChevronLeft, ChevronRight, Clock, Globe, Copy, Check, Sparkles, Layers, Volume2, VolumeX, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InspirationExample } from './types'
import { AD_FORMAT_LABELS, AD_FORMAT_COLORS } from './types'

interface InspirationModalProps {
  example: InspirationExample
  onClose: () => void
  onUseAsInspiration: (example: InspirationExample, selectedCarouselIndex?: number) => void
}

export function InspirationModal({ example, onClose, onUseAsInspiration }: InspirationModalProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [copiedBody, setCopiedBody] = useState(false)
  const [copiedHeadline, setCopiedHeadline] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

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

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

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

  const nextCarouselSlide = () => {
    if (!example.carouselCards) return
    setCarouselIndex((prev) => (prev + 1) % example.carouselCards!.length)
  }

  const prevCarouselSlide = () => {
    if (!example.carouselCards) return
    setCarouselIndex((prev) => (prev - 1 + example.carouselCards!.length) % example.carouselCards!.length)
  }

  const mediaUrl = example.mediaType === 'video'
    ? example.videoUrl
    : example.mediaType === 'carousel' && example.carouselCards
    ? example.carouselCards[carouselIndex]?.imageUrl
    : example.imageUrl

  const getDaysActiveBadgeColor = () => {
    if (example.daysActive >= 90) return 'bg-emerald-500/20 text-emerald-400'
    if (example.daysActive >= 30) return 'bg-amber-500/20 text-amber-400'
    if (example.daysActive >= 7) return 'bg-orange-500/20 text-orange-400'
    return 'bg-zinc-500/20 text-zinc-400'
  }

  const formatColors = AD_FORMAT_COLORS[example.adFormat]

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
            {example.mediaType === 'video' && mediaUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  muted={isMuted}
                  loop
                  playsInline
                  className="max-w-full max-h-[50vh] lg:max-h-[80vh] object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <button
                    onClick={togglePlay}
                    className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>
                  <button
                    onClick={toggleMute}
                    className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>
              </>
            ) : example.mediaType === 'carousel' && example.carouselCards ? (
              <>
                {example.carouselCards[carouselIndex]?.imageUrl && (
                  <img
                    src={example.carouselCards[carouselIndex].imageUrl!}
                    alt=""
                    className="max-w-full max-h-[50vh] lg:max-h-[80vh] object-contain"
                  />
                )}
                <button
                  onClick={prevCarouselSlide}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextCarouselSlide}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {example.carouselCards.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCarouselIndex(i)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        i === carouselIndex ? 'bg-white' : 'bg-white/40'
                      )}
                    />
                  ))}
                </div>
              </>
            ) : mediaUrl ? (
              <img
                src={mediaUrl}
                alt=""
                className="max-w-full max-h-[50vh] lg:max-h-[80vh] object-contain"
              />
            ) : (
              <div className="flex items-center justify-center text-zinc-500">
                <Layers className="w-12 h-12" />
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="lg:w-1/2 flex flex-col max-h-[50vh] lg:max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4 flex-1">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-white">{example.pageName}</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <span className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    formatColors.bg,
                    formatColors.text
                  )}>
                    {AD_FORMAT_LABELS[example.adFormat]}
                  </span>
                  <span className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                    getDaysActiveBadgeColor()
                  )}>
                    <Clock className="w-3 h-3" />
                    {example.daysActive} days
                  </span>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-1 rounded text-xs font-medium bg-accent/20 text-accent">
                  {example.mediaType}
                </span>
                {example.industryCategory && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-zinc-800 text-zinc-400">
                    <Tag className="w-3 h-3" />
                    {example.industryCategory}
                  </span>
                )}
                {example.isFeatured && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                    Featured
                  </span>
                )}
              </div>

              {/* Why this works (description) */}
              {example.description && (
                <div className="space-y-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-xs text-emerald-400 uppercase tracking-wide font-medium">Why This Works</span>
                  <p className="text-sm text-zinc-300">{example.description}</p>
                </div>
              )}

              {/* Ad Copy */}
              {example.body && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Primary Text</span>
                    <button
                      onClick={() => copyToClipboard(example.body!, 'body')}
                      className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedBody ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{example.body}</p>
                </div>
              )}

              {example.headline && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">Headline</span>
                    <button
                      onClick={() => copyToClipboard(example.headline!, 'headline')}
                      className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedHeadline ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-white font-medium">{example.headline}</p>
                </div>
              )}

              {/* Carousel cards (if carousel) */}
              {example.mediaType === 'carousel' && example.carouselCards && example.carouselCards[carouselIndex] && (
                <div className="pt-4 border-t border-border space-y-2">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">
                    Card {carouselIndex + 1} of {example.carouselCards.length}
                  </span>
                  {example.carouselCards[carouselIndex].headline && (
                    <p className="text-sm text-white font-medium">{example.carouselCards[carouselIndex].headline}</p>
                  )}
                  {example.carouselCards[carouselIndex].body && (
                    <p className="text-sm text-zinc-400">{example.carouselCards[carouselIndex].body}</p>
                  )}
                </div>
              )}
            </div>

            {/* CTA Button */}
            <div className="p-6 border-t border-border bg-bg-dark/50">
              <button
                onClick={() => onUseAsInspiration(example, example.mediaType === 'carousel' ? carouselIndex : undefined)}
                className="w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Sparkles className="w-5 h-5" />
                {example.mediaType === 'carousel' && example.carouselCards
                  ? `Use Card ${carouselIndex + 1} as Inspiration`
                  : 'Use as Inspiration'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
