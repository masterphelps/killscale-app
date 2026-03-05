'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { RefreshCw, Download, Upload, Loader2, Trash2, AlertTriangle, FolderKanban, Pencil, FolderPlus, FolderOpen, ChevronLeft, Plus, Check, X, FolderMinus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  GalleryGrid,
  StarredMediaBar,
  MediaPreviewModal,
} from '@/components/creative-studio'
import type {
  StudioAsset,
} from '@/components/creative-studio/types'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { useCreativeStudio } from '../creative-studio-context'

type SortOption = 'name' | 'syncedAt' | 'fileSize' | 'mediaType'
type MediaTab = 'media' | 'collection' | 'project'
type TypeFilter = 'all' | 'video' | 'image'

export default function AllMediaPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const {
    assets,
    isLoading,
    isSyncing,
    isDownloading,
    downloadProgress,
    videoSources,
    fetchVideoSource,
    starredIds,
    toggleStar,
    clearStarred,
    handleSync,
    removeAsset,
    refresh,
  } = useCreativeStudio()

  // View state
  const searchParams = useSearchParams()
  const [mediaTab, setMediaTab] = useState<MediaTab>(() => {
    const tab = searchParams.get('tab')
    if (tab === 'project' || tab === 'collection') return tab
    return 'media'
  })
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('syncedAt')
  const [sortDesc, setSortDesc] = useState(true)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  // Modal state
  const [selectedItem, setSelectedItem] = useState<StudioAsset | null>(null)

  // Launch Wizard state — wizardAccountId captures the account at open time
  // so a context re-render (e.g. Supabase token refresh) can't unmount the wizard
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardAccountId, setWizardAccountId] = useState<string | null>(null)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])
  const [showClearStarsPrompt, setShowClearStarsPrompt] = useState(false)

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Media menu state
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [menuCheckingUsage, setMenuCheckingUsage] = useState(false)
  const [menuUsageInfo, setMenuUsageInfo] = useState<{ inUse: boolean; usedByAds: { adName: string; status: string }[] } | null>(null)
  const [menuDeleting, setMenuDeleting] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Add to Collection state
  const [showCollectionPicker, setShowCollectionPicker] = useState(false)
  const [collectionPickerAssetId, setCollectionPickerAssetId] = useState<string | null>(null)
  const [collections, setCollections] = useState<Array<{ id: string; name: string; item_count: number; cover_image_url?: string | null }>>([])
  const [isLoadingCollections, setIsLoadingCollections] = useState(false)
  const [addingToCollection, setAddingToCollection] = useState<string | null>(null)

  // Projects tab state (from video_compositions directly)
  const [projectCompositions, setProjectCompositions] = useState<Array<{
    id: string; name: string | null; title: string | null; thumbnailUrl: string | null;
    renderedVideoUrl: string | null; durationSeconds: number | null; createdAt: string;
    sourceJobIds: string[];
  }>>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null)
  const [projectMenuPosition, setProjectMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)

  // Collections tab state
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [selectedCollectionName, setSelectedCollectionName] = useState('')
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set())
  const [isLoadingCollectionItems, setIsLoadingCollectionItems] = useState(false)
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null)

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSortDropdown])

  // Close menu on outside click
  useEffect(() => {
    if (!menuItemId) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuItemId(null)
        setMenuPosition(null)
        setMenuUsageInfo(null)
        setMenuError(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuItemId])

  // Load collections for Add to Collection picker and Collections tab
  const loadCollections = useCallback(async () => {
    if (!user?.id || !currentAccountId) return
    setIsLoadingCollections(true)
    try {
      const params = new URLSearchParams({ userId: user.id, adAccountId: currentAccountId })
      const res = await fetch(`/api/library/collections?${params}`)
      const data = await res.json()
      if (data.collections) setCollections(data.collections)
    } catch (err) {
      console.error('Failed to load collections:', err)
    } finally {
      setIsLoadingCollections(false)
    }
  }, [user?.id, currentAccountId])

  // Load collection items when a collection is selected
  const loadCollectionItems = useCallback(async (collectionId: string) => {
    if (!user?.id) return
    setIsLoadingCollectionItems(true)
    try {
      const params = new URLSearchParams({ userId: user.id, collectionId })
      const res = await fetch(`/api/library/collections?${params}`)
      const data = await res.json()
      if (data.collection?.items) {
        const ids = new Set<string>(data.collection.items.map((item: any) => String(item.media_library_id)))
        setCollectionItemIds(ids)
      }
    } catch (err) {
      console.error('Failed to load collection items:', err)
    } finally {
      setIsLoadingCollectionItems(false)
    }
  }, [user?.id])

  // Load projects from video_compositions
  const loadProjects = useCallback(async () => {
    if (!user?.id || !currentAccountId) return
    setIsLoadingProjects(true)
    try {
      const params = new URLSearchParams({ userId: user.id, adAccountId: currentAccountId })
      const res = await fetch(`/api/creative-studio/video-composition?${params}`)
      const data = await res.json()
      if (data.compositions) setProjectCompositions(data.compositions)
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setIsLoadingProjects(false)
    }
  }, [user?.id, currentAccountId])

  // Load projects + collections counts on mount so tab badges are accurate
  useEffect(() => {
    loadProjects()
    loadCollections()
  }, [loadProjects, loadCollections])

  // Reload projects when switching to project tab (in case of new saves)
  useEffect(() => {
    if (mediaTab === 'project') {
      loadProjects()
    }
  }, [mediaTab, loadProjects])

  // Close project menu on outside click
  useEffect(() => {
    if (!projectMenuId) return
    const handleClickOutside = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuId(null)
        setProjectMenuPosition(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [projectMenuId])

  // Handle project menu click
  const handleProjectMenuClick = useCallback((id: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setProjectMenuId(id)
    setProjectMenuPosition({ x: rect.right, y: rect.bottom })
  }, [])

  // Handle project select — open theater modal
  const handleProjectSelect = useCallback((id: string) => {
    const project = projectCompositions.find(p => p.id === id)
    if (!project) return
    // Create a StudioAsset-compatible object for the theater modal
    const projectAsset: StudioAsset = {
      id: project.id,
      mediaHash: project.id,
      mediaType: 'video',
      name: project.name || project.title || 'Untitled Project',
      imageUrl: null,
      thumbnailUrl: project.thumbnailUrl || null,
      storageUrl: project.renderedVideoUrl || null,
      width: 1080,
      height: 1920,
      fileSize: null,
      downloadStatus: null,
      syncedAt: project.createdAt,
      hasPerformanceData: false,
      spend: 0, revenue: 0, roas: 0, ctr: 0, cpm: 0, cpc: 0, impressions: 0, clicks: 0,
      videoViews: null, videoThruplay: null, videoP100: null, avgWatchTime: null,
      videoPlays: null, outboundClicks: null, thumbstopRate: null, holdRate: null, completionRate: null,
      hookScore: null, holdScore: null, clickScore: null, convertScore: null,
      fatigueScore: 0, fatigueStatus: 'healthy' as const, daysActive: 0,
      firstSeen: null, lastSeen: null, adCount: 0, adsetCount: 0, campaignCount: 0,
      sourceType: 'project',
      sourceCompositionId: project.id,
      isStarred: false,
    }
    setSelectedItem(projectAsset)
  }, [projectCompositions])

  // Delete a project (composition)
  const handleDeleteProject = useCallback(async (projectId: string) => {
    if (!user?.id) return
    setDeletingProjectId(projectId)
    try {
      const params = new URLSearchParams({ compositionId: projectId, userId: user.id })
      const res = await fetch(`/api/creative-studio/video-composition?${params}`, { method: 'DELETE' })
      if (res.ok) {
        setProjectCompositions(prev => prev.filter(p => p.id !== projectId))
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
    } finally {
      setDeletingProjectId(null)
      setProjectMenuId(null)
      setProjectMenuPosition(null)
    }
  }, [user?.id])

  // Auto-load collections when switching to collections tab
  useEffect(() => {
    if (mediaTab === 'collection') {
      loadCollections()
    } else {
      setSelectedCollectionId(null)
      setSelectedCollectionName('')
      setCollectionItemIds(new Set())
    }
  }, [mediaTab, loadCollections])

  // Create a new collection
  const handleCreateCollection = useCallback(async () => {
    if (!user?.id || !currentAccountId || !newCollectionName.trim()) return
    try {
      const res = await fetch('/api/library/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, name: newCollectionName.trim() }),
      })
      const data = await res.json()
      if (data.collection) {
        setCollections(prev => [{ id: data.collection.id, name: data.collection.name, item_count: 0, cover_image_url: null }, ...prev])
        setNewCollectionName('')
        setIsCreatingCollection(false)
      }
    } catch (err) {
      console.error('Failed to create collection:', err)
    }
  }, [user?.id, currentAccountId, newCollectionName])

  // Delete a collection
  const handleDeleteCollection = useCallback(async (collectionId: string) => {
    if (!user?.id) return
    setDeletingCollectionId(collectionId)
    try {
      const params = new URLSearchParams({ userId: user.id, collectionId })
      const res = await fetch(`/api/library/collections?${params}`, { method: 'DELETE' })
      if (res.ok) {
        setCollections(prev => prev.filter(c => c.id !== collectionId))
        if (selectedCollectionId === collectionId) {
          setSelectedCollectionId(null)
          setSelectedCollectionName('')
          setCollectionItemIds(new Set())
        }
      }
    } catch (err) {
      console.error('Failed to delete collection:', err)
    } finally {
      setDeletingCollectionId(null)
    }
  }, [user?.id, selectedCollectionId])

  // Remove item from currently viewed collection
  const handleRemoveFromCollection = useCallback(async (mediaLibraryId: string) => {
    if (!user?.id || !selectedCollectionId) return
    try {
      const params = new URLSearchParams({
        userId: user.id,
        collectionId: selectedCollectionId,
        mediaLibraryId,
      })
      const res = await fetch(`/api/library/collections/items?${params}`, { method: 'DELETE' })
      if (res.ok) {
        setCollectionItemIds(prev => {
          const next = new Set(prev)
          next.delete(mediaLibraryId)
          return next
        })
        // Update item count in collections list
        setCollections(prev => prev.map(c =>
          c.id === selectedCollectionId ? { ...c, item_count: Math.max(0, c.item_count - 1) } : c
        ))
      }
    } catch (err) {
      console.error('Failed to remove from collection:', err)
    }
  }, [user?.id, selectedCollectionId])

  const handleAddToCollection = useCallback(async (collectionId: string, mediaLibraryId: string) => {
    if (!user?.id) return
    setAddingToCollection(collectionId)
    try {
      const res = await fetch('/api/library/collections/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, collectionId, mediaLibraryIds: [mediaLibraryId] }),
      })
      const data = await res.json()
      if (data.success) {
        setShowCollectionPicker(false)
        setCollectionPickerAssetId(null)
      }
    } catch (err) {
      console.error('Failed to add to collection:', err)
    } finally {
      setAddingToCollection(null)
    }
  }, [user?.id])

  // Handle select item
  const handleSelect = useCallback((id: string) => {
    const asset = assets.find(a => a.id === id)
    if (asset) {
      setSelectedItem(asset)
    }
  }, [assets])

  const handleMenuClick = useCallback(async (id: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setMenuItemId(id)
    setMenuPosition({ x: rect.right, y: rect.bottom })
    setMenuUsageInfo(null)
    setMenuError(null)
    setMenuCheckingUsage(true)

    // Check if media is in use
    const asset = assets.find(a => a.id === id)
    if (!asset || !user || !currentAccountId) {
      setMenuCheckingUsage(false)
      return
    }

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
        mediaHash: asset.mediaHash,
        mediaType: asset.mediaType
      })
      const res = await fetch(`/api/meta/media/check-usage?${params}`)
      const data = await res.json()
      setMenuUsageInfo(data)
    } catch (err) {
      console.error('Failed to check usage:', err)
      setMenuError('Failed to check usage')
    } finally {
      setMenuCheckingUsage(false)
    }
  }, [assets, user, currentAccountId])

  const handleDeleteMedia = useCallback(async (overrideId?: string) => {
    const targetId = overrideId || menuItemId
    if (!targetId || !user || !currentAccountId) return

    const asset = assets.find(a => a.id === targetId)
    if (!asset) return

    setMenuDeleting(true)
    setMenuError(null)

    try {
      const isLocalUpload = asset.mediaHash.startsWith('upload_')

      if (isLocalUpload) {
        // Local upload — just remove from media_library and Supabase Storage (no Meta)
        const res = await fetch('/api/creative-studio/register-upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId.replace(/^act_/, ''),
            mediaHash: asset.mediaHash,
          })
        })

        if (!res.ok) {
          const data = await res.json()
          setMenuError(data.error || 'Failed to delete')
          return
        }
      } else {
        // Meta-synced media — delete from Meta
        const res = await fetch('/api/meta/media/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            mediaId: asset.mediaType === 'video' ? asset.mediaHash : undefined,
            mediaHash: asset.mediaType === 'image' ? asset.mediaHash : undefined,
            mediaType: asset.mediaType
          })
        })

        const data = await res.json()

        if (!res.ok) {
          if (data.inUse) {
            setMenuUsageInfo({ inUse: true, usedByAds: data.usedByAds || [] })
            setMenuError('Media is in use')
          } else {
            setMenuError(data.error || 'Failed to delete')
          }
          return
        }
      }

      // Success - remove from local state immediately (no sync needed)
      removeAsset(asset.mediaHash)
      setMenuItemId(null)
      setMenuPosition(null)
    } catch (err) {
      console.error('Delete error:', err)
      setMenuError('Failed to delete media')
    } finally {
      setMenuDeleting(false)
    }
  }, [menuItemId, assets, user, currentAccountId, removeAsset])

  // Handle build from starred
  const handleBuildFromStarred = useCallback(async () => {
    const starredAssets = assets.filter(a => starredIds.has(a.mediaHash)).slice(0, 6)
    if (starredAssets.length === 0) return

    const creatives: Creative[] = await Promise.all(starredAssets.map(async (a) => {
      if (a.mediaType === 'video') {
        // Videos must be uploaded to Meta first — fetch from Supabase Storage
        const videoUrl = a.storageUrl
        if (!videoUrl) return { preview: a.thumbnailUrl || '', type: 'video' as const, uploaded: false, name: a.name || undefined }
        const res = await fetch(videoUrl)
        const blob = await res.blob()
        const file = new File([blob], a.name || 'video.mp4', { type: 'video/mp4' })
        return { file, preview: a.thumbnailUrl || a.storageUrl || '', type: 'video' as const, uploaded: false, name: a.name || undefined }
      }
      return {
        preview: a.imageUrl || a.storageUrl || '',
        type: 'image' as const,
        uploaded: true,
        isFromLibrary: true,
        imageHash: a.mediaHash,
        name: a.name || undefined,
      }
    }))

    setWizardCreatives(creatives)
    setWizardAccountId(currentAccountId)
    setShowLaunchWizard(true)
  }, [starredIds, assets, currentAccountId])

  // Handle file upload — Supabase Storage via API (service role). Meta upload deferred to Launch Wizard.
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !user || !currentAccountId) return

    setIsUploading(true)
    const cleanAccountId = currentAccountId.replace(/^act_/, '')
    let completed = 0

    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/')
        setUploadProgress(`Uploading ${completed + 1}/${files.length}: ${file.name}`)

        // Send file to our API which uploads to Supabase Storage (service role) + registers in media_library
        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)
        formData.append('adAccountId', cleanAccountId)
        formData.append('mediaType', isVideo ? 'video' : 'image')
        formData.append('name', file.name)

        const res = await fetch('/api/creative-studio/register-upload', {
          method: 'PUT',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          console.error('Upload failed:', data.error || res.statusText)
        }

        completed++
      }

      await refresh()
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setIsUploading(false)
      setUploadProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [user, currentAccountId, refresh])

  // Filter and sort
  const filteredAssets = useMemo(() => {
    let items = [...assets]

    // Type filter (for Media tab)
    if (typeFilter === 'video') items = items.filter(a => a.mediaType === 'video')
    else if (typeFilter === 'image') items = items.filter(a => a.mediaType === 'image')

    // Sort
    items.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break
        case 'syncedAt': comparison = (a.syncedAt || '').localeCompare(b.syncedAt || ''); break
        case 'fileSize': comparison = (a.fileSize || 0) - (b.fileSize || 0); break
        case 'mediaType': comparison = a.mediaType.localeCompare(b.mediaType); break
      }
      return sortDesc ? -comparison : comparison
    })

    return items.map(item => ({
      ...item,
      isStarred: starredIds.has(item.mediaHash),
    }))
  }, [assets, typeFilter, sortBy, sortDesc, starredIds])

  // Projects count for tab badge
  const projectCount = projectCompositions.length

  // Convert project compositions to StudioAsset objects for GalleryGrid
  const projectAssets = useMemo(() => {
    return projectCompositions.map((p): StudioAsset & { isStarred: boolean } => ({
      id: p.id,
      mediaHash: p.id,
      mediaType: 'video',
      name: p.name || p.title || 'Untitled Project',
      imageUrl: null,
      thumbnailUrl: p.thumbnailUrl || null,
      storageUrl: p.renderedVideoUrl || null,
      width: 1080,
      height: 1920,
      fileSize: null,
      downloadStatus: null,
      syncedAt: p.createdAt,
      hasPerformanceData: false,
      spend: 0, revenue: 0, roas: 0, ctr: 0, cpm: 0, cpc: 0, impressions: 0, clicks: 0,
      videoViews: null, videoThruplay: null, videoP100: null, avgWatchTime: null,
      videoPlays: null, outboundClicks: null, thumbstopRate: null, holdRate: null, completionRate: null,
      hookScore: null, holdScore: null, clickScore: null, convertScore: null,
      fatigueScore: 0, fatigueStatus: 'healthy' as const, daysActive: 0,
      firstSeen: null, lastSeen: null, adCount: 0, adsetCount: 0, campaignCount: 0,
      sourceType: 'project',
      sourceCompositionId: p.id,
      isStarred: false,
    }))
  }, [projectCompositions])

  const collectionAssets = useMemo(() => {
    if (!selectedCollectionId) return []
    return assets
      .filter(a => collectionItemIds.has(String(a.id)))
      .map(item => ({ ...item, isStarred: starredIds.has(item.mediaHash) }))
  }, [selectedCollectionId, assets, collectionItemIds, starredIds])

  if (!user || !currentAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Constrained content area - matches gallery width */}
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Media</h1>
              <p className="text-zinc-500 mt-1">
                Browse and organize your creative assets
              </p>
            </div>

          <div className="flex items-center gap-3">
            {isDownloading && (
              <span className="text-sm text-zinc-400">
                <Download className="w-4 h-4 inline mr-1 animate-pulse" />
                Downloading... {downloadProgress.completed}/{downloadProgress.total}
              </span>
            )}
            {isUploading && (
              <span className="text-sm text-zinc-400">
                <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                {uploadProgress}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-accent hover:bg-accent-hover text-white',
                isUploading && 'opacity-50 cursor-wait'
              )}
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            <button
              onClick={handleSync}
              disabled={isSyncing || isDownloading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-bg-card border border-border hover:border-zinc-600',
                (isSyncing || isDownloading) && 'opacity-50 cursor-wait'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Syncing...' : isDownloading ? 'Downloading...' : 'Sync Media'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => setMediaTab('media')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              mediaTab === 'media'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            Media ({filteredAssets.length})
          </button>
          <button
            onClick={() => setMediaTab('collection')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              mediaTab === 'collection'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            <FolderOpen className={cn('w-4 h-4', mediaTab === 'collection' ? 'text-amber-400' : '')} />
            Collections ({collections.length})
          </button>
          <button
            onClick={() => setMediaTab('project')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              mediaTab === 'project'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            <FolderKanban className={cn('w-4 h-4', mediaTab === 'project' ? 'text-emerald-400' : '')} />
            Projects ({projectCount})
          </button>
        </div>

        {/* Media tab controls */}
        {mediaTab === 'media' && (
          <div className="flex items-center justify-between">
            {/* Type filter pills */}
            <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
              {(['all', 'video', 'image'] as TypeFilter[]).map(filter => (
                <button
                  key={filter}
                  onClick={() => setTypeFilter(filter)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    typeFilter === filter
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  {filter === 'all' ? 'All' : filter === 'video' ? 'Videos' : 'Images'}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <span>Sort: {
                  sortBy === 'name' ? 'Name' :
                  sortBy === 'syncedAt' ? 'Date added' :
                  sortBy === 'fileSize' ? 'File size' :
                  'Type'
                }</span>
                <span>{sortDesc ? '\u2193' : '\u2191'}</span>
              </button>

              {showSortDropdown && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {([
                    { value: 'syncedAt' as const, label: 'Date added' },
                    { value: 'name' as const, label: 'Name' },
                    { value: 'fileSize' as const, label: 'File size' },
                    { value: 'mediaType' as const, label: 'Type' },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        if (sortBy === option.value) {
                          setSortDesc(!sortDesc)
                        } else {
                          setSortBy(option.value)
                          setSortDesc(true)
                        }
                        setShowSortDropdown(false)
                      }}
                      className={cn(
                        'w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors',
                        sortBy === option.value
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-300 hover:bg-white/5'
                      )}
                    >
                      <span>{option.label}</span>
                      {sortBy === option.value && (
                        <span className="text-xs text-zinc-500">{sortDesc ? '\u2193' : '\u2191'}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div>
          {/* Collections tab */}
          {mediaTab === 'collection' ? (
            selectedCollectionId ? (
              /* Collection items view */
              <div>
                {/* Back bar */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => { setSelectedCollectionId(null); setSelectedCollectionName(''); setCollectionItemIds(new Set()) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-bg-hover transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Collections
                  </button>
                  <span className="text-zinc-600">/</span>
                  <span className="text-sm font-medium text-white">{selectedCollectionName}</span>
                  <span className="text-xs text-zinc-500">({collectionAssets.length} items)</span>
                </div>

                {isLoadingCollectionItems ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : collectionAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
                      <FolderOpen className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Collection is empty</h3>
                    <p className="text-sm text-zinc-500 mb-4">
                      Add items from the Videos or Images tab using the menu
                    </p>
                  </div>
                ) : (
                  <GalleryGrid
                    items={collectionAssets}
                    isLoading={false}
                    onSelect={handleSelect}
                    onStar={toggleStar}
                    onMenu={handleMenuClick}
                    videoSources={videoSources}
                    onRequestVideoSource={fetchVideoSource}
                    minimal
                  />
                )}
              </div>
            ) : (
              /* Collection list view */
              isLoadingCollections ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {/* Create New Collection Card */}
                  {isCreatingCollection ? (
                    <div className="bg-bg-card border border-amber-500/30 rounded-2xl overflow-hidden flex flex-col">
                      <div className="aspect-video bg-zinc-800/30 flex items-center justify-center">
                        <FolderPlus className="w-10 h-10 text-amber-400" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col gap-2">
                        <input
                          autoFocus
                          value={newCollectionName}
                          onChange={(e) => setNewCollectionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateCollection()
                            if (e.key === 'Escape') { setIsCreatingCollection(false); setNewCollectionName('') }
                          }}
                          placeholder="Collection name..."
                          className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCreateCollection}
                            disabled={!newCollectionName.trim()}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            Create
                          </button>
                          <button
                            onClick={() => { setIsCreatingCollection(false); setNewCollectionName('') }}
                            className="flex items-center justify-center p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-bg-hover transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsCreatingCollection(true)}
                      className="bg-bg-card border border-dashed border-zinc-700 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all cursor-pointer group flex flex-col items-center justify-center min-h-[200px]"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3 group-hover:bg-amber-500/20 transition-colors">
                        <Plus className="w-6 h-6 text-amber-400" />
                      </div>
                      <span className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">New Collection</span>
                    </button>
                  )}

                  {/* Existing Collections */}
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      className="group bg-bg-card border border-border rounded-2xl overflow-hidden hover:border-zinc-600 transition-all cursor-pointer relative"
                      onClick={() => {
                        setSelectedCollectionId(collection.id)
                        setSelectedCollectionName(collection.name)
                        loadCollectionItems(collection.id)
                      }}
                    >
                      <div className="aspect-video bg-zinc-800/50 relative">
                        {collection.cover_image_url ? (
                          <img
                            src={collection.cover_image_url}
                            alt={collection.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FolderOpen className="w-10 h-10 text-zinc-700" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500/80 rounded text-xs text-white font-medium">
                          {collection.item_count} {collection.item_count === 1 ? 'item' : 'items'}
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white truncate">{collection.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete "${collection.name}"?`)) {
                              handleDeleteCollection(collection.id)
                            }
                          }}
                          disabled={deletingCollectionId === collection.id}
                          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          {deletingCollectionId === collection.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}

                  {collections.length === 0 && !isCreatingCollection && (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-zinc-500">No collections yet. Create one to organize your media.</p>
                    </div>
                  )}
                </div>
              )
            )
          ) : mediaTab === 'project' ? (
            isLoadingProjects ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : projectAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
                  <FolderKanban className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
                <p className="text-sm text-zinc-500 mb-4">
                  Open a video in the Video Editor and click Save to create a project
                </p>
              </div>
            ) : (
              <GalleryGrid
                items={projectAssets}
                isLoading={false}
                onSelect={handleProjectSelect}
                onMenu={handleProjectMenuClick}
                videoSources={videoSources}
                onRequestVideoSource={fetchVideoSource}
                minimal
                subtitle={(item) => {
                  const project = projectCompositions.find(p => p.id === item.id)
                  if (!project) return undefined
                  const parts: string[] = []
                  if (project.durationSeconds) parts.push(`${project.durationSeconds}s`)
                  if (project.renderedVideoUrl) parts.push('Rendered')
                  parts.push(new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
                  return parts.join(' · ')
                }}
              />
            )
          ) : (
            /* Media tab - clean gallery */
            <GalleryGrid
              items={filteredAssets}
              isLoading={isLoading}
              onSelect={handleSelect}
              onStar={toggleStar}
              onMenu={handleMenuClick}
              videoSources={videoSources}
              onRequestVideoSource={fetchVideoSource}
              minimal
            />
          )}
        </div>
        </div>
      </div>

      {/* Starred Media Bar */}
      <StarredMediaBar
        starredCount={starredIds.size}
        onBuildAds={handleBuildFromStarred}
        onClear={clearStarred}
      />

      {/* Launch Wizard — uses captured wizardAccountId so token refreshes can't unmount it */}
      {showLaunchWizard && wizardAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <LaunchWizard
            adAccountId={wizardAccountId}
            onComplete={async (result) => {
              setShowLaunchWizard(false)

              // Hydrate the newly created entity
              if (result?.createdEntity && user?.id) {
                try {
                  await fetch('/api/meta/hydrate-new-entity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: user.id,
                      adAccountId: currentAccountId,
                      entityType: result.createdEntity.entityType,
                      entityId: result.createdEntity.entityId,
                    })
                  })
                } catch (err) {
                  console.warn('[Media] Hydrate failed:', err)
                }
              }

              // Prompt to clear starred items if we built from stars
              if (wizardCreatives.length > 0 && starredIds.size > 0) {
                setShowClearStarsPrompt(true)
              }
              setWizardCreatives([])
            }}
            onCancel={() => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
            }}
            initialEntityType="campaign"
            preloadedCreatives={wizardCreatives}
          />
        </div>
      )}

      {/* Clear Stars Prompt */}
      {showClearStarsPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-green-400 text-lg">✓</span>
              </div>
              <h3 className="text-lg font-semibold text-white">Ad Created!</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-2">
              Your ad has been created and is paused for your review.
            </p>
            <p className="text-sm text-zinc-500 mb-4">
              Clear these {starredIds.size} starred items from your list?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearStarsPrompt(false)}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
              >
                Keep Stars
              </button>
              <button
                onClick={() => {
                  clearStarred()
                  setShowClearStarsPrompt(false)
                }}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg font-medium transition-colors"
              >
                Clear Stars
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      <MediaPreviewModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        mode={mediaTab}
        videoSource={selectedItem ? (videoSources[selectedItem.id] || null) : null}
        onBuildNewAds={async () => {
          if (!selectedItem) return
          const a = selectedItem
          let creative: Creative
          if (a.mediaType === 'video') {
            // Videos must be uploaded to Meta first — fetch from Supabase Storage
            const videoUrl = a.storageUrl || videoSources[a.id]
            if (!videoUrl) { console.error('No video URL available'); return }
            const res = await fetch(videoUrl)
            const blob = await res.blob()
            const file = new File([blob], a.name || 'video.mp4', { type: 'video/mp4' })
            creative = {
              file,
              preview: a.thumbnailUrl || a.storageUrl || '',
              type: 'video',
              uploaded: false,
              name: a.name || undefined,
            }
          } else {
            creative = {
              preview: a.imageUrl || a.storageUrl || '',
              type: 'image',
              uploaded: true,
              isFromLibrary: true,
              imageHash: a.mediaHash,
              name: a.name || undefined,
            }
          }
          setWizardCreatives([creative])
          setSelectedItem(null)
          setWizardAccountId(currentAccountId)
          setShowLaunchWizard(true)
        }}
        onDelete={selectedItem ? () => {
          if (mediaTab === 'project') {
            handleDeleteProject(selectedItem.id)
          } else {
            handleDeleteMedia(selectedItem.id)
          }
          setSelectedItem(null)
        } : undefined}
      />

      {/* Media Menu Dropdown */}
      {menuItemId && menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-50 w-56 bg-bg-card border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
          style={{
            left: Math.min(menuPosition.x - 224, window.innerWidth - 240),
            top: menuPosition.y + 4
          }}
        >
          {/* Add to Collection */}
          <button
            onClick={() => {
              setCollectionPickerAssetId(menuItemId)
              setShowCollectionPicker(true)
              loadCollections()
              setMenuItemId(null)
              setMenuPosition(null)
            }}
            className="w-full px-4 py-3 flex items-center gap-3 text-sm text-left text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            Add to Collection
          </button>

          {/* Remove from Collection (only when viewing a collection) */}
          {mediaTab === 'collection' && selectedCollectionId && (
            <button
              onClick={() => {
                handleRemoveFromCollection(menuItemId)
                setMenuItemId(null)
                setMenuPosition(null)
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-left text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              <FolderMinus className="w-4 h-4" />
              Remove from Collection
            </button>
          )}

          <div className="border-t border-zinc-700" />

          {menuCheckingUsage ? (
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking usage...
            </div>
          ) : menuUsageInfo?.inUse ? (
            <div className="p-4">
              <div className="flex items-center gap-2 text-sm text-yellow-500 mb-2">
                <AlertTriangle className="w-4 h-4" />
                In use by active/paused ads
              </div>
              <div className="space-y-1 mb-3">
                {menuUsageInfo.usedByAds.slice(0, 3).map((ad, i) => (
                  <p key={i} className="text-xs text-zinc-500 truncate">
                    • {ad.adName} <span className="text-zinc-600">({ad.status})</span>
                  </p>
                ))}
                {menuUsageInfo.usedByAds.length > 3 && (
                  <p className="text-xs text-zinc-600">
                    +{menuUsageInfo.usedByAds.length - 3} more
                  </p>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Delete or pause the ads first to remove this media.
              </p>
            </div>
          ) : (
            <button
              onClick={() => handleDeleteMedia()}
              disabled={menuDeleting}
              className={cn(
                "w-full px-4 py-3 flex items-center gap-3 text-sm text-left transition-colors",
                menuDeleting
                  ? "text-zinc-500 cursor-not-allowed"
                  : "text-red-400 hover:bg-red-500/10"
              )}
            >
              {menuDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {menuDeleting ? 'Deleting...' : (() => {
                const a = assets.find(x => x.id === menuItemId)
                return a?.mediaHash?.startsWith('upload_') ? 'Delete' : 'Delete from Meta'
              })()}
            </button>
          )}

          {menuError && !menuUsageInfo?.inUse && (
            <div className="px-4 py-2 border-t border-zinc-700">
              <p className="text-xs text-red-400 mb-2">{menuError}</p>
              <button
                onClick={async () => {
                  const asset = assets.find(a => a.id === menuItemId)
                  if (!asset || !user || !currentAccountId) return
                  setMenuDeleting(true)
                  try {
                    // Force remove from library only (skip Meta)
                    await fetch('/api/creative-studio/register-upload', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: user.id,
                        adAccountId: currentAccountId.replace(/^act_/, ''),
                        mediaHash: asset.mediaHash,
                      })
                    })
                    removeAsset(asset.mediaHash)
                    setMenuItemId(null)
                    setMenuPosition(null)
                    setMenuError(null)
                  } catch {
                    setMenuError('Failed to remove')
                  } finally {
                    setMenuDeleting(false)
                  }
                }}
                disabled={menuDeleting}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Remove from library only
              </button>
            </div>
          )}
        </div>
      )}

      {/* Project Menu Dropdown */}
      {projectMenuId && projectMenuPosition && (
        <div
          ref={projectMenuRef}
          className="fixed z-50 w-56 bg-bg-card border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
          style={{
            left: Math.min(projectMenuPosition.x - 224, window.innerWidth - 240),
            top: projectMenuPosition.y + 4
          }}
        >
          <button
            onClick={() => {
              router.push(`/dashboard/creative-studio/video-editor?compositionId=${projectMenuId}&from=media-projects`)
              setProjectMenuId(null)
              setProjectMenuPosition(null)
            }}
            className="w-full px-4 py-3 flex items-center gap-3 text-sm text-left text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Open in Editor
          </button>
          <div className="border-t border-zinc-700" />
          <button
            onClick={() => handleDeleteProject(projectMenuId)}
            disabled={deletingProjectId === projectMenuId}
            className={cn(
              "w-full px-4 py-3 flex items-center gap-3 text-sm text-left transition-colors",
              deletingProjectId === projectMenuId
                ? "text-zinc-500 cursor-not-allowed"
                : "text-red-400 hover:bg-red-500/10"
            )}
          >
            {deletingProjectId === projectMenuId ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {deletingProjectId === projectMenuId ? 'Deleting...' : 'Delete Project'}
          </button>
        </div>
      )}

      {/* Collection Picker Modal */}
      {showCollectionPicker && collectionPickerAssetId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowCollectionPicker(false); setCollectionPickerAssetId(null) }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Add to Collection</h3>
              <button onClick={() => { setShowCollectionPicker(false); setCollectionPickerAssetId(null) }} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto">
              {isLoadingCollections ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                </div>
              ) : collections.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">No collections yet. Create one from the Collections tab.</p>
              ) : (
                <div className="space-y-1">
                  {collections.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleAddToCollection(c.id, collectionPickerAssetId)}
                      disabled={addingToCollection === c.id}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">{c.item_count} items</span>
                        {addingToCollection === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" /> : <FolderPlus className="w-3.5 h-3.5 text-zinc-600" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
