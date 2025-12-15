'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, DollarSign, MessageSquare, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const EVENT_TYPES = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'lead', label: 'Lead' },
  { value: 'signup', label: 'Sign Up' },
  { value: 'contact', label: 'Contact' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'quote', label: 'Quote Request' },
  { value: 'call', label: 'Phone Call' },
  { value: 'walkin', label: 'Walk-In' },
]

interface ActiveAd {
  adId: string
  adName: string
  campaignName: string
  spend: number
  spendPercentage: number
}

interface LogWalkinModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  userId: string
  defaultValue?: number
  onSuccess?: () => void
}

export function LogWalkinModal({
  isOpen,
  onClose,
  workspaceId,
  userId,
  defaultValue = 100,
  onSuccess
}: LogWalkinModalProps) {
  const [eventType, setEventType] = useState('purchase')
  const [value, setValue] = useState(defaultValue.toString())
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [ads, setAds] = useState<ActiveAd[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingAds, setLoadingAds] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showEventDropdown, setShowEventDropdown] = useState(false)

  // Load active ads when modal opens
  useEffect(() => {
    if (isOpen && workspaceId) {
      loadActiveAds()
    }
  }, [isOpen, workspaceId])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEventType('purchase')
      setValue(defaultValue.toString())
      setSelectedAdId(null)
      setNotes('')
      setError(null)
      setSuccess(false)
      setShowEventDropdown(false)
    }
  }, [isOpen, defaultValue])

  const loadActiveAds = async () => {
    setLoadingAds(true)
    try {
      const res = await fetch(`/api/workspace/active-ads?workspaceId=${workspaceId}&userId=${userId}`)
      const data = await res.json()
      if (data.ads) {
        setAds(data.ads)
      }
    } catch (err) {
      console.error('Failed to load active ads:', err)
    } finally {
      setLoadingAds(false)
    }
  }

  const handleSubmit = async () => {
    // Only validate value for purchase events
    let numValue: number | undefined = undefined
    if (eventType === 'purchase') {
      numValue = parseFloat(value)
      if (isNaN(numValue) || numValue <= 0) {
        setError('Please enter a valid amount')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/pixel/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          eventType,
          eventValue: numValue,
          adId: selectedAdId || undefined,
          notes: notes || undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log walk-in')
      }

      setSuccess(true)
      setTimeout(() => {
        onClose()
        onSuccess?.()
      }, 1500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log walk-in')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const content = (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Log Walk-In Sale</h2>
          <p className="text-sm text-zinc-500">Record an offline conversion</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Success message */}
      {success && (
        <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-center">
          Walk-in logged successfully!
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {!success && (
        <>
          {/* Event Type */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Event Type</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEventDropdown(!showEventDropdown)}
                className="w-full flex items-center justify-between px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
              >
                <span>{EVENT_TYPES.find(e => e.value === eventType)?.label || 'Select type'}</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", showEventDropdown && "rotate-180")} />
              </button>
              {showEventDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowEventDropdown(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                    {EVENT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setEventType(type.value)
                          setShowEventDropdown(false)
                        }}
                        className={cn(
                          "w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 transition-colors",
                          eventType === type.value && "bg-zinc-700 text-accent"
                        )}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sale Amount - only for purchase */}
          {eventType === 'purchase' && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Sale Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full pl-8 pr-4 py-3 bg-bg-dark border border-border rounded-lg text-white text-lg font-medium focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {/* Ad Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Which ad brought them in?
            </label>
            {loadingAds ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              </div>
            ) : ads.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">
                No active ads found in the last 7 days
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {ads.map((ad) => (
                  <label
                    key={ad.adId}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedAdId === ad.adId
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-zinc-600"
                    )}
                  >
                    <input
                      type="radio"
                      name="adSelection"
                      value={ad.adId}
                      checked={selectedAdId === ad.adId}
                      onChange={() => setSelectedAdId(ad.adId)}
                      className="sr-only"
                    />
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex-shrink-0",
                      selectedAdId === ad.adId
                        ? "border-accent bg-accent"
                        : "border-zinc-500"
                    )}>
                      {selectedAdId === ad.adId && (
                        <div className="w-full h-full rounded-full bg-white scale-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ad.adName}</p>
                      <p className="text-xs text-zinc-500 truncate">{ad.campaignName}</p>
                    </div>
                    <span className="text-sm text-zinc-400 flex-shrink-0">
                      {ad.spendPercentage}%
                    </span>
                  </label>
                ))}

                {/* Split option */}
                <label
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    selectedAdId === null
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-zinc-600"
                  )}
                >
                  <input
                    type="radio"
                    name="adSelection"
                    value=""
                    checked={selectedAdId === null}
                    onChange={() => setSelectedAdId(null)}
                    className="sr-only"
                  />
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0",
                    selectedAdId === null
                      ? "border-accent bg-accent"
                      : "border-zinc-500"
                  )}>
                    {selectedAdId === null && (
                      <div className="w-full h-full rounded-full bg-white scale-50" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Not sure - split by spend</p>
                    <p className="text-xs text-zinc-500">Divide across all active ads proportionally</p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              <MessageSquare className="w-4 h-4 inline mr-1" />
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Full detail service, walk-in customer"
              className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || loadingAds}
            className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              `Log ${EVENT_TYPES.find(e => e.value === eventType)?.label || 'Event'}`
            )}
          </button>
        </>
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
