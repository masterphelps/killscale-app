'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { LayoutGrid, List, RefreshCw, Download, Film, Image, Upload, Loader2, Trash2, AlertTriangle, FolderKanban, Pencil, FolderPlus, FolderOpen, ChevronLeft, Plus, Check, X, MoreHorizontal, FolderMinus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  GalleryGrid,
  FunnelFilterBar,
  StarredMediaBar,
  TheaterModal,
  MediaTable,
} from '@/components/creative-studio'
import { DatePicker, DatePickerButton, DATE_PRESETS } from '@/components/date-picker'
import type {
  StudioAsset,
  StudioAssetDetail,
  VideoAnalysis,
  ScriptSuggestion,
  AnalysisStatus,
} from '@/components/creative-studio/types'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import Link from 'next/link'
import { uploadImageToMeta, uploadVideoToMeta } from '@/lib/meta-upload'
import { useCreativeStudio } from '../creative-studio-context'
import { useSubscription } from '@/lib/subscription'

type FunnelStage = 'hook' | 'hold' | 'click' | 'convert' | 'scale'

type ViewMode = 'gallery' | 'table'
type SortOption = 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore' | 'spend' | 'roas' | 'revenue' | 'fatigue' | 'adCount' | 'fileSize' | 'syncedAt' | 'name' | 'thumbstopRate' | 'holdRate' | 'ctr' | 'cpc' | 'impressions'
type MediaTab = 'video' | 'image' | 'collection' | 'project'

export default function AllMediaPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan, loading: subscriptionLoading } = useSubscription()
  // Any paid user (including trial) gets full access
  const isPro = subscriptionLoading || !!plan
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
    sourceFilter,
    setSourceFilter,
    datePreset,
    setDatePreset,
    customStartDate,
    customEndDate,
    setCustomStartDate,
    setCustomEndDate,
    showDatePicker,
    setShowDatePicker,
  } = useCreativeStudio()

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [mediaTab, setMediaTab] = useState<MediaTab>('video')
  const [sortBy, setSortBy] = useState<SortOption>('hookScore')
  const [sortDesc, setSortDesc] = useState(true)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  // Funnel filter state
  const [funnelThresholds, setFunnelThresholds] = useState<Record<FunnelStage, number | null>>({
    hook: null, hold: null, click: null, convert: null, scale: null,
  })

  // Modal state
  const [selectedItem, setSelectedItem] = useState<StudioAsset | null>(null)
  const [detailData, setDetailData] = useState<StudioAssetDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // Launch Wizard state
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])
  const [showClearStarsPrompt, setShowClearStarsPrompt] = useState(false)

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // AI Analysis state
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('none')
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null)
  const [scriptSuggestions, setScriptSuggestions] = useState<ScriptSuggestion[] | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

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

  // Load detail data for selected asset
  const loadDetailData = useCallback(async (asset: StudioAsset) => {
    if (!user || !currentAccountId) return
    setIsDetailLoading(true)
    setDetailData(null)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
        mediaHash: asset.mediaHash,
      })
      const res = await fetch(`/api/creative-studio/media-detail?${params}`)
      if (res.ok) {
        const data: StudioAssetDetail = await res.json()
        setDetailData(data)
      }
    } catch (error) {
      console.error('Failed to load detail data:', error)
    } finally {
      setIsDetailLoading(false)
    }
  }, [user, currentAccountId])

  // Handle select item
  const handleSelect = useCallback((id: string) => {
    const asset = assets.find(a => a.id === id)
    if (asset) {
      setSelectedItem(asset)
      loadDetailData(asset)
    }
  }, [assets, loadDetailData])

  // Handle table sort
  const handleTableSort = useCallback((field: string) => {
    if (field === sortBy) {
      setSortDesc(prev => !prev)
    } else {
      setSortBy(field as SortOption)
      setSortDesc(true)
    }
  }, [sortBy])

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

  const handleDeleteMedia = useCallback(async () => {
    if (!menuItemId || !user || !currentAccountId) return

    const asset = assets.find(a => a.id === menuItemId)
    if (!asset) return

    setMenuDeleting(true)
    setMenuError(null)

    try {
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

  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null)
    setDetailData(null)
  }, [])

  // Fetch analysis status for a video
  const fetchAnalysisStatus = useCallback(async (mediaHash: string) => {
    if (!user || !currentAccountId) return

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
        mediaHash
      })
      const res = await fetch(`/api/creative-studio/analyze-video?${params}`)
      const data = await res.json()

      setAnalysisStatus(data.status || 'none')
      setAnalysis(data.analysis || null)
      setScriptSuggestions(data.scriptSuggestions || null)
      setAnalyzedAt(data.analyzedAt || null)
      setAnalysisError(data.errorMessage || null)
    } catch (err) {
      console.error('Failed to fetch analysis status:', err)
      setAnalysisStatus('none')
    }
  }, [user, currentAccountId])

  // Handle analyze video
  const handleAnalyze = useCallback(async () => {
    if (!user || !currentAccountId || !selectedItem) return

    setIsAnalyzing(true)
    setAnalysisStatus('processing')

    try {
      const res = await fetch('/api/creative-studio/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          mediaHash: selectedItem.mediaHash
        })
      })

      const data = await res.json()

      if (res.ok) {
        setAnalysisStatus('complete')
        setAnalysis(data.analysis)
        setScriptSuggestions(data.scriptSuggestions)
        setAnalyzedAt(data.analyzedAt)
        setAnalysisError(null)
      } else {
        setAnalysisStatus('error')
        setAnalysisError(data.error || 'Analysis failed')
      }
    } catch (err) {
      setAnalysisStatus('error')
      setAnalysisError('Network error')
    } finally {
      setIsAnalyzing(false)
    }
  }, [user, currentAccountId, selectedItem])

  const handleReanalyze = handleAnalyze

  // Fetch analysis status when selected item changes
  useEffect(() => {
    if (selectedItem && selectedItem.mediaType === 'video') {
      fetchAnalysisStatus(selectedItem.mediaHash)
    } else {
      // Reset analysis state when not viewing a video
      setAnalysisStatus('none')
      setAnalysis(null)
      setScriptSuggestions(null)
      setAnalyzedAt(null)
      setAnalysisError(null)
    }
  }, [selectedItem, fetchAnalysisStatus])

  // Handle build from starred
  const handleBuildFromStarred = useCallback(() => {
    const starredAssets = assets.filter(a => starredIds.has(a.mediaHash)).slice(0, 6)
    if (starredAssets.length === 0) return

    const creatives = starredAssets.map(a => ({
      preview: a.mediaType === 'video' ? (a.thumbnailUrl || '') : (a.imageUrl || a.storageUrl || ''),
      type: a.mediaType as 'image' | 'video',
      uploaded: true,
      isFromLibrary: true,
      ...(a.mediaType === 'image' ? { imageHash: a.mediaHash } : { videoId: a.mediaHash, thumbnailUrl: a.thumbnailUrl || undefined }),
    }))

    setWizardCreatives(creatives)
    setShowLaunchWizard(true)
  }, [starredIds, assets])

  // Handle file upload to Meta
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !user || !currentAccountId) return

    setIsUploading(true)
    setUploadProgress('Fetching token...')

    try {
      const tokenRes = await fetch(`/api/meta/token?userId=${user.id}&adAccountId=${currentAccountId}`)
      if (!tokenRes.ok) throw new Error('Failed to get access token')
      const { accessToken } = await tokenRes.json()

      const cleanAccountId = currentAccountId.replace(/^act_/, '')
      let completed = 0

      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/')
        setUploadProgress(`Uploading ${completed + 1}/${files.length}: ${file.name}`)

        if (isVideo) {
          await uploadVideoToMeta(file, accessToken, cleanAccountId, (progress) => {
            setUploadProgress(`Uploading ${completed + 1}/${files.length}: ${file.name} (${progress}%)`)
          })
        } else {
          await uploadImageToMeta(file, accessToken, cleanAccountId)
        }
        completed++
      }

      setUploadProgress('Syncing...')
      await handleSync()
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setIsUploading(false)
      setUploadProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [user, currentAccountId, handleSync])

  // Funnel filter handlers
  const toggleFunnelFilter = useCallback((stage: FunnelStage) => {
    setFunnelThresholds(prev => ({
      ...prev,
      [stage]: prev[stage] !== null ? null : 75,
    }))
  }, [])

  const setFunnelThreshold = useCallback((stage: FunnelStage, value: number) => {
    setFunnelThresholds(prev => ({
      ...prev,
      [stage]: value,
    }))
  }, [])

  const clearFunnelFilters = useCallback(() => {
    setFunnelThresholds({ hook: null, hold: null, click: null, convert: null, scale: null })
  }, [])

  // Compute scale threshold
  const scaleThreshold = useMemo(() => {
    const spends = assets
      .filter(a => a.hasPerformanceData && a.spend > 0)
      .map(a => a.spend)
      .sort((a, b) => a - b)
    if (spends.length === 0) return 0
    const mid = Math.floor(spends.length / 2)
    const median = spends.length % 2 === 0
      ? (spends[mid - 1] + spends[mid]) / 2
      : spends[mid]
    return median * 2
  }, [assets])

  // Funnel stats
  const funnelStats = useMemo(() => {
    const withData = assets.filter(a => a.hasPerformanceData)
    const total = withData.length
    const t = (stage: FunnelStage) => funnelThresholds[stage] ?? 75
    return {
      hook: { good: withData.filter(a => (a.hookScore ?? 0) >= t('hook')).length, total },
      hold: { good: withData.filter(a => (a.holdScore ?? 0) >= t('hold')).length, total },
      click: { good: withData.filter(a => (a.clickScore ?? 0) >= t('click')).length, total },
      convert: { good: withData.filter(a => (a.convertScore ?? 0) >= t('convert')).length, total },
      scale: { good: withData.filter(a => a.spend >= scaleThreshold).length, total },
    }
  }, [assets, scaleThreshold, funnelThresholds])

  // Filter and sort
  const filteredAssets = useMemo(() => {
    let items = [...assets]

    const activeStages = (Object.entries(funnelThresholds) as [FunnelStage, number | null][])
      .filter(([, v]) => v !== null)
    if (activeStages.length > 0) {
      items = items.filter(item => {
        for (const [stage, threshold] of activeStages) {
          if (stage === 'hook' && (item.hookScore ?? 0) < threshold!) return false
          if (stage === 'hold' && (item.holdScore ?? 0) < threshold!) return false
          if (stage === 'click' && (item.clickScore ?? 0) < threshold!) return false
          if (stage === 'convert' && (item.convertScore ?? 0) < threshold!) return false
          if (stage === 'scale' && item.spend < scaleThreshold) return false
        }
        return true
      })
    }

    items.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'hookScore': comparison = (a.hookScore ?? -1) - (b.hookScore ?? -1); break
        case 'holdScore': comparison = (a.holdScore ?? -1) - (b.holdScore ?? -1); break
        case 'clickScore': comparison = (a.clickScore ?? -1) - (b.clickScore ?? -1); break
        case 'convertScore': comparison = (a.convertScore ?? -1) - (b.convertScore ?? -1); break
        case 'spend': comparison = a.spend - b.spend; break
        case 'roas': comparison = a.roas - b.roas; break
        case 'revenue': comparison = a.revenue - b.revenue; break
        case 'fatigue': comparison = a.fatigueScore - b.fatigueScore; break
        case 'adCount': comparison = a.adCount - b.adCount; break
        case 'fileSize': comparison = (a.fileSize || 0) - (b.fileSize || 0); break
        case 'syncedAt': comparison = (a.syncedAt || '').localeCompare(b.syncedAt || ''); break
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break
        case 'thumbstopRate': comparison = (a.thumbstopRate ?? -1) - (b.thumbstopRate ?? -1); break
        case 'holdRate': comparison = (a.holdRate ?? -1) - (b.holdRate ?? -1); break
        case 'ctr': comparison = a.ctr - b.ctr; break
        case 'cpc': comparison = a.cpc - b.cpc; break
        case 'impressions': comparison = a.impressions - b.impressions; break
      }
      return sortDesc ? -comparison : comparison
    })

    return items.map(item => ({
      ...item,
      isStarred: starredIds.has(item.mediaHash),
    }))
  }, [assets, funnelThresholds, scaleThreshold, sortBy, sortDesc, starredIds])

  // Apply source filter (All / Meta / AI Generated)
  const sourceFilteredAssets = useMemo(() => {
    if (sourceFilter === 'all') return filteredAssets
    if (sourceFilter === 'meta') return filteredAssets.filter(a => !a.sourceType || a.sourceType === 'meta')
    // 'ai' — includes ai_video, ai_image, ai_generated, ai_edited, open_prompt, project
    return filteredAssets.filter(a => a.sourceType && a.sourceType !== 'meta')
  }, [filteredAssets, sourceFilter])

  const videos = useMemo(() => sourceFilteredAssets.filter(a => a.mediaType === 'video' && (a as any).sourceType !== 'project'), [sourceFilteredAssets])
  const images = useMemo(() => sourceFilteredAssets.filter(a => a.mediaType === 'image'), [sourceFilteredAssets])
  const projects = useMemo(() => sourceFilteredAssets.filter(a => (a as any).sourceType === 'project'), [sourceFilteredAssets])
  const collectionAssets = useMemo(() => {
    if (!selectedCollectionId) return []
    return sourceFilteredAssets.filter(a => collectionItemIds.has(String(a.id)))
  }, [selectedCollectionId, sourceFilteredAssets, collectionItemIds])

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
        <div className="max-w-[1200px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Media</h1>
              <p className="text-zinc-500 mt-1">
                Browse and analyze all creative assets by media
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

        {/* Funnel Filters + Sort Controls */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="w-full lg:flex-1 lg:min-w-0">
            <FunnelFilterBar
              thresholds={funnelThresholds}
              onToggle={toggleFunnelFilter}
              onSetThreshold={setFunnelThreshold}
              onClear={clearFunnelFilters}
              stats={funnelStats}
            />
          </div>

          <div className="flex items-center justify-between lg:justify-end gap-3 flex-shrink-0">
            {/* Date Picker */}
            <div className="relative">
              <DatePickerButton
                label={
                  datePreset === 'custom' && customStartDate && customEndDate
                    ? `${customStartDate} – ${customEndDate}`
                    : DATE_PRESETS.find(p => p.value === datePreset)?.label || 'Last 90 Days'
                }
                onClick={() => setShowDatePicker(!showDatePicker)}
                isOpen={showDatePicker}
              />
              <DatePicker
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                datePreset={datePreset}
                onPresetChange={(preset) => {
                  setDatePreset(preset)
                  if (preset !== 'custom') setShowDatePicker(false)
                }}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomDateChange={(start, end) => {
                  setCustomStartDate(start)
                  setCustomEndDate(end)
                }}
                onApply={() => {
                  setDatePreset('custom')
                  setShowDatePicker(false)
                }}
              />
            </div>

            {/* Sort Dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all duration-200 bg-bg-card border-border text-zinc-300 hover:border-border/50"
              >
                <span className="text-zinc-500">Sort:</span>
                <span>{
                  sortBy === 'hookScore' ? 'Hook' :
                  sortBy === 'holdScore' ? 'Hold' :
                  sortBy === 'clickScore' ? 'Click' :
                  sortBy === 'convertScore' ? 'Convert' :
                  sortBy === 'spend' ? 'Scale' :
                  sortBy === 'roas' ? 'ROAS' :
                  sortBy === 'revenue' ? 'Revenue' :
                  sortBy === 'fatigue' ? 'Fatigue' :
                  sortBy === 'adCount' ? 'Usage' :
                  sortBy === 'fileSize' ? 'File Size' :
                  sortBy === 'syncedAt' ? 'Date Synced' : sortBy
                }</span>
                <span className="text-zinc-500">{sortDesc ? '↓' : '↑'}</span>
              </button>

              {showSortDropdown && (
                <div className="absolute left-0 lg:left-auto lg:right-0 top-full mt-2 w-48 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {([
                    { value: 'hookScore', label: 'Hook' },
                    { value: 'holdScore', label: 'Hold' },
                    { value: 'clickScore', label: 'Click' },
                    { value: 'convertScore', label: 'Convert' },
                    { value: 'spend', label: 'Scale' },
                    { value: 'roas', label: 'ROAS' },
                    { value: 'revenue', label: 'Revenue' },
                    { value: 'fatigue', label: 'Fatigue' },
                    { value: 'adCount', label: 'Usage' },
                    { value: 'fileSize', label: 'File Size' },
                    { value: 'syncedAt', label: 'Date Synced' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        if (sortBy === option.value) {
                          setSortDesc(!sortDesc)
                        } else {
                          setSortBy(option.value as SortOption)
                          setSortDesc(true)
                        }
                        setShowSortDropdown(false)
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors ${
                        sortBy === option.value
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{option.label}</span>
                      {sortBy === option.value && (
                        <span className="text-xs">{sortDesc ? '↓ High to Low' : '↑ Low to High'}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
              <button
                onClick={() => setViewMode('gallery')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'gallery'
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
                title="Gallery view"
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
                title="Table view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Media Type Tabs + Source Filter */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1 border-b border-border">
            <button
              onClick={() => setMediaTab('video')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                mediaTab === 'video'
                  ? 'border-purple-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Film className={cn('w-4 h-4', mediaTab === 'video' ? 'text-purple-400' : '')} />
              Videos ({videos.length})
            </button>
            <button
              onClick={() => setMediaTab('image')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                mediaTab === 'image'
                  ? 'border-blue-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Image className={cn('w-4 h-4', mediaTab === 'image' ? 'text-blue-400' : '')} />
              Images ({images.length})
            </button>
            <button
              onClick={() => setMediaTab('collection')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                mediaTab === 'collection'
                  ? 'border-amber-400 text-white'
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
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              <FolderKanban className={cn('w-4 h-4', mediaTab === 'project' ? 'text-emerald-400' : '')} />
              Projects ({projects.length})
            </button>
          </div>

          {/* Source Filter Pills */}
          <div className="flex items-center gap-2">
            {(['all', 'meta', 'ai'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setSourceFilter(filter)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  sourceFilter === filter
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-bg-card text-zinc-400 border border-border hover:text-white'
                )}
              >
                {filter === 'all' ? 'All Sources' : filter === 'meta' ? 'Meta' : 'AI Generated'}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="text-sm text-zinc-500">
          {mediaTab === 'video' ? videos.length : mediaTab === 'image' ? images.length : mediaTab === 'collection' ? (selectedCollectionId ? collectionAssets.length : collections.length) : projects.length} {mediaTab === 'video' ? 'videos' : mediaTab === 'image' ? 'images' : mediaTab === 'collection' ? (selectedCollectionId ? 'items' : 'collections') : 'projects'}
          {Object.entries(funnelThresholds).some(([, v]) => v !== null) &&
            ` filtered by ${Object.entries(funnelThresholds).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v}+`).join(' + ')}`}
          {sourceFilter !== 'all' && ` · source: ${sourceFilter === 'meta' ? 'Meta' : 'AI Generated'}`}
        </div>

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
                ) : viewMode === 'gallery' ? (
                  <GalleryGrid
                    items={collectionAssets}
                    isLoading={false}
                    onSelect={handleSelect}
                    onStar={toggleStar}
                    onMenu={handleMenuClick}
                    videoSources={videoSources}
                    onRequestVideoSource={fetchVideoSource}
                  />
                ) : (
                  <MediaTable
                    items={collectionAssets}
                    isLoading={false}
                    sortField={sortBy}
                    sortDirection={sortDesc ? 'desc' : 'asc'}
                    onSort={handleTableSort}
                    onSelect={(id) => handleSelect(id)}
                    onStar={(id) => toggleStar(id)}
                    starredIds={starredIds}
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
            isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
                  <FolderKanban className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
                <p className="text-sm text-zinc-500 mb-4">
                  Save a video composition from the Video Editor to see it here
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group bg-bg-card border border-border rounded-2xl overflow-hidden hover:border-zinc-600 transition-all cursor-pointer"
                    onClick={() => handleSelect(project.id)}
                  >
                    <div className="aspect-video bg-zinc-800/50 relative">
                      {project.thumbnailUrl || project.imageUrl || project.storageUrl ? (
                        <img
                          src={project.thumbnailUrl || project.imageUrl || project.storageUrl || ''}
                          alt={project.name || 'Project'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FolderKanban className="w-10 h-10 text-zinc-700" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-500/80 rounded text-xs text-white font-medium">
                        Project
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-white truncate">{project.name || 'Untitled Project'}</h3>
                      <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                        {project.spend > 0 && <span>${project.spend.toFixed(0)} spent</span>}
                        {project.roas > 0 && <span>{project.roas.toFixed(1)}x ROAS</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/dashboard/creative-studio/video-editor?compositionId=${(project as any).sourceCompositionId || ''}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : viewMode === 'gallery' ? (
            isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (mediaTab === 'video' ? videos : images).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
                  {mediaTab === 'video' ? (
                    <Film className="w-8 h-8 text-zinc-600" />
                  ) : (
                    <Image className="w-8 h-8 text-zinc-600" />
                  )}
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No {mediaTab === 'video' ? 'videos' : 'images'}</h3>
                <p className="text-sm text-zinc-500 mb-4">
                  Sync your ad account to load media from Meta
                </p>
                <button
                  onClick={handleSync}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
                >
                  Sync Media
                </button>
              </div>
            ) : (
              <GalleryGrid
                items={mediaTab === 'video' ? videos : images}
                isLoading={false}
                onSelect={handleSelect}
                onStar={toggleStar}
                onMenu={handleMenuClick}
                videoSources={videoSources}
                onRequestVideoSource={fetchVideoSource}
              />
            )
          ) : (
            <MediaTable
              items={mediaTab === 'video' ? videos : images}
              isLoading={isLoading}
              sortField={sortBy}
              sortDirection={sortDesc ? 'desc' : 'asc'}
              onSort={handleTableSort}
              onSelect={(id) => handleSelect(id)}
              onStar={(id) => toggleStar(id)}
              starredIds={starredIds}
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

      {/* Launch Wizard */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <LaunchWizard
            adAccountId={currentAccountId}
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

      {/* Theater Modal */}
      <TheaterModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={handleCloseDetail}
        detailData={detailData}
        isLoadingDetail={isDetailLoading}
        isStarred={selectedItem ? starredIds.has(selectedItem.mediaHash) : false}
        onToggleStar={async () => {
          if (selectedItem) {
            await toggleStar(selectedItem.id)
          }
        }}
        onBuildNewAds={() => {
          if (!selectedItem) return
          const a = selectedItem
          const creative = {
            preview: a.mediaType === 'video' ? (a.thumbnailUrl || '') : (a.imageUrl || a.storageUrl || ''),
            type: a.mediaType as 'image' | 'video',
            uploaded: true,
            isFromLibrary: true,
            ...(a.mediaType === 'image' ? { imageHash: a.mediaHash } : { videoId: a.mediaHash, thumbnailUrl: a.thumbnailUrl || undefined }),
          }
          setWizardCreatives([creative])
          setSelectedItem(null)
          setDetailData(null)
          setShowLaunchWizard(true)
        }}
        // AI Analysis props
        analysisStatus={analysisStatus}
        analysis={analysis}
        scriptSuggestions={scriptSuggestions}
        analyzedAt={analyzedAt}
        analysisError={analysisError}
        isPro={isPro}
        isAnalyzing={isAnalyzing}
        onAnalyze={handleAnalyze}
        onReanalyze={handleReanalyze}
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
              onClick={handleDeleteMedia}
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
              {menuDeleting ? 'Deleting...' : 'Delete from Meta'}
            </button>
          )}

          {menuError && !menuUsageInfo?.inUse && (
            <div className="px-4 py-2 text-xs text-red-400 border-t border-zinc-700">
              {menuError}
            </div>
          )}
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
