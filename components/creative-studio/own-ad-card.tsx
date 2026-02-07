'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Play, Image, Film, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OwnAd } from './types'

interface OwnAdCardProps {
  ad: OwnAd
  index: number
  onClick: () => void
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-600'
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 25) return 'text-orange-400'
  return 'text-red-400'
}

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

export function OwnAdCard({ ad, index, onClick }: OwnAdCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
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
    if (!videoRef.current || ad.mediaType !== 'video') return
    const shouldPlay = isTouchDevice.current ? isInView : isHovered

    if (shouldPlay) {
      videoRef.current.play().catch(() => {})
      setVideoPlaying(true)
    } else {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setVideoPlaying(false)
    }
  }, [isHovered, isInView, ad.mediaType])

  const thumbnailUrl = ad.storageUrl || ad.thumbnailUrl || ad.imageUrl

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
            {ad.mediaType === 'video' && ad.storageUrl && (
              <video
                ref={videoRef}
                src={ad.storageUrl}
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

        {/* Top-left: Media Type */}
        <div className="absolute top-3 left-3 z-10">
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-black/70 backdrop-blur-md border border-white/10 shadow-lg">
            {ad.mediaType === 'video' ? (
              <Film className="w-4 h-4 text-purple-400" />
            ) : (
              <Image className="w-4 h-4 text-blue-400" />
            )}
          </div>
        </div>

        {/* Top-right: ROAS Badge */}
        {ad.roas > 0 && (
          <div className="absolute top-3 right-3 z-10">
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border',
              'bg-black/70 backdrop-blur-md',
              ad.roas >= 3 ? 'text-emerald-400 border-emerald-500/30' :
              ad.roas >= 1.5 ? 'text-amber-400 border-amber-500/30' :
              'text-red-400 border-red-500/30'
            )}>
              <DollarSign className="w-3 h-3" />
              {ad.roas.toFixed(1)}x
            </div>
          </div>
        )}

        {/* Bottom: Status */}
        <div className="absolute bottom-3 left-3 z-10">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold',
            ad.status === 'ACTIVE'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
          )}>
            {ad.status === 'ACTIVE' ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-4 space-y-2">
        {/* Ad name */}
        <p className="text-sm text-white font-medium truncate">{ad.ad_name}</p>

        {/* Campaign name */}
        <p className="text-xs text-zinc-500 truncate">{ad.campaign_name}</p>

        {/* Score pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {ad.hookScore !== null && (
            <span className={cn('text-[10px] font-semibold', getScoreColor(ad.hookScore))}>
              H:{ad.hookScore}
            </span>
          )}
          {ad.holdScore !== null && (
            <span className={cn('text-[10px] font-semibold', getScoreColor(ad.holdScore))}>
              Hd:{ad.holdScore}
            </span>
          )}
          {ad.clickScore !== null && (
            <span className={cn('text-[10px] font-semibold', getScoreColor(ad.clickScore))}>
              Cl:{ad.clickScore}
            </span>
          )}
          {ad.convertScore !== null && (
            <span className={cn('text-[10px] font-semibold', getScoreColor(ad.convertScore))}>
              Cv:{ad.convertScore}
            </span>
          )}
        </div>

        {/* Spend */}
        <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
          <span>Spend: {formatCurrency(ad.spend)}</span>
          {ad.revenue > 0 && <span>Rev: {formatCurrency(ad.revenue)}</span>}
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-white/5" />
    </motion.div>
  )
}
