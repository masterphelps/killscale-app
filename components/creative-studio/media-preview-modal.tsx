'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Pencil, Rocket, Trash2, Film } from 'lucide-react'
import type { StudioAsset } from './types'

interface MediaPreviewModalProps {
  item: StudioAsset | null
  isOpen: boolean
  onClose: () => void
  onDelete?: () => void
  onBuildNewAds?: () => void
  videoSource?: string | null
  mode: 'media' | 'collection' | 'project'
}

export function MediaPreviewModal({
  item,
  isOpen,
  onClose,
  onDelete,
  onBuildNewAds,
  videoSource,
  mode,
}: MediaPreviewModalProps) {
  const router = useRouter()

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!item) return null

  const isVideo = item.mediaType === 'video'
  const storageUrl = item.storageUrl || null
  const displayUrl = storageUrl || item.imageUrl || item.thumbnailUrl
  const resolvedVideoSource = isVideo ? (videoSource || storageUrl) : null

  const handleDownload = () => {
    const url = resolvedVideoSource || displayUrl
    if (!url) return
    const ext = isVideo ? 'mp4' : 'png'
    const fname = `${(item.name || 'media').replace(/[^a-zA-Z0-9-_ ]/g, '')}.${ext}`
    const downloadUrl = `/api/creative-studio/download-video?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fname)}`
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = fname
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleEdit = () => {
    onClose()
    if (isVideo) {
      if (item.sourceCompositionId) {
        router.push(`/dashboard/creative-studio/video-editor?compositionId=${item.sourceCompositionId}&from=media`)
      } else if (item.sourceJobId) {
        router.push(`/dashboard/creative-studio/video-editor?jobId=${item.sourceJobId}&from=media`)
      } else if (resolvedVideoSource) {
        router.push(`/dashboard/creative-studio/video-editor?videoUrl=${encodeURIComponent(resolvedVideoSource)}&from=media`)
      }
    } else if (displayUrl) {
      router.push(`/dashboard/creative-studio/image-editor?imageUrl=${encodeURIComponent(displayUrl)}`)
    }
  }

  const showDownload = mode !== 'project' && !!(resolvedVideoSource || displayUrl)
  const showEdit = true
  const showCreateAd = mode !== 'project'
  const showDelete = !!onDelete

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col bg-bg-card rounded-2xl border border-zinc-700/50 shadow-2xl overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors z-10"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Media */}
            <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden">
              {isVideo ? (
                resolvedVideoSource ? (
                  <video
                    src={resolvedVideoSource}
                    controls
                    playsInline
                    autoPlay
                    poster={(!storageUrl && displayUrl) ? displayUrl : undefined}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                ) : displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={item.name || 'Video thumbnail'}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
                    No preview available
                  </div>
                )
              ) : (
                <img
                  src={displayUrl || '/placeholder-image.png'}
                  alt={item.name || 'Image'}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )}
            </div>

            {/* Footer with name + actions */}
            <div className="px-4 py-3 border-t border-zinc-700/50 flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-300 truncate min-w-0">
                {item.name || 'Untitled'}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {showDownload && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                )}

                {showEdit && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/20 hover:bg-purple-500/30 transition-colors"
                  >
                    {isVideo ? <Film className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                    Edit
                  </button>
                )}

                {showCreateAd && onBuildNewAds && (
                  <button
                    onClick={onBuildNewAds}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 border border-orange-500/20 hover:bg-orange-500/30 transition-colors"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    Create Ad
                  </button>
                )}

                {showDelete && (
                  <button
                    onClick={() => { onDelete!(); onClose() }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
