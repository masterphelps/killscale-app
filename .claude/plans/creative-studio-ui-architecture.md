# Creative Studio - UI Architecture & Component Specifications

## Overview

This document provides code-ready specifications for the Creative Studio feature - a stunning, media-rich gallery experience for analyzing ad creatives and media assets.

**Design Philosophy:** This is NOT a data table with thumbnails. This is a **media gallery with data**. Users should feel like they're browsing Netflix or Dribbble - but for their ads.

---

## Dependencies to Install

```bash
npm install framer-motion react-player react-masonry-css
```

**Package purposes:**
- `framer-motion` - Animations, shared element transitions, spring physics
- `react-player` - Full-featured video player with controls
- `react-masonry-css` - Pinterest-style masonry layout for mixed aspect ratios

---

## File Structure

```
app/dashboard/creative-studio/
├── page.tsx                    # Main page component
└── loading.tsx                 # Loading skeleton

components/creative-studio/
├── index.ts                    # Barrel export
├── types.ts                    # Shared TypeScript interfaces
├── creative-health-banner.tsx  # Top health score banner
├── view-toggle.tsx             # Gallery/Table view toggle
├── filter-bar.tsx              # Filters, sort, search
├── gallery-grid.tsx            # Gallery view container
├── media-gallery-card.tsx      # Individual gallery card (the hero component)
├── table-view.tsx              # Table view for power users
├── theater-modal.tsx           # Full-screen detail view
├── fatigue-trend-chart.tsx     # ROAS trend with decline visualization
├── period-comparison.tsx       # Early vs Recent metrics
├── audience-breakdown.tsx      # Per-adset performance table
├── copy-variations.tsx         # Copy performance table
├── skeleton-card.tsx           # Loading skeleton
├── empty-state.tsx             # No data states
└── starred-media-bar.tsx       # Floating bar for starred items
```

---

## TypeScript Interfaces

### `components/creative-studio/types.ts`

```typescript
export type MediaType = 'image' | 'video' | 'carousel' | 'dynamic'

export type FatigueStatus = 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued'

export type VerdictType = 'scale' | 'watch' | 'kill' | 'learn'

export interface CreativeItem {
  id: string
  creativeId: string
  thumbnailUrl: string | null
  mediaType: MediaType
  headline: string | null
  body: string | null

  // Metrics
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpm: number
  impressions: number
  clicks: number
  purchases: number

  // Relationships
  adCount: number
  adsetCount: number
  campaignCount: number
  audienceNames: string[]

  // Temporal
  firstSeen: string
  lastSeen: string
  daysActive: number

  // Fatigue
  fatigueScore: number
  fatigueStatus: FatigueStatus

  // Star state
  isStarred: boolean
}

export interface MediaItem {
  id: string
  mediaHash: string
  mediaType: 'image' | 'video'
  thumbnailUrl: string | null
  mediaName: string | null

  // Metrics
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpm: number

  // Relationships
  creativeCount: number
  adCount: number
  adsetCount: number
  campaignCount: number
  audienceNames: string[]

  // Best copy for this media
  topCopyVariations: CopyVariation[]

  // Temporal
  firstSeen: string
  lastSeen: string
  daysActive: number

  // Fatigue
  fatigueScore: number
  fatigueStatus: FatigueStatus

  // Star state
  isStarred: boolean
}

export interface CopyVariation {
  creativeId: string
  headline: string
  body: string
  spend: number
  revenue: number
  roas: number
}

export interface DailyMetrics {
  date: string
  spend: number
  revenue: number
  roas: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
}

export interface AudiencePerformance {
  adsetId: string
  adsetName: string
  spend: number
  revenue: number
  roas: number
  fatigueStatus: FatigueStatus
}

export interface CreativeHealthScore {
  score: number
  status: 'excellent' | 'good' | 'warning' | 'critical'
  factors: {
    diversity: { score: number; detail: string }
    fatigue: { score: number; detail: string }
    winnerHealth: { score: number; detail: string }
    freshPipeline: { score: number; detail: string }
  }
  recommendations: string[]
}

export interface DetailData {
  // Time series
  dailyData: DailyMetrics[]

  // Period comparison
  earlyPeriod: { roas: number; ctr: number; cpm: number }
  recentPeriod: { roas: number; ctr: number; cpm: number }

  // Breakdowns
  audiencePerformance: AudiencePerformance[]
  copyVariations: CopyVariation[]

  // Related ads
  ads: {
    adId: string
    adName: string
    adsetName: string
    campaignName: string
    status: string
    spend: number
    roas: number
  }[]
}
```

---

## Core Components

### 1. Media Gallery Card (The Hero Component)

This is the most important visual component - the card that makes users say "wow".

**File:** `components/creative-studio/media-gallery-card.tsx`

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Star, MoreHorizontal, TrendingUp, TrendingDown, AlertTriangle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CreativeItem, MediaItem, FatigueStatus } from './types'

interface MediaGalleryCardProps {
  item: CreativeItem | MediaItem
  type: 'creative' | 'media'
  index: number // For stagger animation
  onSelect: () => void
  onStar: () => void
  onMenuClick: () => void
}

// ROAS-based styling
const getROASStyles = (roas: number) => {
  if (roas >= 3) return {
    glow: 'shadow-[0_0_30px_rgba(34,197,94,0.25),0_0_60px_rgba(34,197,94,0.1)]',
    border: 'border-emerald-500/40',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: <TrendingUp className="w-3.5 h-3.5" />
  }
  if (roas >= 1.5) return {
    glow: 'shadow-[0_0_30px_rgba(234,179,8,0.2),0_0_60px_rgba(234,179,8,0.08)]',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: <TrendingUp className="w-3.5 h-3.5" />
  }
  return {
    glow: 'shadow-[0_0_30px_rgba(239,68,68,0.2),0_0_60px_rgba(239,68,68,0.08)]',
    border: 'border-red-500/30',
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <TrendingDown className="w-3.5 h-3.5" />
  }
}

// Fatigue status styling
const getFatigueStyles = (status: FatigueStatus) => {
  const styles = {
    fresh: { color: 'text-emerald-400', bg: 'bg-emerald-500', pulse: false },
    healthy: { color: 'text-lime-400', bg: 'bg-lime-500', pulse: false },
    warning: { color: 'text-amber-400', bg: 'bg-amber-500', pulse: true },
    fatiguing: { color: 'text-orange-400', bg: 'bg-orange-500', pulse: true },
    fatigued: { color: 'text-red-400', bg: 'bg-red-500', pulse: true },
  }
  return styles[status]
}

export function MediaGalleryCard({
  item,
  type,
  index,
  onSelect,
  onStar,
  onMenuClick
}: MediaGalleryCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const roasStyles = getROASStyles(item.roas)
  const fatigueStyles = getFatigueStyles(item.fatigueStatus)

  const isVideo = item.mediaType === 'video'
  const thumbnailUrl = item.thumbnailUrl

  // Format helpers
  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
    return `$${val.toFixed(0)}`
  }

  const formatROAS = (val: number) => `${val.toFixed(1)}x`

  // Video hover autoplay
  useEffect(() => {
    if (!videoRef.current || !isVideo) return

    if (isHovered) {
      videoRef.current.play().catch(() => {})
      setVideoPlaying(true)
    } else {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setVideoPlaying(false)
    }
  }, [isHovered, isVideo])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05, // Stagger effect
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{
        y: -8,
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onSelect}
      className={cn(
        'relative rounded-2xl overflow-hidden cursor-pointer',
        'bg-bg-card border transition-all duration-300',
        roasStyles.border,
        isHovered && roasStyles.glow,
        'group'
      )}
    >
      {/* Media Container */}
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
        {/* Thumbnail / Video */}
        {thumbnailUrl && !imageError ? (
          <>
            <img
              src={thumbnailUrl}
              alt=""
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={cn(
                'w-full h-full object-cover transition-all duration-500',
                imageLoaded ? 'opacity-100' : 'opacity-0',
                isHovered && 'scale-105'
              )}
            />

            {/* Video overlay - plays on hover */}
            {isVideo && (
              <video
                ref={videoRef}
                src={'sourceUrl' in item ? (item as any).sourceUrl : undefined}
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
        ) : (
          // Placeholder
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <Play className="w-12 h-12 text-zinc-600" />
          </div>
        )}

        {/* Video Play Button (when not playing) */}
        {isVideo && !videoPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ scale: 1 }}
              whileHover={{ scale: 1.1 }}
              className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20"
            >
              <Play className="w-7 h-7 text-white ml-1" fill="white" />
            </motion.div>
          </div>
        )}

        {/* Top-left: Fatigue Ring Badge */}
        <div className="absolute top-3 left-3">
          <div className={cn(
            'relative w-10 h-10 rounded-full flex items-center justify-center',
            'bg-black/60 backdrop-blur-sm border border-white/10',
            fatigueStyles.pulse && 'animate-pulse'
          )}>
            {/* Circular progress ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-zinc-700"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${item.fatigueScore * 0.94} 100`}
                strokeLinecap="round"
                className={fatigueStyles.color}
              />
            </svg>
            <span className={cn('text-[10px] font-bold', fatigueStyles.color)}>
              {item.fatigueScore.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Top-right: Media Type Badge */}
        <div className="absolute top-3 right-3">
          <span className={cn(
            'px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide',
            'bg-black/60 backdrop-blur-sm border border-white/10 text-white'
          )}>
            {item.mediaType}
          </span>
        </div>

        {/* Bottom: Glassmorphism Stats Overlay */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'absolute bottom-0 left-0 right-0 p-4',
                'bg-black/70 backdrop-blur-md',
                'border-t border-white/10'
              )}
            >
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-400 text-xs">Revenue</span>
                  <div className="text-white font-semibold font-mono">
                    {formatCurrency(item.revenue)}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-400 text-xs">Spend</span>
                  <div className="text-white font-semibold font-mono">
                    {formatCurrency(item.spend)}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-white/10 text-xs text-zinc-400">
                {item.adCount} ads across {item.adsetCount} audiences
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Card Footer - Always Visible */}
      <div className="p-4 space-y-3">
        {/* ROAS Badge + Headline */}
        <div className="flex items-start justify-between gap-3">
          <div className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border',
            roasStyles.badge
          )}>
            {roasStyles.icon}
            <span className="font-bold font-mono">{formatROAS(item.roas)}</span>
          </div>

          <span className="text-zinc-300 font-medium">{formatCurrency(item.spend)}</span>
        </div>

        {/* Copy Preview (Creative) or Copy Count (Media) */}
        {'headline' in item && item.headline ? (
          <p className="text-sm text-zinc-400 line-clamp-2">
            "{item.headline}"
          </p>
        ) : (
          'creativeCount' in item && (
            <p className="text-sm text-zinc-500">
              {(item as MediaItem).creativeCount} copy variations
            </p>
          )
        )}

        {/* Bottom Row: Stats + Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{item.adCount} ads</span>
            <span>·</span>
            <span>{item.adsetCount} sets</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Star Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); onStar() }}
              className={cn(
                'p-2 rounded-lg transition-colors',
                item.isStarred
                  ? 'text-amber-400 bg-amber-500/20'
                  : 'text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'
              )}
            >
              <Star className="w-4 h-4" fill={item.isStarred ? 'currentColor' : 'none'} />
            </motion.button>

            {/* More Menu */}
            <button
              onClick={(e) => { e.stopPropagation(); onMenuClick() }}
              className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-bg-hover transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
```

---

### 2. Gallery Grid Container

**File:** `components/creative-studio/gallery-grid.tsx`

```tsx
'use client'

import { motion } from 'framer-motion'
import Masonry from 'react-masonry-css'
import { MediaGalleryCard } from './media-gallery-card'
import { SkeletonCard } from './skeleton-card'
import { EmptyState } from './empty-state'
import type { CreativeItem, MediaItem } from './types'

interface GalleryGridProps {
  items: (CreativeItem | MediaItem)[]
  type: 'creative' | 'media'
  isLoading: boolean
  onSelect: (id: string) => void
  onStar: (id: string) => void
  onMenu: (id: string, e: React.MouseEvent) => void
}

const breakpointColumns = {
  default: 4,
  1536: 4,  // 2xl
  1280: 3,  // xl
  1024: 3,  // lg
  768: 2,   // md
  640: 1,   // sm
}

export function GalleryGrid({
  items,
  type,
  isLoading,
  onSelect,
  onStar,
  onMenu
}: GalleryGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState type={type} />
  }

  return (
    <Masonry
      breakpointCols={breakpointColumns}
      className="flex -ml-6 w-auto"
      columnClassName="pl-6 bg-clip-padding"
    >
      {items.map((item, index) => (
        <div key={item.id} className="mb-6">
          <MediaGalleryCard
            item={item}
            type={type}
            index={index}
            onSelect={() => onSelect(item.id)}
            onStar={() => onStar(item.id)}
            onMenuClick={() => onMenu(item.id, {} as React.MouseEvent)}
          />
        </div>
      ))}
    </Masonry>
  )
}
```

---

### 3. Skeleton Loading Card

**File:** `components/creative-studio/skeleton-card.tsx`

```tsx
'use client'

import { motion } from 'framer-motion'

interface SkeletonCardProps {
  index: number
}

export function SkeletonCard({ index }: SkeletonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl overflow-hidden bg-bg-card border border-border"
    >
      {/* Media skeleton */}
      <div className="aspect-[4/3] bg-gradient-to-br from-zinc-800 to-zinc-900 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Content skeleton */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-7 w-20 rounded-lg bg-zinc-800 animate-pulse" />
          <div className="h-5 w-16 rounded bg-zinc-800 animate-pulse" />
        </div>
        <div className="h-4 w-3/4 rounded bg-zinc-800 animate-pulse" />
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
          <div className="flex gap-1">
            <div className="h-8 w-8 rounded-lg bg-zinc-800 animate-pulse" />
            <div className="h-8 w-8 rounded-lg bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
```

---

### 4. Creative Health Banner

**File:** `components/creative-studio/creative-health-banner.tsx`

```tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Zap, Layers, Activity, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CreativeHealthScore } from './types'

interface CreativeHealthBannerProps {
  score: CreativeHealthScore | null
  isLoading: boolean
}

const getScoreColor = (score: number) => {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 70) return 'text-lime-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

const getScoreGradient = (score: number) => {
  if (score >= 90) return 'from-emerald-500/20'
  if (score >= 70) return 'from-lime-500/20'
  if (score >= 50) return 'from-amber-500/20'
  return 'from-red-500/20'
}

const factorIcons = {
  diversity: Layers,
  fatigue: Activity,
  winnerHealth: Zap,
  freshPipeline: Clock,
}

export function CreativeHealthBanner({ score, isLoading }: CreativeHealthBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (isLoading || !score) {
    return (
      <div className="rounded-2xl p-5 bg-bg-card border border-border animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-zinc-800 rounded" />
          <div className="h-10 w-20 bg-zinc-800 rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      layout
      className={cn(
        'relative rounded-2xl overflow-hidden',
        'bg-bg-card border border-indigo-500/20',
        'before:absolute before:inset-0 before:bg-gradient-to-br before:to-transparent before:pointer-events-none',
        getScoreGradient(score.score)
      )}
    >
      {/* Main Row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-5 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-400" />
            <span className="text-sm text-zinc-400">Creative Health</span>
          </div>

          <div className={cn(
            'px-3 py-1 rounded-full border font-bold text-lg font-mono',
            score.score >= 70
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : score.score >= 50
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
          )}>
            {score.score}/100
          </div>

          <span className={cn(
            'text-sm font-medium uppercase tracking-wide',
            getScoreColor(score.score)
          )}>
            {score.status}
          </span>
        </div>

        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-zinc-400" />
        </motion.div>
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border pt-4">
              {/* Factor Breakdown */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {Object.entries(score.factors).map(([key, factor]) => {
                  const Icon = factorIcons[key as keyof typeof factorIcons]
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Icon className="w-4 h-4" />
                        <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${factor.score}%` }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className={cn(
                              'h-full rounded-full',
                              factor.score >= 70 ? 'bg-emerald-500' :
                              factor.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            )}
                          />
                        </div>
                        <span className="text-sm font-mono text-white w-8">
                          {factor.score}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">{factor.detail}</p>
                    </div>
                  )
                })}
              </div>

              {/* Recommendations */}
              {score.recommendations.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-zinc-500 mb-2">Top Recommendations:</p>
                  <ul className="space-y-1">
                    {score.recommendations.slice(0, 3).map((rec, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                        <span className="text-indigo-400">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

---

### 5. Theater Modal (Detail View)

**File:** `components/creative-studio/theater-modal.tsx`

```tsx
'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactPlayer from 'react-player'
import { X, Star, Rocket, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FatigueTrendChart } from './fatigue-trend-chart'
import { PeriodComparison } from './period-comparison'
import { AudienceBreakdown } from './audience-breakdown'
import { CopyVariations } from './copy-variations'
import type { CreativeItem, MediaItem, DetailData, FatigueStatus } from './types'

interface TheaterModalProps {
  item: CreativeItem | MediaItem | null
  type: 'creative' | 'media'
  detailData: DetailData | null
  isOpen: boolean
  isLoading: boolean
  onClose: () => void
  onStar: () => void
  onBuildAds: () => void
}

const getFatigueStatusLabel = (status: FatigueStatus) => {
  const labels = {
    fresh: 'Fresh - Keep scaling',
    healthy: 'Healthy - Performing well',
    warning: 'Warning - Monitor closely',
    fatiguing: 'Fatiguing - Prepare replacement',
    fatigued: 'Fatigued - Replace immediately',
  }
  return labels[status]
}

const getFatigueColor = (status: FatigueStatus) => {
  const colors = {
    fresh: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    healthy: 'text-lime-400 bg-lime-500/20 border-lime-500/30',
    warning: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
    fatiguing: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    fatigued: 'text-red-400 bg-red-500/20 border-red-500/30',
  }
  return colors[status]
}

export function TheaterModal({
  item,
  type,
  detailData,
  isOpen,
  isLoading,
  onClose,
  onStar,
  onBuildAds,
}: TheaterModalProps) {
  const [videoPlaying, setVideoPlaying] = useState(true)

  // Escape key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === ' ') {
      e.preventDefault()
      setVideoPlaying(p => !p)
    }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!item) return null

  const isVideo = item.mediaType === 'video'
  const formatCurrency = (val: number) => val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(0)}`

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="fixed inset-4 lg:inset-8 z-50 flex flex-col bg-bg-sidebar rounded-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                {'headline' in item && item.headline && (
                  <span className="text-lg font-medium text-white truncate max-w-md">
                    "{item.headline}"
                  </span>
                )}
                {'mediaName' in item && item.mediaName && (
                  <span className="text-lg font-medium text-white truncate max-w-md">
                    {item.mediaName}
                  </span>
                )}
                <span className="text-sm text-zinc-500">
                  {item.mediaType.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onStar}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                    item.isStarred
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-bg-hover text-zinc-400 hover:text-amber-400'
                  )}
                >
                  <Star className="w-4 h-4" fill={item.isStarred ? 'currentColor' : 'none'} />
                  <span className="text-sm font-medium">
                    {item.isStarred ? 'Starred' : 'Star'}
                  </span>
                </button>

                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-bg-hover transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 lg:p-8 space-y-8">
                {/* Top Section: Media + Stats */}
                <div className="grid lg:grid-cols-2 gap-8">
                  {/* Media Player */}
                  <div className="aspect-video bg-black rounded-xl overflow-hidden">
                    {isVideo ? (
                      <ReactPlayer
                        url={'sourceUrl' in item ? (item as any).sourceUrl : item.thumbnailUrl}
                        playing={videoPlaying}
                        controls
                        width="100%"
                        height="100%"
                        onPlay={() => setVideoPlaying(true)}
                        onPause={() => setVideoPlaying(false)}
                      />
                    ) : (
                      <img
                        src={item.thumbnailUrl || ''}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>

                  {/* Stats Panel */}
                  <div className="space-y-6">
                    {/* Fatigue Status */}
                    <div className={cn(
                      'p-4 rounded-xl border',
                      getFatigueColor(item.fatigueStatus)
                    )}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium uppercase tracking-wide">
                          Fatigue Status
                        </span>
                        <span className="font-bold font-mono text-xl">
                          {item.fatigueScore.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-black/30 rounded-full overflow-hidden mb-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.fatigueScore}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full bg-current rounded-full"
                        />
                      </div>
                      <p className="text-sm opacity-80">
                        {getFatigueStatusLabel(item.fatigueStatus)}
                      </p>
                    </div>

                    {/* Metric Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Spend', value: formatCurrency(item.spend) },
                        { label: 'Revenue', value: formatCurrency(item.revenue) },
                        { label: 'ROAS', value: `${item.roas.toFixed(1)}x` },
                        { label: 'Ads', value: item.adCount.toString() },
                        { label: 'Ad Sets', value: item.adsetCount.toString() },
                        { label: 'CTR', value: `${item.ctr.toFixed(2)}%` },
                      ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-xl bg-bg-card border border-border">
                          <span className="text-xs text-zinc-500">{stat.label}</span>
                          <div className="text-xl font-bold font-mono text-white mt-1">
                            {stat.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fatigue Trend Chart */}
                {detailData && (
                  <div className="rounded-xl bg-bg-card border border-border p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Fatigue Trend</h3>
                    <FatigueTrendChart dailyData={detailData.dailyData} />
                  </div>
                )}

                {/* Period Comparison */}
                {detailData && (
                  <PeriodComparison
                    early={detailData.earlyPeriod}
                    recent={detailData.recentPeriod}
                  />
                )}

                {/* Audience Breakdown */}
                {detailData && detailData.audiencePerformance.length > 0 && (
                  <AudienceBreakdown audiences={detailData.audiencePerformance} />
                )}

                {/* Copy Variations (Media only) */}
                {type === 'media' && detailData && detailData.copyVariations.length > 0 && (
                  <CopyVariations variations={detailData.copyVariations} />
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-border bg-bg-card">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onStar}
                  className={cn(
                    'flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors',
                    item.isStarred
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-bg-hover text-white hover:bg-bg-hover/80'
                  )}
                >
                  <Star className="w-5 h-5" fill={item.isStarred ? 'currentColor' : 'none'} />
                  {item.isStarred ? 'Starred' : 'Star This ' + (type === 'creative' ? 'Creative' : 'Media')}
                </button>

                <button
                  onClick={onBuildAds}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
                >
                  <Rocket className="w-5 h-5" />
                  Build New Ads
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### 6. Fatigue Trend Chart

**File:** `components/creative-studio/fatigue-trend-chart.tsx`

```tsx
'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { DailyMetrics } from './types'

interface FatigueTrendChartProps {
  dailyData: DailyMetrics[]
}

export function FatigueTrendChart({ dailyData }: FatigueTrendChartProps) {
  // Calculate 7-day moving average
  const dataWithMA = useMemo(() => {
    return dailyData.map((d, i, arr) => ({
      ...d,
      ma7: i >= 6
        ? arr.slice(i - 6, i + 1).reduce((sum, x) => sum + x.roas, 0) / 7
        : null,
    }))
  }, [dailyData])

  // Find peak ROAS
  const peakROAS = useMemo(() => {
    return Math.max(...dailyData.map(d => d.roas))
  }, [dailyData])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={dataWithMA} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

        <XAxis
          dataKey="date"
          stroke="#3f3f46"
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />

        <YAxis
          stroke="#3f3f46"
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          tickFormatter={(v) => `${v.toFixed(1)}x`}
        />

        {/* Peak reference line */}
        <ReferenceLine
          y={peakROAS}
          stroke="#22c55e"
          strokeDasharray="5 5"
          label={{
            value: `Peak: ${peakROAS.toFixed(1)}x`,
            fill: '#22c55e',
            fontSize: 11,
            position: 'right',
          }}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: 8,
          }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const data = payload[0]?.payload
            return (
              <div className="bg-bg-card border border-border rounded-lg p-3 text-sm shadow-xl">
                <div className="text-zinc-400 mb-2">
                  {new Date(label).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-purple-400">ROAS</span>
                    <span className="font-mono font-medium text-white">
                      {data?.roas?.toFixed(2)}x
                    </span>
                  </div>
                  {data?.ma7 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-amber-400">7-day Avg</span>
                      <span className="font-mono font-medium text-white">
                        {data.ma7.toFixed(2)}x
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">Spend</span>
                    <span className="font-mono text-zinc-300">
                      ${data?.spend?.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">CTR</span>
                    <span className="font-mono text-zinc-300">
                      {data?.ctr?.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )
          }}
        />

        {/* Daily ROAS line */}
        <Line
          type="monotone"
          dataKey="roas"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
          name="Daily ROAS"
        />

        {/* 7-day moving average */}
        <Line
          type="monotone"
          dataKey="ma7"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          name="7-day Avg"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

---

### 7. Period Comparison

**File:** `components/creative-studio/period-comparison.tsx`

```tsx
'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PeriodComparisonProps {
  early: { roas: number; ctr: number; cpm: number }
  recent: { roas: number; ctr: number; cpm: number }
}

export function PeriodComparison({ early, recent }: PeriodComparisonProps) {
  const calcChange = (oldVal: number, newVal: number) => {
    if (oldVal === 0) return 0
    return ((newVal - oldVal) / oldVal) * 100
  }

  const metrics = [
    {
      label: 'ROAS',
      early: early.roas,
      recent: recent.roas,
      format: (v: number) => `${v.toFixed(1)}x`,
      goodDirection: 'up' as const,
    },
    {
      label: 'CTR',
      early: early.ctr,
      recent: recent.ctr,
      format: (v: number) => `${v.toFixed(2)}%`,
      goodDirection: 'up' as const,
    },
    {
      label: 'CPM',
      early: early.cpm,
      recent: recent.cpm,
      format: (v: number) => `$${v.toFixed(2)}`,
      goodDirection: 'down' as const,
    },
  ]

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Early Period */}
      <div className="rounded-xl bg-bg-card border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-sm text-zinc-400 font-medium">
            EARLY (First 7 days)
          </span>
        </div>
        <div className="space-y-3">
          {metrics.map((m) => (
            <div key={m.label} className="flex justify-between">
              <span className="text-zinc-500">{m.label}</span>
              <span className="font-mono font-medium text-white">
                {m.format(m.early)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Period */}
      <div className="rounded-xl bg-bg-card border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-sm text-zinc-400 font-medium">
            RECENT (Last 7 days)
          </span>
        </div>
        <div className="space-y-3">
          {metrics.map((m) => {
            const change = calcChange(m.early, m.recent)
            const isGood = m.goodDirection === 'up' ? change > 0 : change < 0
            return (
              <div key={m.label} className="flex justify-between items-center">
                <span className="text-zinc-500">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-white">
                    {m.format(m.recent)}
                  </span>
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      'flex items-center gap-1 text-sm font-medium',
                      isGood ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {isGood ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(change).toFixed(0)}%
                  </motion.span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

---

## Main Page Component

**File:** `app/dashboard/creative-studio/page.tsx`

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, List, Filter, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useAccount } from '@/lib/account-context'
import { CreativeHealthBanner } from '@/components/creative-studio/creative-health-banner'
import { GalleryGrid } from '@/components/creative-studio/gallery-grid'
import { TableView } from '@/components/creative-studio/table-view'
import { TheaterModal } from '@/components/creative-studio/theater-modal'
import { StarredMediaBar } from '@/components/creative-studio/starred-media-bar'
import type { CreativeItem, MediaItem, CreativeHealthScore, DetailData } from '@/components/creative-studio/types'

type ViewMode = 'gallery' | 'table'
type TabType = 'creatives' | 'media'
type SortOption = 'roas' | 'spend' | 'revenue' | 'fatigue'

export default function CreativeStudioPage() {
  // Auth & Account
  const { user } = useAuth()
  const { selectedAccount } = useAccount()

  // View state
  const [activeTab, setActiveTab] = useState<TabType>('creatives')
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [sortBy, setSortBy] = useState<SortOption>('roas')
  const [searchQuery, setSearchQuery] = useState('')

  // Data state
  const [creatives, setCreatives] = useState<CreativeItem[]>([])
  const [media, setMedia] = useState<MediaItem[]>([])
  const [healthScore, setHealthScore] = useState<CreativeHealthScore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Modal state
  const [selectedItem, setSelectedItem] = useState<CreativeItem | MediaItem | null>(null)
  const [detailData, setDetailData] = useState<DetailData | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // Starred items
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())

  // Load data
  const loadData = useCallback(async () => {
    if (!user || !selectedAccount) return
    setIsLoading(true)

    try {
      const [creativesRes, mediaRes, healthRes] = await Promise.all([
        fetch(`/api/creative-studio/creatives?userId=${user.id}&adAccountId=${selectedAccount.id}`),
        fetch(`/api/creative-studio/media?userId=${user.id}&adAccountId=${selectedAccount.id}`),
        fetch(`/api/creative-studio/health?userId=${user.id}&adAccountId=${selectedAccount.id}`),
      ])

      if (creativesRes.ok) {
        const data = await creativesRes.json()
        setCreatives(data.creatives)
      }
      if (mediaRes.ok) {
        const data = await mediaRes.json()
        setMedia(data.media)
      }
      if (healthRes.ok) {
        const data = await healthRes.json()
        setHealthScore(data)
      }
    } catch (error) {
      console.error('Failed to load creative studio data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user, selectedAccount])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Load detail data when item selected
  const loadDetailData = useCallback(async (itemId: string, type: TabType) => {
    if (!user || !selectedAccount) return
    setIsDetailLoading(true)

    try {
      const res = await fetch(
        `/api/creative-studio/detail?type=${type}&id=${itemId}&userId=${user.id}&adAccountId=${selectedAccount.id}`
      )
      if (res.ok) {
        const data = await res.json()
        setDetailData(data)
      }
    } catch (error) {
      console.error('Failed to load detail data:', error)
    } finally {
      setIsDetailLoading(false)
    }
  }, [user, selectedAccount])

  // Handlers
  const handleSelect = useCallback((id: string) => {
    const items = activeTab === 'creatives' ? creatives : media
    const item = items.find(i => i.id === id)
    if (item) {
      setSelectedItem(item)
      loadDetailData(id, activeTab)
    }
  }, [activeTab, creatives, media, loadDetailData])

  const handleStar = useCallback(async (id: string) => {
    const newStarred = new Set(starredIds)
    if (newStarred.has(id)) {
      newStarred.delete(id)
    } else {
      newStarred.add(id)
    }
    setStarredIds(newStarred)

    // TODO: API call to persist starred state
  }, [starredIds])

  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null)
    setDetailData(null)
  }, [])

  const handleBuildAds = useCallback(() => {
    // TODO: Navigate to launch wizard with pre-selected media
    console.log('Build ads from:', selectedItem)
  }, [selectedItem])

  // Filter & sort items
  const currentItems = activeTab === 'creatives' ? creatives : media
  const filteredItems = currentItems
    .filter(item => {
      if (!searchQuery) return true
      const searchLower = searchQuery.toLowerCase()
      if ('headline' in item && item.headline) {
        return item.headline.toLowerCase().includes(searchLower)
      }
      if ('mediaName' in item && item.mediaName) {
        return item.mediaName.toLowerCase().includes(searchLower)
      }
      return false
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'roas': return b.roas - a.roas
        case 'spend': return b.spend - a.spend
        case 'revenue': return b.revenue - a.revenue
        case 'fatigue': return b.fatigueScore - a.fatigueScore
        default: return 0
      }
    })
    .map(item => ({ ...item, isStarred: starredIds.has(item.id) }))

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Creative Studio</h1>
            <p className="text-zinc-500 mt-1">
              Analyze creative performance and build from your winners
            </p>
          </div>
        </div>

        {/* Health Score Banner */}
        <CreativeHealthBanner score={healthScore} isLoading={isLoading} />

        {/* Controls Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-xl">
            {(['creatives', 'media'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  activeTab === tab
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-bg-hover'
                )}
              >
                {tab === 'creatives' ? 'Creatives' : 'Media'}
              </button>
            ))}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className={cn(
                  'w-48 lg:w-64 bg-bg-card border border-border rounded-lg pl-10 pr-4 py-2',
                  'text-sm text-white placeholder:text-zinc-600',
                  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50'
                )}
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={cn(
                'bg-bg-card border border-border rounded-lg px-3 py-2',
                'text-sm text-white',
                'focus:outline-none focus:border-accent'
              )}
            >
              <option value="roas">Sort: ROAS</option>
              <option value="spend">Sort: Spend</option>
              <option value="revenue">Sort: Revenue</option>
              <option value="fatigue">Sort: Fatigue</option>
            </select>

            {/* View Toggle */}
            <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
              <button
                onClick={() => setViewMode('gallery')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'gallery'
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'table'
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {viewMode === 'gallery' ? (
          <GalleryGrid
            items={filteredItems}
            type={activeTab}
            isLoading={isLoading}
            onSelect={handleSelect}
            onStar={handleStar}
            onMenu={(id) => console.log('Menu:', id)}
          />
        ) : (
          <TableView
            items={filteredItems}
            type={activeTab}
            isLoading={isLoading}
            onSelect={handleSelect}
            onStar={handleStar}
          />
        )}
      </div>

      {/* Starred Media Bar */}
      <StarredMediaBar
        starredCount={starredIds.size}
        onBuildAds={() => console.log('Build from starred')}
        onClear={() => setStarredIds(new Set())}
      />

      {/* Theater Modal */}
      <TheaterModal
        item={selectedItem}
        type={activeTab}
        detailData={detailData}
        isOpen={!!selectedItem}
        isLoading={isDetailLoading}
        onClose={handleCloseDetail}
        onStar={() => selectedItem && handleStar(selectedItem.id)}
        onBuildAds={handleBuildAds}
      />
    </div>
  )
}
```

---

## Summary

This UI architecture provides:

1. **Stunning Gallery Cards** with:
   - ROAS-based glow effects (green/yellow/red)
   - Video hover autoplay
   - Glassmorphism stats overlay
   - Fatigue ring indicator
   - Star animation

2. **Theater Mode Detail View** with:
   - Large video player (ReactPlayer)
   - Fatigue trend chart
   - Period comparison
   - Audience breakdown
   - Copy variations

3. **Smooth Animations** via Framer Motion:
   - Staggered card entry
   - Hover effects with spring physics
   - Modal transitions
   - Number count-up animations

4. **Responsive Design**:
   - Mobile-first approach
   - Masonry layout for mixed aspect ratios
   - Full-width cards on mobile

5. **Performance Optimizations**:
   - Lazy video loading
   - Intersection Observer for hover-to-play
   - Skeleton loading states
