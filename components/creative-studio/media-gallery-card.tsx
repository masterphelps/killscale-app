'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Star, MoreHorizontal, Image, Film, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StudioAsset, FatigueStatus } from './types'

interface MediaGalleryCardProps {
  item: StudioAsset
  index: number
  onSelect: () => void
  onStar?: () => void
  onMenuClick?: (e: React.MouseEvent) => void
  videoSourceUrl?: string
  onRequestVideoSource?: () => void
  customMetrics?: { label: string; value: string }[]
  subtitle?: string
  rankBadge?: number
  textContent?: string
}

// Score-based glow styling — uses hook score for videos, click score for images
const getScoreStyles = (score: number | null) => {
  if (score === null) return null
  if (score >= 75) {
    return {
      glow: 'shadow-[0_0_40px_rgba(34,197,94,0.3),0_0_80px_rgba(34,197,94,0.15),0_0_120px_rgba(34,197,94,0.05)]',
      border: 'border-emerald-500/50',
      text: 'text-emerald-400',
      label: 'Excellent',
    }
  }
  if (score >= 50) {
    return {
      glow: 'shadow-[0_0_40px_rgba(234,179,8,0.25),0_0_80px_rgba(234,179,8,0.12),0_0_120px_rgba(234,179,8,0.04)]',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      label: 'Good',
    }
  }
  if (score >= 25) {
    return {
      glow: 'shadow-[0_0_40px_rgba(249,115,22,0.25),0_0_80px_rgba(249,115,22,0.12),0_0_120px_rgba(249,115,22,0.04)]',
      border: 'border-orange-500/40',
      text: 'text-orange-400',
      label: 'Average',
    }
  }
  return {
    glow: 'shadow-[0_0_40px_rgba(239,68,68,0.25),0_0_80px_rgba(239,68,68,0.12),0_0_120px_rgba(239,68,68,0.04)]',
    border: 'border-red-500/40',
    text: 'text-red-400',
    label: 'Weak',
  }
}

// Fatigue status styling
const getFatigueStyles = (status: FatigueStatus) => {
  const styles: Record<FatigueStatus, { color: string; stroke: string; pulse: boolean; label: string }> = {
    fresh: { color: 'text-emerald-400', stroke: 'stroke-emerald-500', pulse: false, label: 'Fresh' },
    healthy: { color: 'text-lime-400', stroke: 'stroke-lime-500', pulse: false, label: 'Healthy' },
    warning: { color: 'text-amber-400', stroke: 'stroke-amber-500', pulse: true, label: 'Warning' },
    fatiguing: { color: 'text-orange-400', stroke: 'stroke-orange-500', pulse: true, label: 'Fatiguing' },
    fatigued: { color: 'text-red-400', stroke: 'stroke-red-500', pulse: true, label: 'Fatigued' },
  }
  return styles[status]
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function MediaGalleryCard({
  item,
  index,
  onSelect,
  onStar,
  onMenuClick,
  videoSourceUrl,
  onRequestVideoSource,
  customMetrics,
  subtitle,
  rankBadge,
  textContent,
}: MediaGalleryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isStarAnimating, setIsStarAnimating] = useState(false)
  const [showFatigueTooltip, setShowFatigueTooltip] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const hasPerf = item.hasPerformanceData
  const isVideo = item.mediaType === 'video'
  const fatigueStyles = hasPerf ? getFatigueStyles(item.fatigueStatus) : null

  // Glow based on convertScore (ROAS-based) since revenue is the primary metric
  const scoreStyles = hasPerf ? getScoreStyles(item.convertScore) : null

  const storageUrl = item.storageUrl || null
  const thumbnailUrl = item.imageUrl || item.thumbnailUrl

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
    return `$${val.toFixed(0)}`
  }

  const effectiveVideoSource = storageUrl && isVideo ? storageUrl : videoSourceUrl

  // Detect touch device (mobile) for scroll-to-play vs hover-to-play
  const isTouchDevice = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }, [])

  // Request video source on hover (desktop) or when scrolled into view (mobile)
  const hasRequestedSource = useRef(false)
  useEffect(() => {
    const shouldRequest = isTouchDevice.current ? isInView : isHovered
    if (shouldRequest && isVideo && !effectiveVideoSource && !hasRequestedSource.current && onRequestVideoSource) {
      hasRequestedSource.current = true
      onRequestVideoSource()
    }
  }, [isHovered, isInView, isVideo, effectiveVideoSource, onRequestVideoSource])

  // Intersection Observer — scroll-to-play on mobile
  useEffect(() => {
    if (!isVideo || !isTouchDevice.current) return
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.6 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isVideo])

  // Play/pause logic — hover on desktop, scroll visibility on mobile
  useEffect(() => {
    if (!videoRef.current || !isVideo || !effectiveVideoSource) return

    const shouldPlay = isTouchDevice.current ? isInView : isHovered

    if (shouldPlay) {
      videoRef.current.play().catch(() => {})
      setVideoPlaying(true)
    } else {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setVideoPlaying(false)
    }
  }, [isHovered, isInView, isVideo, effectiveVideoSource])

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onStar) return
    setIsStarAnimating(true)
    onStar()
    setTimeout(() => setIsStarAnimating(false), 400)
  }

  const circumference = 2 * Math.PI * 15
  const fatigueProgress = hasPerf ? (item.fatigueScore / 100) * circumference : 0

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{
        y: -8,
        scale: 1.02,
        transition: { duration: 0.25, ease: 'easeOut' }
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onSelect}
      className={cn(
        'relative rounded-2xl overflow-hidden cursor-pointer',
        'bg-bg-card border transition-all duration-300',
        hasPerf && scoreStyles ? scoreStyles.border : 'border-border',
        hasPerf && isHovered && scoreStyles ? scoreStyles.glow : !hasPerf && isHovered && 'shadow-[0_0_40px_rgba(255,255,255,0.05)]',
        'group'
      )}
    >
      {/* Media Container - 4:3 aspect ratio (hidden for copy-only cards) */}
      {!textContent && <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
        {(storageUrl || thumbnailUrl) && !imageError ? (
          <>
            {isVideo && storageUrl && !thumbnailUrl ? (
              // Video with storage URL but no thumbnail — only option is <video> as poster
              <motion.div
                initial={false}
                animate={{
                  scale: isHovered ? 1.08 : 1,
                  filter: isHovered ? 'brightness(0.85)' : 'brightness(1)'
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-full h-full"
              >
                <video
                  ref={videoRef}
                  src={`${storageUrl}#t=0.3`}
                  muted
                  loop
                  playsInline
                  preload="auto"
                  onLoadedData={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                  className={cn(
                    'w-full h-full object-cover',
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </motion.div>
            ) : (
              // <img> as reliable poster frame + <video> overlay for playback
              // Mobile browsers throttle video loading, so <img> ensures thumbnails always show
              <>
                <motion.img
                  src={isVideo ? thumbnailUrl! : (storageUrl || thumbnailUrl!)}
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

                {isVideo && effectiveVideoSource && (
                  <video
                    ref={videoRef}
                    src={effectiveVideoSource}
                    muted
                    loop
                    playsInline
                    className={cn(
                      'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                      videoPlaying ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                )}
              </>
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
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
                {isVideo ? (
                  <Play className="w-10 h-10 text-zinc-600 ml-1" />
                ) : (
                  <Image className="w-10 h-10 text-zinc-600" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video Play Button Overlay */}
        <AnimatePresence>
          {isVideo && !videoPlaying && imageLoaded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center',
                  'bg-black/60 backdrop-blur-md',
                  'border border-white/20',
                  'shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                )}
              >
                <Play className="w-7 h-7 text-white ml-1" fill="white" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top-left: Rank Badge OR Fatigue Ring Badge (with perf data) OR Media Type Icon (no data) */}
        <div className="absolute top-3 left-3 z-10">
          {rankBadge ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg',
                'bg-gradient-to-br shadow-lg border',
                rankBadge === 1 ? 'from-amber-400 to-yellow-500 text-black border-amber-300' :
                rankBadge === 2 ? 'from-zinc-300 to-zinc-400 text-black border-zinc-200' :
                rankBadge === 3 ? 'from-orange-400 to-orange-600 text-white border-orange-300' :
                'from-zinc-600 to-zinc-700 text-white border-zinc-500'
              )}
            >
              {rankBadge}
            </motion.div>
          ) : hasPerf && fatigueStyles ? (
            <div
              className="relative"
              onMouseEnter={() => setShowFatigueTooltip(true)}
              onMouseLeave={() => setShowFatigueTooltip(false)}
            >
              <motion.div
                animate={fatigueStyles.pulse ? { scale: [1, 1.05, 1] } : {}}
                transition={fatigueStyles.pulse ? { duration: 2, repeat: Infinity } : {}}
                className={cn(
                  'relative w-11 h-11 rounded-full flex items-center justify-center',
                  'bg-black/70 backdrop-blur-md border border-white/10',
                  'shadow-lg'
                )}
              >
                <svg
                  className="absolute inset-0 w-full h-full -rotate-90"
                  viewBox="0 0 44 44"
                >
                  <circle cx="22" cy="22" r="15" fill="none" strokeWidth="2.5" className="stroke-zinc-700" />
                  <motion.circle
                    cx="22" cy="22" r="15" fill="none" strokeWidth="2.5" strokeLinecap="round"
                    className={fatigueStyles.stroke}
                    initial={{ strokeDasharray: `0 ${circumference}` }}
                    animate={{ strokeDasharray: `${fatigueProgress} ${circumference}` }}
                    transition={{ duration: 1, delay: index * 0.05 + 0.3, ease: 'easeOut' }}
                  />
                </svg>
                <span className={cn('text-[11px] font-bold tabular-nums', fatigueStyles.color)}>
                  {item.fatigueScore.toFixed(0)}
                </span>
              </motion.div>

              {/* Fatigue tooltip */}
              <AnimatePresence>
                {showFatigueTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-2 z-30 w-48 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl p-3 pointer-events-none"
                  >
                    <p className="text-[11px] font-semibold text-white mb-1.5">Creative Fatigue</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('text-sm font-bold', fatigueStyles.color)}>{item.fatigueScore.toFixed(0)}</span>
                      <span className={cn('text-xs font-medium', fatigueStyles.color)}>{fatigueStyles.label}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-700 mb-2">
                      <div
                        className={cn('h-full rounded-full', {
                          'bg-red-500': item.fatigueScore >= 80,
                          'bg-orange-500': item.fatigueScore >= 60 && item.fatigueScore < 80,
                          'bg-amber-500': item.fatigueScore >= 40 && item.fatigueScore < 60,
                          'bg-lime-500': item.fatigueScore >= 20 && item.fatigueScore < 40,
                          'bg-emerald-500': item.fatigueScore < 20,
                        })}
                        style={{ width: `${item.fatigueScore}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Lower is better. Rises as your audience sees the ad repeatedly and engagement declines.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 + 0.2 }}
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center',
                'bg-black/70 backdrop-blur-md border border-white/10',
                'shadow-lg'
              )}
            >
              {isVideo ? (
                <Film className="w-4 h-4 text-purple-400" />
              ) : (
                <Image className="w-4 h-4 text-blue-400" />
              )}
            </motion.div>
          )}
        </div>

        {/* Top-right: Media Type Badge */}
        <div className="absolute top-3 right-3 z-10">
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 + 0.2 }}
            className={cn(
              'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider',
              'bg-black/70 backdrop-blur-md border border-white/10 text-white',
              'shadow-lg'
            )}
          >
            {item.mediaType}
          </motion.span>
        </div>

      </div>}

      {/* Card Footer */}
      <div className="p-4 space-y-3">
        {hasPerf ? (
          <>
            {/* Text content (for Best Copy page) - show more lines when no media */}
            {textContent && (
              <div className="min-h-[120px]">
                <div className="flex items-start gap-3 mb-3">
                  {rankBadge && (
                    <div className={cn(
                      'flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm',
                      'bg-gradient-to-br shadow-lg border',
                      rankBadge === 1 ? 'from-amber-400 to-yellow-500 text-black border-amber-300' :
                      rankBadge === 2 ? 'from-zinc-300 to-zinc-400 text-black border-zinc-200' :
                      rankBadge === 3 ? 'from-orange-400 to-orange-600 text-white border-orange-300' :
                      'from-zinc-600 to-zinc-700 text-white border-zinc-500'
                    )}>
                      {rankBadge}
                    </div>
                  )}
                  {item.name && (
                    <h3 className="text-base font-semibold text-white leading-tight">{item.name}</h3>
                  )}
                </div>
                <p className="text-sm text-zinc-400 line-clamp-6 leading-relaxed">{textContent}</p>
              </div>
            )}

            {/* Name and subtitle */}
            {(item.name || subtitle) && !textContent && (
              <div className="space-y-0.5">
                {item.name && (
                  <p className="text-sm font-medium text-white truncate">{item.name}</p>
                )}
                {subtitle && (
                  <p className="text-xs text-zinc-500 truncate">{subtitle}</p>
                )}
              </div>
            )}

            {/* Revenue — large and prominent in green */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                  {formatCurrency(item.revenue)}
                </span>
                <span className="text-xs text-zinc-500 font-medium">Revenue</span>
              </div>

              <span className="text-xs text-zinc-500 font-mono">
                {formatCurrency(item.spend)} spent
              </span>
            </div>

            {/* Metrics row: Custom metrics OR default (Thumbstop/Hold or CTR/CPC) */}
            <div className={cn('grid gap-2', customMetrics && customMetrics.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {customMetrics ? (
                customMetrics.map((metric, i) => (
                  <div key={i}>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{metric.label}</div>
                    <div className="text-xs font-mono text-zinc-300">{metric.value}</div>
                  </div>
                ))
              ) : item.thumbstopRate !== null && item.thumbstopRate !== undefined ? (
                <>
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Thumbstop</div>
                    <div className="text-xs font-mono text-zinc-300">{item.thumbstopRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Hold</div>
                    <div className="text-xs font-mono text-zinc-300">{item.holdRate !== null ? `${item.holdRate.toFixed(1)}%` : '\u2014'}</div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide">CTR</div>
                    <div className="text-xs font-mono text-zinc-300">{item.ctr.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide">CPC</div>
                    <div className="text-xs font-mono text-zinc-300">${item.cpc.toFixed(2)}</div>
                  </div>
                </>
              )}
            </div>

            {/* Composite score pills — always show all 4, grey when null */}
            <div className="flex flex-wrap gap-1.5">
              <ScorePill label="Hook" value={item.hookScore} />
              <ScorePill label="Hold" value={item.holdScore} />
              <ScorePill label="Click" value={item.clickScore} />
              <ScorePill label="Conv" value={item.convertScore} />
            </div>
          </>
        ) : (
          <>
            {/* No performance data — show metadata */}
            {item.name && (
              <p className="text-sm font-medium text-white truncate">{item.name}</p>
            )}
            <p className="text-sm text-zinc-500">Not used in any ads</p>
            <div className="flex items-center gap-2 text-xs">
              {item.width && item.height && (
                <span className="text-zinc-500">{item.width} x {item.height}</span>
              )}
              {item.fileSize && (
                <span className="text-zinc-500">{formatFileSize(item.fileSize)}</span>
              )}
            </div>
            {item.syncedAt && (
              <p className="text-xs text-zinc-600">
                Synced {new Date(item.syncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}
          </>
        )}

        {/* Bottom Row: Stats + AI Analysis indicator + Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {hasPerf ? (
              <>
                <span>{item.adCount} ads</span>
                <span className="text-zinc-700">|</span>
                <span>{item.adsetCount} sets</span>
              </>
            ) : (
              <>
                <span>{item.adCount} ads</span>
                <span className="text-zinc-700">|</span>
                <span>{item.campaignCount} campaigns</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* AI Analysis indicator (videos only) - grey when not analyzed, purple when complete */}
            {isVideo && (
              <div
                title={item.analysisStatus === 'complete' ? 'AI Analysis available' : 'No AI analysis yet'}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  item.analysisStatus === 'complete'
                    ? 'text-purple-400 bg-purple-500/20'
                    : 'text-zinc-600 bg-transparent'
                )}
              >
                <Sparkles className="w-4 h-4" />
              </div>
            )}

            {onStar && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                animate={isStarAnimating ? {
                  scale: [1, 1.3, 1],
                  rotate: [0, 10, -10, 0]
                } : {}}
                transition={{ duration: 0.4 }}
                onClick={handleStarClick}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200',
                  item.isStarred
                    ? 'text-amber-400 bg-amber-500/20'
                    : 'text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'
                )}
              >
                <Star
                  className="w-4 h-4"
                  fill={item.isStarred ? 'currentColor' : 'none'}
                  strokeWidth={item.isStarred ? 0 : 2}
                />
              </motion.button>
            )}

            {onMenuClick && (
              <button
                onClick={(e) => { e.stopPropagation(); onMenuClick(e) }}
                className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-bg-hover transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-white/5" />
    </motion.div>
  )
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  const color = value === null
    ? 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20'
    : value >= 75
    ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
    : value >= 50
    ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
    : value >= 25
    ? 'text-orange-400 bg-orange-500/15 border-orange-500/30'
    : 'text-red-400 bg-red-500/15 border-red-500/30'

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
      color
    )}>
      {label} {value !== null ? value : '—'}
    </span>
  )
}
