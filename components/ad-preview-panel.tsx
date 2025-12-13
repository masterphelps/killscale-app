'use client'

import { useState } from 'react'
import { Play, Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Placement = 'facebook-feed' | 'instagram-feed' | 'instagram-stories'

interface Creative {
  preview: string
  type: 'image' | 'video'
}

interface AdPreviewPanelProps {
  creatives: Creative[]
  primaryText: string
  headline: string
  description: string
  websiteUrl: string
  ctaType: string
  pageName: string
  pageImageUrl?: string
  className?: string
}

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: 'Shop Now',
  LEARN_MORE: 'Learn More',
  SIGN_UP: 'Sign Up',
  SUBSCRIBE: 'Subscribe',
  CONTACT_US: 'Contact Us',
  GET_OFFER: 'Get Offer',
  GET_QUOTE: 'Get Quote',
  BOOK_NOW: 'Book Now',
  APPLY_NOW: 'Apply Now',
  DOWNLOAD: 'Download',
  WATCH_MORE: 'Watch More',
  SEE_MORE: 'See More',
  ORDER_NOW: 'Order Now',
}

const PLACEMENT_LABELS: Record<Placement, string> = {
  'facebook-feed': 'Facebook Feed',
  'instagram-feed': 'Instagram Feed',
  'instagram-stories': 'Stories',
}

export function AdPreviewPanel({
  creatives,
  primaryText,
  headline,
  description,
  websiteUrl,
  ctaType,
  pageName,
  pageImageUrl,
  className,
}: AdPreviewPanelProps) {
  const [placement, setPlacement] = useState<Placement>('facebook-feed')
  const [creativeIndex, setCreativeIndex] = useState(0)

  const currentCreative = creatives[creativeIndex]
  const ctaLabel = CTA_LABELS[ctaType] || ctaType || 'Learn More'

  // Safely parse URL for display
  const getDisplayUrl = (url: string): string => {
    if (!url) return 'WEBSITE.COM'
    try {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`
      return new URL(fullUrl).hostname.toUpperCase().replace('WWW.', '')
    } catch {
      // Invalid URL - just show what they typed (truncated)
      return url.replace(/^https?:\/\//, '').split('/')[0].toUpperCase().slice(0, 30) || 'WEBSITE.COM'
    }
  }
  const displayUrl = getDisplayUrl(websiteUrl)

  // Truncate text for preview
  const truncateText = (text: string, maxLength: number) => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trim() + '...'
  }

  const nextCreative = () => {
    setCreativeIndex((i) => (i + 1) % creatives.length)
  }

  const prevCreative = () => {
    setCreativeIndex((i) => (i - 1 + creatives.length) % creatives.length)
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Placement Tabs */}
      <div className="flex gap-1 mb-4 bg-bg-hover rounded-lg p-1">
        {(Object.keys(PLACEMENT_LABELS) as Placement[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlacement(p)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all',
              placement === p
                ? 'bg-bg-card text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-300'
            )}
          >
            {PLACEMENT_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Preview Container */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className={cn(
            'bg-white rounded-xl overflow-hidden shadow-2xl transition-all duration-300',
            placement === 'instagram-stories' ? 'w-[240px]' : 'w-full max-w-[320px]'
          )}
        >
          {placement === 'facebook-feed' && (
            <FacebookFeedPreview
              creative={currentCreative}
              primaryText={primaryText}
              headline={headline}
              description={description}
              displayUrl={displayUrl}
              ctaLabel={ctaLabel}
              pageName={pageName}
              pageImageUrl={pageImageUrl}
              truncateText={truncateText}
            />
          )}

          {placement === 'instagram-feed' && (
            <InstagramFeedPreview
              creative={currentCreative}
              primaryText={primaryText}
              pageName={pageName}
              pageImageUrl={pageImageUrl}
              truncateText={truncateText}
            />
          )}

          {placement === 'instagram-stories' && (
            <InstagramStoriesPreview
              creative={currentCreative}
              headline={headline}
              ctaLabel={ctaLabel}
              pageName={pageName}
              pageImageUrl={pageImageUrl}
            />
          )}
        </div>
      </div>

      {/* Creative Navigation */}
      {creatives.length > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={prevCreative}
            className="p-1.5 rounded-full bg-bg-hover hover:bg-bg-card transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-400">
            {creativeIndex + 1} / {creatives.length}
          </span>
          <button
            onClick={nextCreative}
            className="p-1.5 rounded-full bg-bg-hover hover:bg-bg-card transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty State */}
      {creatives.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-bg-card border border-border rounded-xl p-8 text-center max-w-[280px]">
            <div className="w-16 h-16 rounded-full bg-bg-hover flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-400">
              Add a creative to see your ad preview
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Facebook Feed Preview
function FacebookFeedPreview({
  creative,
  primaryText,
  headline,
  description,
  displayUrl,
  ctaLabel,
  pageName,
  pageImageUrl,
  truncateText,
}: {
  creative?: Creative
  primaryText: string
  headline: string
  description: string
  displayUrl: string
  ctaLabel: string
  pageName: string
  pageImageUrl?: string
  truncateText: (text: string, maxLength: number) => string
}) {
  return (
    <div className="text-black">
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
          {pageImageUrl ? (
            <img src={pageImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-sm font-bold">
              {pageName?.[0]?.toUpperCase() || 'P'}
            </span>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{pageName || 'Page Name'}</p>
          <p className="text-xs text-gray-500">Sponsored</p>
        </div>
        <MoreHorizontal className="w-5 h-5 text-gray-400" />
      </div>

      {/* Primary Text */}
      {primaryText && (
        <div className="px-3 pb-2">
          <p className="text-sm text-gray-900 leading-relaxed">
            {truncateText(primaryText, 125)}
            {primaryText.length > 125 && (
              <span className="text-gray-500 ml-1">See more</span>
            )}
          </p>
        </div>
      )}

      {/* Creative */}
      <div className="relative aspect-[1.91/1] bg-gray-100">
        {creative ? (
          <>
            <img
              src={creative.preview}
              alt=""
              className="w-full h-full object-cover"
            />
            {creative.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                  <Play className="w-7 h-7 text-gray-900 ml-1" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-400 text-sm">No creative selected</span>
          </div>
        )}
      </div>

      {/* Link Preview */}
      <div className="bg-gray-50 px-3 py-2.5 flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">{displayUrl}</p>
          <p className="text-[13px] font-semibold text-gray-900 truncate">
            {headline || 'Headline goes here'}
          </p>
          {description && (
            <p className="text-xs text-gray-500 truncate">{description}</p>
          )}
        </div>
        <button className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-semibold text-gray-900 flex-shrink-0 transition-colors">
          {ctaLabel}
        </button>
      </div>

      {/* Reactions Bar */}
      <div className="px-3 py-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-gray-500 text-sm">
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-white text-[10px]">+</span>
            </span>
            <span className="text-xs">Like</span>
          </span>
          <span className="text-xs">Comment</span>
          <span className="text-xs">Share</span>
        </div>
      </div>
    </div>
  )
}

// Instagram Feed Preview
function InstagramFeedPreview({
  creative,
  primaryText,
  pageName,
  pageImageUrl,
  truncateText,
}: {
  creative?: Creative
  primaryText: string
  pageName: string
  pageImageUrl?: string
  truncateText: (text: string, maxLength: number) => string
}) {
  return (
    <div className="text-black">
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-[2px]">
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {pageImageUrl ? (
                <img src={pageImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-600 text-xs font-bold">
                  {pageName?.[0]?.toUpperCase() || 'P'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{pageName?.toLowerCase().replace(/\s/g, '') || 'pagename'}</p>
          <p className="text-[10px] text-gray-500">Sponsored</p>
        </div>
        <MoreHorizontal className="w-5 h-5 text-gray-900" />
      </div>

      {/* Creative */}
      <div className="relative aspect-square bg-gray-100">
        {creative ? (
          <>
            <img
              src={creative.preview}
              alt=""
              className="w-full h-full object-cover"
            />
            {creative.type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                  <Play className="w-7 h-7 text-white ml-1" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-400 text-sm">No creative selected</span>
          </div>
        )}
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-4">
          <Heart className="w-6 h-6 text-gray-900" />
          <MessageCircle className="w-6 h-6 text-gray-900 scale-x-[-1]" />
          <Send className="w-6 h-6 text-gray-900 -rotate-45 -translate-y-0.5" />
        </div>
        <Bookmark className="w-6 h-6 text-gray-900" />
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm text-gray-900">
          <span className="font-semibold">{pageName?.toLowerCase().replace(/\s/g, '') || 'pagename'}</span>{' '}
          {truncateText(primaryText, 100)}
          {primaryText.length > 100 && (
            <span className="text-gray-500 ml-1">more</span>
          )}
        </p>
      </div>
    </div>
  )
}

// Instagram Stories Preview
function InstagramStoriesPreview({
  creative,
  headline,
  ctaLabel,
  pageName,
  pageImageUrl,
}: {
  creative?: Creative
  headline: string
  ctaLabel: string
  pageName: string
  pageImageUrl?: string
}) {
  return (
    <div className="relative aspect-[9/16] bg-gray-900 text-white overflow-hidden">
      {/* Progress Bar */}
      <div className="absolute top-2 left-2 right-2 flex gap-1 z-10">
        <div className="flex-1 h-0.5 bg-white/30 rounded-full">
          <div className="w-1/3 h-full bg-white rounded-full" />
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-6 left-3 right-3 flex items-center gap-2 z-10">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-[2px]">
          <div className="w-full h-full rounded-full bg-gray-900 p-[2px]">
            <div className="w-full h-full rounded-full bg-gray-600 flex items-center justify-center overflow-hidden">
              {pageImageUrl ? (
                <img src={pageImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xs font-bold">
                  {pageName?.[0]?.toUpperCase() || 'P'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold">{pageName?.toLowerCase().replace(/\s/g, '') || 'pagename'}</p>
          <p className="text-[10px] text-white/60">Sponsored</p>
        </div>
      </div>

      {/* Creative (Full Bleed) */}
      {creative ? (
        <>
          <img
            src={creative.preview}
            alt=""
            className="w-full h-full object-cover"
          />
          {creative.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-7 h-7 text-white ml-1" />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <span className="text-gray-500 text-sm">No creative</span>
        </div>
      )}

      {/* Bottom CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        {headline && (
          <p className="text-sm font-medium text-center mb-3 line-clamp-2">
            {headline}
          </p>
        )}
        <div className="flex items-center justify-center">
          <button className="px-6 py-2 bg-white text-black text-sm font-semibold rounded-full flex items-center gap-1">
            {ctaLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
