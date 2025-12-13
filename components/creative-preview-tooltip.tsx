'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Video, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreativePreviewTooltipProps {
  previewUrl?: string
  mediaType?: 'image' | 'video' | 'unknown'
  alt: string
  children: React.ReactNode
  onFullPreview?: () => void
}

export function CreativePreviewTooltip({
  previewUrl,
  mediaType,
  alt,
  children,
  onFullPreview
}: CreativePreviewTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const clearTimeouts = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    clearTimeouts()

    // Calculate position relative to viewport
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tooltipWidth = 220
    const tooltipHeight = 240
    const padding = 8

    // Default position: to the right of the element
    let x = rect.right + padding
    let y = rect.top - 20

    // If tooltip would go off the right edge, show it on the left
    if (x + tooltipWidth > window.innerWidth - padding) {
      x = rect.left - tooltipWidth - padding
    }

    // If tooltip would go off the bottom, adjust up
    if (y + tooltipHeight > window.innerHeight - padding) {
      y = window.innerHeight - tooltipHeight - padding
    }

    // If tooltip would go off the top, adjust down
    if (y < padding) {
      y = padding
    }

    setPosition({ x, y })

    // Delay showing tooltip by 200ms
    showTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true)
    }, 200)
  }

  const handleMouseLeave = () => {
    clearTimeouts()
    // Delay hiding to allow mouse to move to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 150)
  }

  const handleTooltipMouseEnter = () => {
    // Cancel the hide timeout when entering tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  const handleTooltipMouseLeave = () => {
    // Hide when leaving tooltip
    clearTimeouts()
    setShowTooltip(false)
  }

  const handleClick = () => {
    clearTimeouts()
    setShowTooltip(false)
    onFullPreview?.()
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => clearTimeouts()
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={cn(
          "cursor-pointer",
          onFullPreview && "hover:ring-2 hover:ring-accent/50 rounded-lg transition-all"
        )}
      >
        {children}
      </div>

      {/* Tooltip */}
      {showTooltip && previewUrl && (
        <div
          ref={tooltipRef}
          className="fixed z-50"
          style={{
            left: position.x,
            top: position.y,
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          onClick={handleClick}
        >
          <div className="w-[200px] h-[200px] bg-bg-card border border-border rounded-xl shadow-xl overflow-hidden cursor-pointer hover:border-accent/50 transition-colors">
            {previewUrl ? (
              <div className="relative w-full h-full">
                <img
                  src={previewUrl}
                  alt={alt}
                  className="w-full h-full object-cover"
                />
                {/* Video overlay */}
                {mediaType === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-black ml-1" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-bg-hover">
                {mediaType === 'video' ? (
                  <Video className="w-12 h-12 text-zinc-600" />
                ) : (
                  <ImageIcon className="w-12 h-12 text-zinc-600" />
                )}
              </div>
            )}
          </div>
          {/* Click hint */}
          <div className="mt-2 text-center text-xs text-zinc-400">
            Click to expand
          </div>
        </div>
      )}
    </>
  )
}
