'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Film } from 'lucide-react'
import { useEditorContext } from '../../contexts/editor-context'
import { ClipOverlay, OverlayType, Overlay } from '../../types'
import { VideoDetails } from '../overlay/video/video-details'
import { FPS } from '../advanced-timeline/constants'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Thumbnail card for a video clip on the timeline */
function ClipCard({
  clip,
  index,
  isSelected,
  onSelect,
}: {
  clip: ClipOverlay
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = 0.1
    el.pause()
  }, [])

  const durationSec = clip.durationInFrames / FPS
  const startSec = clip.from / FPS

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-lg overflow-hidden border transition-colors cursor-pointer ${
        isSelected
          ? 'border-purple-500 ring-1 ring-purple-500/40'
          : 'border-border hover:border-purple-500/50'
      }`}
    >
      <div className="aspect-video bg-bg-card">
        {clip.src ? (
          <video
            ref={videoRef}
            src={clip.src}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : clip.content ? (
          <img
            src={clip.content}
            alt={`Clip ${index + 1}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-7 h-7 text-zinc-600" />
          </div>
        )}
      </div>
      {/* Badge: clip number */}
      <div className="absolute top-1.5 left-1.5">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
          Clip {index + 1}
        </span>
      </div>
      {/* Badge: duration */}
      <div className="absolute top-1.5 right-1.5">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
          {formatTime(durationSec)}
        </span>
      </div>
      {/* Info row */}
      <div className="px-2 py-1.5 flex items-center justify-between">
        <p className="text-xs text-zinc-400 truncate">
          Track {clip.row + 1} &middot; {formatTime(startSec)}
        </p>
      </div>
    </div>
  )
}

export function VideoClipsPanel() {
  const {
    overlays,
    selectedOverlayId,
    setSelectedOverlayId,
    changeOverlay,
  } = useEditorContext()

  // Get all video clips from the project
  const videoClips = overlays.filter(
    (o): o is ClipOverlay => o.type === OverlayType.VIDEO
  )

  // Track the selected video overlay for the details panel
  const selectedClip =
    selectedOverlayId !== null
      ? videoClips.find((c) => c.id === selectedOverlayId)
      : null

  const [localOverlay, setLocalOverlay] = useState<ClipOverlay | null>(null)

  useEffect(() => {
    if (selectedClip) {
      setLocalOverlay(selectedClip)
    } else {
      setLocalOverlay(null)
    }
  }, [selectedClip])

  const handleUpdateOverlay = useCallback(
    (updated: Overlay) => {
      setLocalOverlay(updated as ClipOverlay)
      changeOverlay(updated.id, () => updated)
    },
    [changeOverlay]
  )

  // If a video clip is selected, show its details
  if (localOverlay) {
    return (
      <div className="flex flex-col h-full">
        <button
          onClick={() => setSelectedOverlayId(null)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-3 pt-3 pb-1 transition-colors"
        >
          <span>&larr;</span> All clips
        </button>
        <VideoDetails
          localOverlay={localOverlay}
          setLocalOverlay={handleUpdateOverlay}
        />
      </div>
    )
  }

  // Gallery of all video clips in the project
  return (
    <div className="p-3 space-y-3 flex flex-col h-full">
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-sm font-medium text-zinc-300">
          Project Clips
        </p>
        <span className="text-xs text-zinc-500">{videoClips.length} clip{videoClips.length !== 1 ? 's' : ''}</span>
      </div>

      {videoClips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <Film className="w-8 h-8 text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-500">No video clips</p>
          <p className="text-xs text-zinc-600 mt-1">
            Drag media from the Media panel onto the timeline
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5">
            {videoClips.map((clip, i) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                index={i}
                isSelected={selectedOverlayId === clip.id}
                onSelect={() => setSelectedOverlayId(clip.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
