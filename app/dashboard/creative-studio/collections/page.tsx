'use client'

import { useState, useEffect, useCallback } from 'react'
import { FolderOpen, Plus, Trash2, Pencil, X, Loader2, Image, Film, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import Link from 'next/link'

interface Collection {
  id: string
  name: string
  description: string | null
  cover_image_url: string | null
  item_count: number
  created_at: string
  updated_at: string
}

interface CollectionItem {
  id: string
  media_library_id: number
  sort_order: number
  media_library: {
    id: number
    name: string | null
    media_type: string
    storage_url: string | null
    url: string | null
    video_thumbnail_url: string | null
    source_type: string | null
  }
}

export default function CollectionsPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()

  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([])
  const [isLoadingItems, setIsLoadingItems] = useState(false)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Load collections
  const loadCollections = useCallback(async () => {
    if (!user || !currentAccountId) return
    setIsLoading(true)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
      })
      const res = await fetch(`/api/library/collections?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCollections(data.collections || [])
      }
    } catch (err) {
      console.error('Failed to load collections:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user, currentAccountId])

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  // Load collection items
  const loadCollectionItems = useCallback(async (collectionId: string) => {
    if (!user) return
    setIsLoadingItems(true)
    setCollectionItems([])

    try {
      const params = new URLSearchParams({
        userId: user.id,
        collectionId,
      })
      const res = await fetch(`/api/library/collections?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCollectionItems(data.collection?.items || [])
      }
    } catch (err) {
      console.error('Failed to load collection items:', err)
    } finally {
      setIsLoadingItems(false)
    }
  }, [user])

  const handleSelectCollection = (collection: Collection) => {
    setSelectedCollection(collection)
    loadCollectionItems(collection.id)
  }

  // Create collection
  const handleCreate = async () => {
    if (!user || !currentAccountId || !newName.trim()) return
    setIsCreating(true)

    try {
      const res = await fetch('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          name: newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      })

      if (res.ok) {
        setShowCreateModal(false)
        setNewName('')
        setNewDescription('')
        await loadCollections()
      }
    } catch (err) {
      console.error('Failed to create collection:', err)
    } finally {
      setIsCreating(false)
    }
  }

  // Rename collection
  const handleRename = async (collectionId: string) => {
    if (!user || !renameValue.trim()) return

    try {
      await fetch('/api/library/collections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          collectionId,
          name: renameValue.trim(),
        }),
      })
      setRenamingId(null)
      await loadCollections()
      if (selectedCollection?.id === collectionId) {
        setSelectedCollection(prev => prev ? { ...prev, name: renameValue.trim() } : null)
      }
    } catch (err) {
      console.error('Failed to rename collection:', err)
    }
  }

  // Delete collection
  const handleDelete = async (collectionId: string) => {
    if (!user) return
    setDeletingId(collectionId)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        collectionId,
      })
      await fetch(`/api/library/collections?${params}`, { method: 'DELETE' })

      if (selectedCollection?.id === collectionId) {
        setSelectedCollection(null)
        setCollectionItems([])
      }
      await loadCollections()
    } catch (err) {
      console.error('Failed to delete collection:', err)
    } finally {
      setDeletingId(null)
    }
  }

  // Remove item from collection
  const handleRemoveItem = async (mediaLibraryId: number) => {
    if (!user || !selectedCollection) return

    try {
      const params = new URLSearchParams({
        userId: user.id,
        collectionId: selectedCollection.id,
        mediaLibraryId: String(mediaLibraryId),
      })
      await fetch(`/api/library/collections/items?${params}`, { method: 'DELETE' })
      setCollectionItems(prev => prev.filter(i => i.media_library_id !== mediaLibraryId))
      // Update count in collections list
      setCollections(prev => prev.map(c =>
        c.id === selectedCollection.id ? { ...c, item_count: c.item_count - 1 } : c
      ))
    } catch (err) {
      console.error('Failed to remove item:', err)
    }
  }

  if (!user || !currentAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  // Detail view for a selected collection
  if (selectedCollection) {
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-8 py-6 space-y-6 max-w-[1200px] mx-auto">
          {/* Back + Header */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setSelectedCollection(null); setCollectionItems([]) }}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-bg-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{selectedCollection.name}</h1>
              {selectedCollection.description && (
                <p className="text-zinc-500 mt-1">{selectedCollection.description}</p>
              )}
            </div>
            <span className="text-sm text-zinc-500">{collectionItems.length} items</span>
          </div>

          {/* Items Grid */}
          {isLoadingItems ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square bg-bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : collectionItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Empty collection</h3>
              <p className="text-sm text-zinc-500">
                Add items from the Media or Ads pages using "Add to Collection"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {collectionItems.map((item) => {
                const media = item.media_library
                const thumb = media.video_thumbnail_url || media.storage_url || media.url
                const isVideo = media.media_type === 'video'

                return (
                  <div
                    key={item.id}
                    className="group relative aspect-square bg-bg-card border border-border rounded-xl overflow-hidden"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={media.name || 'Media'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {isVideo ? (
                          <Film className="w-8 h-8 text-zinc-600" />
                        ) : (
                          <Image className="w-8 h-8 text-zinc-600" />
                        )}
                      </div>
                    )}

                    {/* Type badge */}
                    {isVideo && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white flex items-center gap-1">
                        <Film className="w-3 h-3" /> Video
                      </div>
                    )}

                    {/* Source badge */}
                    {media.source_type && media.source_type !== 'meta' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-purple-500/80 rounded text-xs text-white">
                        {media.source_type === 'ai_video' || media.source_type === 'ai_generated' ? 'AI' :
                         media.source_type === 'project' ? 'Project' :
                         media.source_type === 'ai_edited' ? 'Edited' : media.source_type}
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                      <div className="w-full p-3 flex items-center justify-between">
                        <span className="text-sm text-white truncate">{media.name || 'Untitled'}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.media_library_id) }}
                          className="p-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                          title="Remove from collection"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Collections list view
  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6 space-y-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Collections</h1>
            <p className="text-zinc-500 mt-1">
              Organize your creative assets into named groups
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Collection
          </button>
        </div>

        {/* Collections Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No collections yet</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Create collections to organize your media, videos, and copy
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              Create Your First Collection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <div
                key={collection.id}
                onClick={() => handleSelectCollection(collection)}
                className="group relative bg-bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-zinc-600 transition-all"
              >
                {/* Cover Image */}
                <div className="aspect-[16/9] bg-zinc-800/50 relative">
                  {collection.cover_image_url ? (
                    <img
                      src={collection.cover_image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FolderOpen className="w-12 h-12 text-zinc-700" />
                    </div>
                  )}

                  {/* Item count badge */}
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white">
                    {collection.item_count} {collection.item_count === 1 ? 'item' : 'items'}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    {renamingId === collection.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRename(collection.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(collection.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border border-zinc-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-accent w-full"
                      />
                    ) : (
                      <h3 className="text-sm font-semibold text-white truncate">{collection.name}</h3>
                    )}

                    {/* Actions (visible on hover) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingId(collection.id)
                          setRenameValue(collection.name)
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-bg-hover transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(collection.id)
                        }}
                        disabled={deletingId === collection.id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        {deletingId === collection.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  {collection.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{collection.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">New Collection</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Name</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Summer Campaign Assets"
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent"
                  onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) handleCreate() }}
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Description (optional)</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What's this collection for?"
                  rows={2}
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setNewName(''); setNewDescription('') }}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isCreating}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
                  newName.trim() && !isCreating
                    ? 'bg-accent hover:bg-accent-hover text-white'
                    : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                )}
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
