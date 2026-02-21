'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  ArrowLeft,
  Save,
  Download,
  Loader2,
  CheckCircle,
  Send,
  Type,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  Upload,
  ImageIcon,
  Megaphone,
  Undo2,
  Redo2,
  AlertCircle,
} from 'lucide-react'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImageVersion {
  url: string
  prompt: string
  createdAt: string
  base64?: string
  mimeType?: string
}

interface DetectedTextBlock {
  text: string
  role: 'headline' | 'subtext' | 'cta' | 'other'
  label: string // e.g. "Headline", "Body 2", "CTA"
}

interface ImageEditorSession {
  id: string
  user_id: string
  workspace_id: string | null
  source_type: string
  source_id: string | null
  original_image_url: string
  versions: ImageVersion[]
  detected_text: DetectedTextBlock[]
  created_at: string
  updated_at: string
}

// ─── Role badge config ──────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; prefix: string; class: string }> = {
  headline: { label: 'Headline', prefix: 'Headline', class: 'bg-purple-500/15 text-purple-300 border-purple-500/25' },
  subtext:  { label: 'Body',     prefix: 'Body',     class: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
  cta:      { label: 'CTA',      prefix: 'CTA',      class: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  other:    { label: 'Text',     prefix: 'Text',     class: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25' },
}

// ─── Assign unique labels to text blocks ─────────────────────────────────────

function assignLabels(blocks: Omit<DetectedTextBlock, 'label'>[]): DetectedTextBlock[] {
  const counts: Record<string, number> = {}
  const roleTotal: Record<string, number> = {}

  // Count how many of each role
  for (const b of blocks) {
    roleTotal[b.role] = (roleTotal[b.role] || 0) + 1
  }

  return blocks.map(b => {
    const prefix = ROLE_CONFIG[b.role]?.prefix || 'Text'
    counts[b.role] = (counts[b.role] || 0) + 1
    const total = roleTotal[b.role] || 1
    // Only number if there are multiples
    const label = total > 1 ? `${prefix} ${counts[b.role]}` : prefix
    return { ...b, label }
  })
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ImageEditorPage() {
  const { user } = useAuth()
  const { currentAccountId, currentWorkspaceId } = useAccount()
  const searchParams = useSearchParams()
  const router = useRouter()

  // URL params
  const sessionIdParam = searchParams.get('sessionId')
  const imageUrlParam = searchParams.get('imageUrl')
  const mediaIdParam = searchParams.get('mediaId')
  const returnToParam = searchParams.get('returnTo')

  // Image state
  const [originalImage, setOriginalImage] = useState<{ base64: string; mimeType: string; url: string } | null>(null)
  const [versions, setVersions] = useState<ImageVersion[]>([])
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1) // -1 = original
  const [isLoading, setIsLoading] = useState(true)

  // Editing state
  const [isEditing, setIsEditing] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(sessionIdParam)
  const [editError, setEditError] = useState<string | null>(null)

  // Text detection state
  const [detectedText, setDetectedText] = useState<DetectedTextBlock[]>([])
  const [isDetectingText, setIsDetectingText] = useState(false)
  const [textPanelOpen, setTextPanelOpen] = useState(true) // open by default
  const [editingTextIndex, setEditingTextIndex] = useState<number | null>(null)
  const [editTextValue, setEditTextValue] = useState('')

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Upload state (drag and drop)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Launch wizard state
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [launchCreatives, setLaunchCreatives] = useState<Creative[]>([])

  // Version strip scroll
  const stripRef = useRef<HTMLDivElement>(null)

  // Image transition
  const [imageKey, setImageKey] = useState(0)

  // Prompt input ref for keyboard focus
  const promptRef = useRef<HTMLTextAreaElement>(null)

  // ─── Build label-to-text map for @reference expansion ──────────────────────

  const labelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const block of detectedText) {
      map[block.label.toLowerCase()] = block.text
    }
    return map
  }, [detectedText])

  // All label names for highlighting
  const labelNames = useMemo(() => detectedText.map(b => b.label), [detectedText])

  // ─── Expand @references in prompt ──────────────────────────────────────────

  const expandPrompt = useCallback((rawPrompt: string): string => {
    if (!rawPrompt.includes('@') || detectedText.length === 0) return rawPrompt

    let expanded = rawPrompt
    for (const block of detectedText) {
      const regex = new RegExp(`@${block.label.replace(/\s+/g, '\\s*')}`, 'gi')
      expanded = expanded.replace(regex, `the text "${block.text}"`)
    }
    return expanded
  }, [detectedText])

  // ─── Current displayed image ─────────────────────────────────────────────────

  const currentImage = currentVersionIndex === -1
    ? originalImage
    : (() => {
        const v = versions[currentVersionIndex]
        return v ? { base64: v.base64 || '', mimeType: v.mimeType || 'image/png', url: v.url } : originalImage
      })()

  const currentImageUrl = currentVersionIndex === -1
    ? originalImage?.url
    : versions[currentVersionIndex]?.url

  // ─── Navigation helpers ──────────────────────────────────────────────────────

  const canUndo = currentVersionIndex > -1
  const canRedo = currentVersionIndex < versions.length - 1

  const handleUndo = useCallback(() => {
    if (!canUndo) return
    const newIdx = currentVersionIndex - 1
    setCurrentVersionIndex(newIdx)
    setImageKey(k => k + 1)
  }, [canUndo, currentVersionIndex])

  const handleRedo = useCallback(() => {
    if (!canRedo) return
    const newIdx = currentVersionIndex + 1
    setCurrentVersionIndex(newIdx)
    setImageKey(k => k + 1)
  }, [canRedo, currentVersionIndex])

  const handleBack = useCallback(() => {
    if (returnToParam) {
      router.push(decodeURIComponent(returnToParam))
    } else {
      router.back()
    }
  }, [returnToParam, router])

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Cmd+Z = undo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      // Cmd+Shift+Z = redo
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      }
      // Cmd+S = save
      if (isMod && e.key === 's') {
        e.preventDefault()
        handleSaveToLibrary()
      }
      // / = focus prompt
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        promptRef.current?.focus()
      }
      // Esc = close text panel or blur input
      if (e.key === 'Escape') {
        if (editingTextIndex !== null) {
          setEditingTextIndex(null)
        } else if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
          (document.activeElement as HTMLElement).blur()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleUndo, handleRedo, editingTextIndex])

  // ─── Fetch image as base64 from URL ──────────────────────────────────────────

  const fetchImageAsBase64 = useCallback(async (url: string): Promise<{ base64: string; mimeType: string }> => {
    const res = await fetch(url)
    const blob = await res.blob()
    const mimeType = blob.type || 'image/png'
    const buffer = await blob.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    return { base64, mimeType }
  }, [])

  // ─── Create session ──────────────────────────────────────────────────────────

  const createSession = useCallback(async (imageUrl: string, sourceType: string, sourceId?: string) => {
    if (!user?.id) return null
    try {
      const res = await fetch('/api/creative-studio/image-editor-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          workspaceId: currentWorkspaceId,
          sourceType,
          sourceId,
          originalImageUrl: imageUrl,
        }),
      })
      const data = await res.json()
      if (data.session) {
        setSessionId(data.session.id)
        return data.session.id
      }
    } catch (err) {
      console.error('[ImageEditor] Failed to create session:', err)
    }
    return null
  }, [user?.id, currentWorkspaceId])

  // ─── Persist versions to session ─────────────────────────────────────────────

  const persistVersions = useCallback(async (newVersions: ImageVersion[], newDetectedText?: DetectedTextBlock[]) => {
    if (!user?.id || !sessionId) return
    try {
      const body: Record<string, unknown> = {
        userId: user.id,
        sessionId,
        versions: newVersions,
      }
      if (newDetectedText !== undefined) {
        body.detectedText = newDetectedText
      }
      await fetch('/api/creative-studio/image-editor-session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error('[ImageEditor] Failed to persist session:', err)
    }
  }, [user?.id, sessionId])

  // ─── Detect text ─────────────────────────────────────────────────────────────

  const detectText = useCallback(async (base64: string, mimeType: string) => {
    setIsDetectingText(true)
    try {
      const res = await fetch('/api/creative-studio/detect-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, imageMimeType: mimeType }),
      })
      const data = await res.json()
      if (data.textBlocks) {
        const labeled = assignLabels(data.textBlocks)
        setDetectedText(labeled)
        // Persist to session
        if (sessionId && user?.id) {
          persistVersions(versions, labeled)
        }
        return labeled
      }
    } catch (err) {
      console.error('[ImageEditor] Text detection failed:', err)
    } finally {
      setIsDetectingText(false)
    }
    return []
  }, [sessionId, user?.id, versions, persistVersions])

  // ─── Load image from URL param ───────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return

    const loadImage = async () => {
      setIsLoading(true)
      try {
        // Resume existing session
        if (sessionIdParam) {
          const res = await fetch(`/api/creative-studio/image-editor-session?userId=${user.id}&sessionId=${sessionIdParam}`)
          const data = await res.json()
          if (data.session) {
            const session: ImageEditorSession = data.session
            const { base64, mimeType } = await fetchImageAsBase64(session.original_image_url)
            setOriginalImage({ base64, mimeType, url: session.original_image_url })
            setVersions(session.versions || [])
            const existing = session.detected_text || []
            // Re-assign labels if they don't have them
            const labeled = existing.length > 0 && !existing[0].label
              ? assignLabels(existing)
              : existing
            setDetectedText(labeled)
            if ((session.versions || []).length > 0) {
              setCurrentVersionIndex(session.versions.length - 1)
            }
            setSessionId(session.id)
          }
        }
        // Start from URL
        else if (imageUrlParam) {
          const url = decodeURIComponent(imageUrlParam)
          const { base64, mimeType } = await fetchImageAsBase64(url)
          setOriginalImage({ base64, mimeType, url })
          await createSession(url, 'generated')
          detectText(base64, mimeType)
        }
        // Start from media library ID
        else if (mediaIdParam) {
          const url = mediaIdParam
          const { base64, mimeType } = await fetchImageAsBase64(url)
          setOriginalImage({ base64, mimeType, url })
          await createSession(url, 'library', mediaIdParam)
          detectText(base64, mimeType)
        }
      } catch (err) {
        console.error('[ImageEditor] Failed to load image:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadImage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionIdParam, imageUrlParam, mediaIdParam])

  // ─── Get base64 for current image ───────────────────────────────────────────

  const getCurrentBase64 = useCallback(async (): Promise<{ base64: string; mimeType: string } | null> => {
    if (currentVersionIndex === -1) {
      return originalImage ? { base64: originalImage.base64, mimeType: originalImage.mimeType } : null
    }
    const v = versions[currentVersionIndex]
    if (!v) return null
    if (v.base64) return { base64: v.base64, mimeType: v.mimeType || 'image/png' }
    return fetchImageAsBase64(v.url)
  }, [currentVersionIndex, originalImage, versions, fetchImageAsBase64])

  // ─── Submit edit prompt ──────────────────────────────────────────────────────

  const handleSubmitPrompt = useCallback(async (editPrompt?: string) => {
    const rawPrompt = editPrompt || prompt.trim()
    if (!rawPrompt || isEditing) return

    // Expand @references to actual text content
    const expandedPrompt = expandPrompt(rawPrompt)

    const imageData = await getCurrentBase64()
    if (!imageData) return

    setIsEditing(true)
    setEditError(null)
    try {
      // Step 1: Adjust image via Gemini
      const adjustRes = await fetch('/api/creative-studio/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageData.base64,
          imageMimeType: imageData.mimeType,
          adjustmentPrompt: expandedPrompt,
        }),
      })

      if (!adjustRes.ok) {
        const err = await adjustRes.json()
        throw new Error(err.error || 'Image adjustment failed')
      }

      const adjustData = await adjustRes.json()
      const newBase64 = adjustData.image.base64
      const newMimeType = adjustData.image.mimeType

      // Step 2: Upload to Supabase Storage
      let storageUrl = ''
      if (currentAccountId) {
        const saveRes = await fetch('/api/creative-studio/save-generated-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: newBase64,
            mimeType: newMimeType,
            adAccountId: currentAccountId,
            userId: user?.id,
            saveToLibrary: false,
          }),
        })
        const saveData = await saveRes.json()
        storageUrl = saveData.storageUrl || ''
      }

      // Step 3: Create new version
      const newVersion: ImageVersion = {
        url: storageUrl,
        prompt: rawPrompt, // Store original prompt (with @references) for display
        createdAt: new Date().toISOString(),
        base64: newBase64,
        mimeType: newMimeType,
      }

      // If editing from a past version, discard future versions
      const baseVersions = currentVersionIndex === -1
        ? []
        : versions.slice(0, currentVersionIndex + 1)
      const newVersions = [...baseVersions, newVersion]

      setVersions(newVersions)
      setCurrentVersionIndex(newVersions.length - 1)
      setImageKey(k => k + 1)
      setPrompt('')

      // Step 4: Persist and re-detect text
      await persistVersions(newVersions)
      detectText(newBase64, newMimeType)
    } catch (err) {
      console.error('[ImageEditor] Edit failed:', err)
      setEditError(err instanceof Error ? err.message : 'Edit failed. Please try again.')
      setTimeout(() => setEditError(null), 5000)
    } finally {
      setIsEditing(false)
    }
  }, [prompt, isEditing, expandPrompt, getCurrentBase64, currentAccountId, user?.id, currentVersionIndex, versions, persistVersions, detectText])

  // ─── Text replacement ────────────────────────────────────────────────────────

  const handleTextReplace = useCallback(async (oldText: string, newText: string) => {
    if (!newText.trim() || oldText === newText) return
    const editPrompt = `Change the text "${oldText}" to "${newText}". Keep everything else identical.`
    setEditingTextIndex(null)
    await handleSubmitPrompt(editPrompt)
  }, [handleSubmitPrompt])

  // ─── Insert @reference at cursor ───────────────────────────────────────────

  const insertReference = useCallback((label: string) => {
    const ref = `@${label}`
    const textarea = promptRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = prompt.slice(0, start)
      const after = prompt.slice(end)
      // Add space before if needed
      const prefix = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : ''
      const suffix = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n') ? ' ' : ''
      const newPrompt = before + prefix + ref + suffix + after
      setPrompt(newPrompt)
      // Focus and set cursor after the inserted reference
      setTimeout(() => {
        textarea.focus()
        const newPos = (before + prefix + ref + suffix).length
        textarea.setSelectionRange(newPos, newPos)
      }, 0)
    } else {
      setPrompt(prev => (prev ? prev + ' ' + ref : ref))
    }
  }, [prompt])

  // ─── File upload handling ────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type

      if (!currentAccountId || !user?.id) return
      setIsLoading(true)
      try {
        const saveRes = await fetch('/api/creative-studio/save-generated-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            mimeType,
            adAccountId: currentAccountId,
            userId: user.id,
            saveToLibrary: false,
            name: file.name,
          }),
        })
        const saveData = await saveRes.json()
        const url = saveData.storageUrl
        if (url) {
          setOriginalImage({ base64, mimeType, url })
          await createSession(url, 'upload')
          detectText(base64, mimeType)
        }
      } catch (err) {
        console.error('[ImageEditor] Upload failed:', err)
      } finally {
        setIsLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }, [currentAccountId, user?.id, createSession, detectText])

  // ─── Drag and drop handlers ──────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  // ─── Save to library ─────────────────────────────────────────────────────────

  const handleSaveToLibrary = useCallback(async () => {
    if (isSaving || !currentAccountId || !user?.id) return
    const imageData = await getCurrentBase64()
    if (!imageData) return

    setIsSaving(true)
    try {
      const res = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: imageData.base64,
          mimeType: imageData.mimeType,
          adAccountId: currentAccountId,
          userId: user.id,
          saveToLibrary: true,
          name: `AI Edit - ${new Date().toLocaleDateString()}`,
        }),
      })
      const data = await res.json()
      if (data.storageUrl) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.error('[ImageEditor] Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, currentAccountId, user?.id, getCurrentBase64])

  // ─── Download ────────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    const imageData = await getCurrentBase64()
    if (!imageData) return
    const ext = imageData.mimeType.includes('png') ? 'png' : imageData.mimeType.includes('webp') ? 'webp' : 'jpg'
    const link = document.createElement('a')
    link.href = `data:${imageData.mimeType};base64,${imageData.base64}`
    link.download = `killscale-edit-${Date.now()}.${ext}`
    link.click()
  }, [getCurrentBase64])

  // ─── Launch as Ad ────────────────────────────────────────────────────────────

  const handleLaunchAsAd = useCallback(async () => {
    if (!currentAccountId || !user?.id) return
    const imageData = await getCurrentBase64()
    if (!imageData) return

    const res = await fetch('/api/creative-studio/save-generated-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: imageData.base64,
        mimeType: imageData.mimeType,
        adAccountId: currentAccountId,
        userId: user.id,
        saveToLibrary: true,
        name: `AI Edit - ${new Date().toLocaleDateString()}`,
      }),
    })
    const data = await res.json()
    if (data.mediaHash) {
      setLaunchCreatives([{
        preview: data.storageUrl || currentImageUrl || '',
        type: 'image' as const,
        imageHash: data.mediaHash,
        uploaded: true,
      }])
      setShowLaunchWizard(true)
    }
  }, [currentAccountId, user?.id, getCurrentBase64, currentImageUrl])

  // ─── Version strip scroll ────────────────────────────────────────────────────

  const scrollStrip = useCallback((dir: 'left' | 'right') => {
    if (!stripRef.current) return
    const amount = dir === 'left' ? -200 : 200
    stripRef.current.scrollBy({ left: amount, behavior: 'smooth' })
  }, [])

  // ─── Render highlighted prompt text (overlay) ──────────────────────────────

  const renderHighlightedPrompt = useCallback((text: string) => {
    if (labelNames.length === 0 || !text.includes('@')) return text

    // Build regex matching @Label patterns
    const escaped = labelNames.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'gi')
    const parts = text.split(pattern)

    return parts.map((part, i) => {
      if (pattern.test(part)) {
        // Reset lastIndex since we reuse the regex
        pattern.lastIndex = 0
        return <span key={i} className="text-purple-400 font-medium">{part}</span>
      }
      pattern.lastIndex = 0
      return <span key={i}>{part}</span>
    })
  }, [labelNames])

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-bg-dark flex items-center justify-center z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-zinc-500 text-sm">Loading editor...</p>
        </div>
      </div>
    )
  }

  // Upload zone (no image loaded)
  if (!originalImage) {
    return (
      <div className="fixed inset-0 bg-bg-dark flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center px-4 lg:px-6 py-3 border-b border-border">
          <button onClick={handleBack} className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-500" />
          </button>
          <h1 className="ml-2 text-base font-semibold text-white tracking-tight">AI Image Editor</h1>
        </div>

        {/* Drop zone */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div
            className={`w-full max-w-md rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-5 py-20 px-8 cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-purple-400 bg-purple-500/8 scale-[1.01]'
                : 'border-zinc-700 hover:border-zinc-500 hover:bg-white/[0.02]'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors duration-200 ${
              isDragging ? 'bg-purple-500/15' : 'bg-zinc-800'
            }`}>
              <Upload className={`w-6 h-6 transition-colors duration-200 ${isDragging ? 'text-purple-400' : 'text-zinc-500'}`} />
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">Drop an image or click to browse</p>
              <p className="text-zinc-600 text-xs mt-1.5">PNG, JPG, or WebP</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // ─── Main editor layout ──────────────────────────────────────────────────────

  const versionLabel = currentVersionIndex === -1
    ? 'Original'
    : `v${currentVersionIndex + 1}`

  return (
    <div className="fixed inset-0 bg-bg-dark flex flex-col z-50">
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 lg:px-5 py-2.5 border-b border-border bg-bg-dark">
        <div className="flex items-center gap-2">
          <button onClick={handleBack} className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-500" />
          </button>

          <div className="h-5 w-px bg-border mx-1 hidden lg:block" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-2 rounded-lg hover:bg-bg-hover text-zinc-500 hover:text-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-2 rounded-lg hover:bg-bg-hover text-zinc-500 hover:text-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Version badge */}
          {versions.length > 0 && (
            <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-md">
              {versionLabel} / {versions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Text toggle */}
          <button
            onClick={() => setTextPanelOpen(!textPanelOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              textPanelOpen
                ? 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/25'
                : 'text-zinc-500 hover:bg-bg-hover hover:text-zinc-300'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Text</span>
            {detectedText.length > 0 && (
              <span className={`text-[10px] font-mono ${textPanelOpen ? 'text-purple-400' : 'text-zinc-600'}`}>
                {detectedText.length}
              </span>
            )}
          </button>

          <div className="h-5 w-px bg-border mx-0.5 hidden lg:block" />

          {/* Save */}
          <button
            onClick={handleSaveToLibrary}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:bg-bg-hover hover:text-zinc-300 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Save to library (Cmd+S)"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline">{saved ? 'Saved' : 'Save'}</span>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:bg-bg-hover hover:text-zinc-300 transition-all duration-150"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Download</span>
          </button>

          {/* Create Ad */}
          <button
            onClick={handleLaunchAsAd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Create Ad</span>
          </button>
        </div>
      </div>

      {/* ─── Main content area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ─── Text Detection Panel ─────────────────────────────────────────── */}
        <div
          className={`absolute lg:relative z-10 transition-all duration-200 ease-out ${
            textPanelOpen
              ? 'left-0 bottom-0 right-0 lg:right-auto top-auto lg:top-0 h-[45vh] lg:h-auto lg:w-72 xl:w-80 translate-y-0 lg:translate-y-0'
              : 'left-0 bottom-0 right-0 lg:right-auto top-auto lg:top-0 h-0 lg:h-auto lg:w-0 translate-y-full lg:translate-y-0'
          } overflow-hidden`}
        >
          <div className="h-full lg:h-full w-full bg-bg-card border-t lg:border-t-0 lg:border-r border-border flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Type className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-white tracking-wide uppercase">Detected Text</span>
                {detectedText.length > 0 && (
                  <span className="text-[10px] text-zinc-600 font-mono">{detectedText.length}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!isDetectingText && (
                  <button
                    onClick={async () => {
                      const imgData = await getCurrentBase64()
                      if (imgData) detectText(imgData.base64, imgData.mimeType)
                    }}
                    className="px-2 py-1 rounded-md text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                  >
                    Re-detect
                  </button>
                )}
                <button onClick={() => setTextPanelOpen(false)} className="p-1.5 rounded-md hover:bg-bg-hover transition-colors lg:hidden">
                  <X className="w-3.5 h-3.5 text-zinc-600" />
                </button>
              </div>
            </div>

            {/* Hint */}
            {detectedText.length > 0 && (
              <div className="px-4 py-2 border-b border-border/50 bg-purple-500/5">
                <p className="text-[10px] text-purple-400/70 leading-relaxed">
                  Click a text block to insert <span className="font-mono text-purple-300">@Reference</span> in your prompt. References highlight <span className="text-purple-300">purple</span> as you type.
                </p>
              </div>
            )}

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {isDetectingText ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                  <p className="text-xs text-zinc-600">Detecting text...</p>
                </div>
              ) : detectedText.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <ImageIcon className="w-7 h-7 text-zinc-700" />
                  <p className="text-xs text-zinc-600 text-center leading-relaxed">No text detected in this image</p>
                  <button
                    onClick={async () => {
                      const imgData = await getCurrentBase64()
                      if (imgData) detectText(imgData.base64, imgData.mimeType)
                    }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                  >
                    Detect Text
                  </button>
                </div>
              ) : (
                detectedText.map((block, idx) => (
                  <div
                    key={idx}
                    className="group rounded-lg border border-border bg-bg-dark/50 hover:bg-bg-hover/50 transition-colors duration-150"
                  >
                    {editingTextIndex === idx ? (
                      <div className="p-3 space-y-2">
                        <input
                          type="text"
                          value={editTextValue}
                          onChange={(e) => setEditTextValue(e.target.value)}
                          className="w-full px-3 py-2 bg-bg-dark border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTextReplace(block.text, editTextValue)
                            if (e.key === 'Escape') setEditingTextIndex(null)
                          }}
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleTextReplace(block.text, editTextValue)}
                            disabled={isEditing || editTextValue === block.text}
                            className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-40"
                          >
                            {isEditing ? 'Applying...' : 'Replace Text'}
                          </button>
                          <button
                            onClick={() => setEditingTextIndex(null)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-2.5 flex items-start justify-between gap-2 cursor-pointer"
                        onClick={() => insertReference(block.label)}
                        title={`Click to insert @${block.label} in prompt`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wider border ${ROLE_CONFIG[block.role]?.class || ROLE_CONFIG.other.class}`}>
                              {block.label}
                            </span>
                          </div>
                          <p className="text-[13px] text-zinc-300 leading-snug line-clamp-2">{block.text}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingTextIndex(idx)
                            setEditTextValue(block.text)
                          }}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all duration-150 shrink-0"
                          title="Edit text directly"
                        >
                          <Pencil className="w-3 h-3 text-zinc-500" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ─── Image display ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center p-3 lg:p-6 min-w-0">
          <div className="relative max-w-full max-h-full">
            {/* Edit loading overlay */}
            {isEditing && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] rounded-lg flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">Applying edit...</p>
                </div>
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imageKey}
              src={currentImageUrl || originalImage.url}
              alt="Editor"
              className="max-h-[calc(100vh-240px)] lg:max-h-[calc(100vh-220px)] max-w-full object-contain rounded-lg animate-in fade-in duration-200"
            />
          </div>
        </div>
      </div>

      {/* ─── Bottom bar ───────────────────────────────────────────────────────── */}
      <div className="border-t border-border bg-bg-dark">
        {/* Version thumbnail strip */}
        {versions.length > 0 && (
          <div className="px-3 py-2 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              {versions.length > 5 && (
                <button onClick={() => scrollStrip('left')} className="p-1 rounded hover:bg-bg-hover transition-colors shrink-0">
                  <ChevronLeft className="w-3.5 h-3.5 text-zinc-600" />
                </button>
              )}

              <div ref={stripRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {/* Original */}
                <button
                  onClick={() => { setCurrentVersionIndex(-1); setImageKey(k => k + 1) }}
                  className={`relative shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-md overflow-hidden border transition-all duration-150 ${
                    currentVersionIndex === -1
                      ? 'border-purple-500 ring-1 ring-purple-500/30 scale-105'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={originalImage.url} alt="Original" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent text-[8px] text-center text-zinc-300 pt-2 pb-0.5 font-medium">
                    Orig
                  </span>
                </button>

                {/* Version thumbnails */}
                {versions.map((v, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setCurrentVersionIndex(idx); setImageKey(k => k + 1) }}
                    className={`group/thumb relative shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-md overflow-hidden border transition-all duration-150 ${
                      currentVersionIndex === idx
                        ? 'border-purple-500 ring-1 ring-purple-500/30 scale-105'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                    title={v.prompt}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt={`v${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent text-[8px] text-center text-zinc-300 pt-2 pb-0.5 font-medium">
                      v{idx + 1}
                    </span>
                    {/* Prompt tooltip on hover (desktop) */}
                    <div className="hidden lg:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/thumb:opacity-100 pointer-events-none transition-opacity duration-150 z-20">
                      <div className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-[10px] text-zinc-300 whitespace-nowrap max-w-[200px] truncate shadow-lg">
                        {v.prompt}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {versions.length > 5 && (
                <button onClick={() => scrollStrip('right')} className="p-1 rounded hover:bg-bg-hover transition-colors shrink-0">
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error toast */}
        {editError && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-xs text-red-300 flex-1">{editError}</p>
            <button onClick={() => setEditError(null)} className="p-0.5 rounded hover:bg-red-500/20 transition-colors">
              <X className="w-3 h-3 text-red-400" />
            </button>
          </div>
        )}

        {/* Prompt input area */}
        <div className="px-3 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmitPrompt()
            }}
            className="flex items-end gap-2"
          >
            <div className="relative flex-1">
              {/* Highlight overlay - renders colored text behind the transparent textarea */}
              <div
                className="absolute inset-0 px-4 py-3 text-sm leading-relaxed pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
                aria-hidden="true"
              >
                {renderHighlightedPrompt(prompt)}
              </div>
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={detectedText.length > 0
                  ? 'Describe your edit... use @Headline, @Body, @CTA to reference detected text'
                  : 'Describe how to edit this image...'
                }
                disabled={isEditing}
                rows={2}
                onKeyDown={(e) => {
                  // Submit on Enter (without shift)
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitPrompt()
                  }
                }}
                className="w-full px-4 py-3 bg-bg-card border-2 border-zinc-700/80 rounded-xl text-transparent caret-white placeholder-zinc-600 text-sm leading-relaxed focus:outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15 transition-all disabled:opacity-40 resize-none selection:bg-purple-500/30 selection:text-white"
                style={{ caretColor: 'white' }}
              />
              {/* Placeholder visible text overlay when prompt is empty (for highlighted placeholder) */}
              {!prompt && (
                <kbd className="absolute right-3 bottom-3 text-[9px] text-zinc-700 bg-zinc-800 px-1.5 py-0.5 rounded font-mono pointer-events-none hidden lg:inline-block">
                  /
                </kbd>
              )}
            </div>
            <button
              type="submit"
              disabled={!prompt.trim() || isEditing}
              className="p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              {isEditing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ─── Launch Wizard ────────────────────────────────────────────────────── */}
      {showLaunchWizard && currentAccountId && (
        <LaunchWizard
          adAccountId={currentAccountId}
          preloadedCreatives={launchCreatives}
          onComplete={() => setShowLaunchWizard(false)}
          onCancel={() => setShowLaunchWizard(false)}
        />
      )}
    </div>
  )
}
