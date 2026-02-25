'use client'

import { useState, useEffect } from 'react'
import { Upload, Loader2, Film, ImageIcon } from 'lucide-react'

interface MediaItem {
  id: string
  name: string
  mediaType: 'VIDEO' | 'IMAGE'
  thumbnailUrl?: string
  storageUrl?: string
  width?: number
  height?: number
  fileSize?: number
}

interface MediaPanelProps {
  userId: string
  adAccountId: string
  onAddMedia: (item: MediaItem) => void
  onUpload?: () => void
}

type TypeFilter = 'all' | 'video' | 'image'
type MediaTab = 'media' | 'collections'

export function MediaPanel({ userId, adAccountId, onAddMedia, onUpload }: MediaPanelProps) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [activeTab, setActiveTab] = useState<MediaTab>('media')

  useEffect(() => {
    loadMedia()
  }, [userId, adAccountId])

  const loadMedia = async () => {
    if (!userId || !adAccountId) return
    setIsLoading(true)
    try {
      const cleanAccountId = adAccountId.replace(/^act_/, '')
      const res = await fetch(`/api/creative-studio/media?userId=${userId}&adAccountId=${cleanAccountId}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.assets || [])
      }
    } catch (e) {
      console.error('Failed to load media:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (typeFilter === 'video') return item.mediaType === 'VIDEO'
    if (typeFilter === 'image') return item.mediaType === 'IMAGE'
    return true
  })

  return (
    <div className="p-3 space-y-3">
      <div className="flex rounded-lg bg-white/5 p-1">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'media' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
        >
          Media
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'collections' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
        >
          Collections
        </button>
      </div>

      {activeTab === 'media' && (
        <>
          <div className="flex items-center gap-2">
            {onUpload && (
              <button onClick={onUpload} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {(['all', 'video', 'image'] as TypeFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setTypeFilter(filter)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors capitalize ${
                  typeFilter === filter ? 'bg-purple-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Videos' : 'Images'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : filteredItems.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">No media found</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAddMedia(item)}
                  className="relative rounded-lg overflow-hidden border border-white/10 hover:border-purple-500/50 transition-colors group text-left"
                >
                  <div className="aspect-[4/3] bg-zinc-900">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.mediaType === 'VIDEO' ? <Film className="w-6 h-6 text-zinc-600" /> : <ImageIcon className="w-6 h-6 text-zinc-600" />}
                      </div>
                    )}
                  </div>
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
                      {item.mediaType === 'VIDEO' ? '\uD83C\uDFAC' : '\uD83D\uDDBC'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate px-1.5 py-1">{item.name}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'collections' && (
        <div className="text-xs text-zinc-500 text-center py-8">
          Collections will appear here.
        </div>
      )}
    </div>
  )
}
