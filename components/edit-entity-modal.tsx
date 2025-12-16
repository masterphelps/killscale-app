'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Wand2 } from 'lucide-react'

type EntityType = 'campaign' | 'adset' | 'ad'

type EditEntityModalProps = {
  isOpen: boolean
  onClose: () => void
  entityType: EntityType
  entityId: string
  entityName: string
  campaignName?: string  // For ads/adsets, to build UTM template
  adsetId?: string       // For ads, to build UTM template
  adAccountId?: string   // For updating creatives
  userId: string
  onUpdate: () => void   // Callback to refresh data after update
}

export function EditEntityModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  campaignName,
  adsetId,
  adAccountId,
  userId,
  onUpdate,
}: EditEntityModalProps) {
  const [name, setName] = useState(entityName)
  const [urlTags, setUrlTags] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingUtm, setIsFetchingUtm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch current UTM tags for ads
  useEffect(() => {
    if (isOpen && entityType === 'ad') {
      fetchUrlTags()
    }
  }, [isOpen, entityType, entityId])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(entityName)
      setError(null)
      setSuccess(null)
    }
  }, [isOpen, entityName])

  const fetchUrlTags = async () => {
    setIsFetchingUtm(true)
    try {
      const res = await fetch(`/api/meta/get-url-tags?userId=${userId}&adId=${entityId}`)
      const data = await res.json()
      if (data.success) {
        setUrlTags(data.urlTags || '')
      }
    } catch (err) {
      console.error('Failed to fetch URL tags:', err)
    } finally {
      setIsFetchingUtm(false)
    }
  }

  const applyKillScaleTemplate = () => {
    // Don't URL encode - Meta handles that when appending to destination URLs
    // Replace spaces with underscores for cleaner tracking
    const safeCampaignName = (campaignName || 'campaign').replace(/\s+/g, '_')
    const template = [
      'utm_source=facebook',
      'utm_medium=paid',
      `utm_campaign=${safeCampaignName}`,
      `utm_content=${entityId}`,
      `utm_term=${adsetId || ''}`,
    ].join('&')
    setUrlTags(template)
  }

  const handleSaveName = async () => {
    if (!name.trim() || name === entityName) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, entityId, entityType, name: name.trim() })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('Name updated!')
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveUrlTags = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/meta/update-url-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adId: entityId, adAccountId, urlTags })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess('UTM parameters updated!')
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update UTM parameters')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const content = (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">
            Edit {entityType === 'adset' ? 'Ad Set' : entityType.charAt(0).toUpperCase() + entityType.slice(1)}
          </h2>
          <p className="text-sm text-zinc-500 truncate max-w-[250px]">{entityName}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Name field - all entity types */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Name</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSaveName}
            disabled={isLoading || !name.trim() || name === entityName}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>

      {/* UTM Parameters - ads only */}
      {entityType === 'ad' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">UTM Parameters</label>
            <button
              onClick={applyKillScaleTemplate}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
            >
              <Wand2 className="w-3 h-3" />
              Use KillScale Template
            </button>
          </div>

          {isFetchingUtm ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : (
            <>
              <textarea
                value={urlTags}
                onChange={(e) => setUrlTags(e.target.value)}
                placeholder="utm_source=facebook&utm_medium=paid&..."
                rows={3}
                className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-white text-sm font-mono focus:outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Parameters appended to destination URLs
              </p>
              <button
                onClick={handleSaveUrlTags}
                disabled={isLoading}
                className="mt-3 w-full px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save UTM Parameters'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Info text for budget editing */}
      {(entityType === 'campaign' || entityType === 'adset') && (
        <div className="text-sm text-zinc-500 border-t border-border pt-4">
          To edit budget, use the budget button on the {entityType} row.
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Mobile: Bottom sheet */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full bg-bg-card rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
          {content}
          <div className="h-6" />
        </div>
      </div>

      {/* Desktop: Centered modal */}
      <div className="hidden lg:block">
        <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {content}
        </div>
      </div>
    </>
  )
}
