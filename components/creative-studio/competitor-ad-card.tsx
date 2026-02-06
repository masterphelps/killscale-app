'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Play, Image, Film, Layers, Clock, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompetitorAd } from './types'

interface CompetitorAdCardProps {
  ad: CompetitorAd
  index: number
  onClick: () => void
}

export function CompetitorAdCard({ ad, index, onClick }: CompetitorAdCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const isTouchDevice = useRef(false)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }, [])

  // Intersection Observer for mobile scroll-to-play
  useEffect(() => {
    if (ad.mediaType !== 'video' || !isTouchDevice.current) return
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.6 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ad.mediaType])

  // Play/pause video on hover (desktop) or scroll (mobile)
  useEffect(() => {
    if (!videoRef.current || ad.mediaType !== 'video' || !ad.videoUrl) return

    const shouldPlay = isTouchDevice.current ? isInView : isHovered

    if (shouldPlay) {
      videoRef.current.play().catch(() => {})
      setVideoPlaying(true)
    } else {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setVideoPlaying(false)
    }
  }, [isHovered, isInView, ad.mediaType, ad.videoUrl])

  const thumbnailUrl = ad.videoThumbnail || ad.imageUrl || ad.carouselCards?.[0]?.imageUrl

  const getMediaTypeIcon = () => {
    switch (ad.mediaType) {
      case 'video':
        return <Film className="w-4 h-4 text-purple-400" />
      case 'carousel':
        return <Layers className="w-4 h-4 text-blue-400" />
      case 'image':
        return <Image className="w-4 h-4 text-blue-400" />
      default:
        return null
    }
  }

  const getDaysActiveBadgeColor = () => {
    if (ad.daysActive >= 90) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (ad.daysActive >= 30) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    if (ad.daysActive >= 7) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.03,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{
        y: -8,
        scale: 1.02,
        transition: { duration: 0.25, ease: 'easeOut' }
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl overflow-hidden cursor-pointer',
        'bg-bg-card border border-border transition-all duration-300',
        isHovered && 'shadow-[0_0_40px_rgba(255,255,255,0.05)] border-white/20',
        'group'
      )}
    >
      {/* Media Container - 4:3 aspect ratio */}
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
        {thumbnailUrl && !imageError ? (
          <>
            <motion.img
              src={thumbnailUrl}
              alt=""
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              initial={false}
              animate={{
                scale: isHovered ? 1.08 : 1,
                filter: isHovered ? 'brightness(0.85)' : 'brightness(1)'
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={cn(
                'w-full h-full object-cover',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />

            {/* Video overlay for playback */}
            {ad.mediaType === 'video' && ad.videoUrl && (
              <video
                ref={videoRef}
                src={ad.videoUrl}
                muted
                loop
                playsInline
                className={cn(
                  'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                  videoPlaying ? 'opacity-100' : 'opacity-0'
                )}
              />
            )}

            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
              {ad.mediaType === 'video' ? (
                <Play className="w-10 h-10 text-zinc-600 ml-1" />
              ) : (
                <Image className="w-10 h-10 text-zinc-600" />
              )}
            </div>
          </div>
        )}

        {/* Video Play Button Overlay */}
        {ad.mediaType === 'video' && !videoPlaying && imageLoaded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-md border border-white/20 shadow-lg">
              <Play className="w-6 h-6 text-white ml-1" fill="white" />
            </div>
          </motion.div>
        )}

        {/* Carousel indicator */}
        {ad.mediaType === 'carousel' && ad.carouselCards && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {ad.carouselCards.slice(0, 5).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/50" />
            ))}
            {ad.carouselCards.length > 5 && (
              <span className="text-[10px] text-white/70 ml-1">+{ad.carouselCards.length - 5}</span>
            )}
          </div>
        )}

        {/* Top-left: Media Type */}
        <div className="absolute top-3 left-3 z-10">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.03 + 0.2 }}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-black/70 backdrop-blur-md border border-white/10 shadow-lg"
          >
            {getMediaTypeIcon()}
          </motion.div>
        </div>

        {/* Top-right: Days Active Badge */}
        <div className="absolute top-3 right-3 z-10">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.03 + 0.2 }}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border',
              'bg-black/70 backdrop-blur-md',
              getDaysActiveBadgeColor()
            )}
          >
            <Clock className="w-3 h-3" />
            {ad.daysActive}d
          </motion.div>
        </div>

        {/* Active/Inactive status */}
        <div className="absolute bottom-3 left-3 z-10">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold',
            ad.isActive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
          )}>
            {ad.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-4 space-y-2">
        {/* Page name */}
        <div className="flex items-center gap-2">
          <Globe className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <span className="text-xs text-zinc-400 truncate">{ad.pageName}</span>
        </div>

        {/* Ad text preview */}
        {ad.body && (
          <p className="text-sm text-zinc-300 line-clamp-2">{ad.body}</p>
        )}

        {/* Headline */}
        {ad.headline && (
          <p className="text-xs text-zinc-500 font-medium truncate">{ad.headline}</p>
        )}

        {/* Platforms */}
        <div className="flex items-center gap-1 pt-1">
          {ad.platforms.slice(0, 3).map((platform) => (
            <span
              key={platform}
              className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase bg-zinc-800 text-zinc-500"
            >
              {platform === 'facebook' ? 'FB' : platform === 'instagram' ? 'IG' : platform.slice(0, 2)}
            </span>
          ))}
          {ad.collationCount > 1 && (
            <span className="text-[10px] text-zinc-600 ml-auto">
              {ad.collationCount} versions
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-white/5" />
    </motion.div>
  )
}
