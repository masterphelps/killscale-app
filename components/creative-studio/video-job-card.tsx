'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Play, CheckCircle, AlertCircle, Clock, Film, Pencil } from 'lucide-react'
import type { VideoJob } from '@/remotion/types'

interface VideoJobCardProps {
  job: VideoJob
  onEdit?: (jobId: string) => void
  onSaveToLibrary?: (jobId: string) => void
  compact?: boolean
}

export function VideoJobCard({ job, onEdit, onSaveToLibrary, compact }: VideoJobCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const videoUrl = job.final_video_url || job.raw_video_url

  const statusConfig = {
    queued: { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Queued' },
    generating: { icon: Loader2, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Generating...' },
    rendering: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Rendering overlay...' },
    complete: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Complete' },
    failed: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
  }

  const config = statusConfig[job.status] || statusConfig.queued
  const StatusIcon = config.icon

  const handlePlayToggle = () => {
    if (!videoRef.current || !videoUrl) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-bg-card border border-border rounded-lg">
        <div className={`p-1.5 rounded ${config.bg}`}>
          <StatusIcon className={`w-4 h-4 ${config.color} ${job.status === 'generating' || job.status === 'rendering' ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate capitalize">{job.video_style.replace(/_/g, ' ')}</div>
          <div className="text-xs text-zinc-500">{config.label}{job.status === 'generating' ? ` · ${job.progress_pct}%` : ''}</div>
        </div>
        {job.status === 'complete' && videoUrl && (
          <button onClick={handlePlayToggle} className="p-1.5 rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
            <Play className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Video preview / status area */}
      <div className="relative aspect-[9/16] max-h-[400px] bg-zinc-900 flex items-center justify-center">
        {job.status === 'complete' && videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover"
              loop
              playsInline
              muted
              poster={job.thumbnail_url || undefined}
              onEnded={() => setIsPlaying(false)}
            />
            {!isPlaying && (
              <button
                onClick={handlePlayToggle}
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors"
              >
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-6 h-6 text-white ml-1" fill="white" />
                </div>
              </button>
            )}
          </>
        ) : job.status === 'failed' ? (
          <div className="text-center p-6">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-400">{job.error_message || 'Generation failed'}</p>
          </div>
        ) : (
          <div className="text-center p-6">
            <Loader2 className="w-10 h-10 text-purple-400 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-zinc-400 mb-2">{config.label}</p>
            {job.progress_pct > 0 && (
              <div className="w-48 mx-auto">
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${job.progress_pct}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">{job.progress_pct}%</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-white capitalize">{job.video_style.replace(/_/g, ' ')}</span>
          </div>
          <span className="text-xs text-zinc-500">{job.duration_seconds}s</span>
        </div>
        <p className="text-xs text-zinc-400 line-clamp-2 mb-3">{job.prompt.slice(0, 120)}...</p>

        {job.status === 'complete' && (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(job.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors border border-purple-500/20"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Video
              </button>
            )}
            {onSaveToLibrary && (
              <button
                onClick={() => onSaveToLibrary(job.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors border border-emerald-500/20"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Save to Library
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
