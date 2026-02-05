'use client'

import { useState, useCallback } from 'react'
import { Search, Wand2, Sparkles, ExternalLink, Copy, Check, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useSubscription } from '@/lib/subscription'
import Link from 'next/link'

interface AdLibraryAd {
  id: string
  page_name: string
  page_id: string
  ad_snapshot_url: string
  ad_creative_bodies?: string[]
  ad_creative_link_titles?: string[]
  ad_creative_link_descriptions?: string[]
  ad_delivery_start_time: string
  ad_delivery_stop_time?: string
  currency?: string
  spend?: { lower_bound: string; upper_bound: string }
  impressions?: { lower_bound: string; upper_bound: string }
  publisher_platforms?: string[]
}

interface GeneratedAd {
  headline: string
  primaryText: string
  description: string
  angle: string
  whyItWorks: string
}

export default function AdStudioPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan } = useSubscription()

  const isPro = plan === 'Scale' || plan === 'Pro'

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<AdLibraryAd[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  // Selected ad for analysis
  const [selectedAd, setSelectedAd] = useState<AdLibraryAd | null>(null)

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Product info for generation
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setSearchError(null)
    setSearchResults([])

    try {
      const res = await fetch(`/api/creative-studio/ad-library-search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()

      if (!res.ok) {
        setSearchError(data.error || 'Search failed')
        return
      }

      setSearchResults(data.ads || [])
    } catch (err) {
      setSearchError('Failed to search Ad Library')
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  const handleGenerate = useCallback(async () => {
    if (!selectedAd || !productName.trim()) return

    setIsGenerating(true)
    setGeneratedAds([])

    try {
      const res = await fetch('/api/creative-studio/generate-from-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitorAd: {
            pageName: selectedAd.page_name,
            bodies: selectedAd.ad_creative_bodies,
            headlines: selectedAd.ad_creative_link_titles,
            descriptions: selectedAd.ad_creative_link_descriptions,
          },
          productName,
          productDescription,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setGeneratedAds(data.ads || [])
    } catch (err) {
      console.error('Generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [selectedAd, productName, productDescription])

  const copyToClipboard = (ad: GeneratedAd, index: number) => {
    const text = `Headline: ${ad.headline}\n\nPrimary Text: ${ad.primaryText}\n\nDescription: ${ad.description}`
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  // Not Pro - show upgrade prompt
  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <Wand2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Ad Studio</h1>
        <p className="text-zinc-400 mb-8 max-w-md">
          Spy on competitor ads and generate winning ad copy inspired by what's working.
          Upgrade to Pro to unlock this feature.
        </p>
        <Link
          href="/pricing"
          className="px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors"
        >
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6 space-y-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Ad Studio</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 rounded">
                NEW
              </span>
            </div>
            <p className="text-zinc-500 mt-1">
              Search competitor ads in Meta Ad Library and generate winning ad copy
            </p>
          </div>

          {/* Search Section */}
          <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-zinc-400" />
              Search Competitor Ads
            </h2>

            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter competitor name or keyword..."
                className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className={cn(
                  'px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2',
                  'bg-accent hover:bg-accent-hover text-white',
                  (isSearching || !searchQuery.trim()) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Search
              </button>
            </div>

            {searchError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {searchError}
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-3 pt-4">
                <div className="text-sm text-zinc-500">{searchResults.length} ads found</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.map((ad) => (
                    <button
                      key={ad.id}
                      onClick={() => setSelectedAd(ad)}
                      className={cn(
                        'text-left bg-bg-dark border rounded-xl p-4 transition-all hover:border-accent/50',
                        selectedAd?.id === ad.id ? 'border-accent ring-1 ring-accent' : 'border-border'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="w-6 h-6 text-zinc-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{ad.page_name}</div>
                          <div className="text-xs text-zinc-500 mt-1">
                            Started {new Date(ad.ad_delivery_start_time).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      {ad.ad_creative_bodies?.[0] && (
                        <p className="text-sm text-zinc-400 mt-3 line-clamp-3">
                          {ad.ad_creative_bodies[0]}
                        </p>
                      )}
                      <a
                        href={ad.ad_snapshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-3"
                      >
                        View in Ad Library <ExternalLink className="w-3 h-3" />
                      </a>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generation Section */}
          {selectedAd && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-emerald-400" />
                Generate Ad Copy
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Selected Ad Preview */}
                <div className="bg-bg-dark border border-border rounded-xl p-4">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Inspiration Ad</div>
                  <div className="font-medium text-white">{selectedAd.page_name}</div>
                  {selectedAd.ad_creative_link_titles?.[0] && (
                    <div className="text-sm text-zinc-300 mt-2 font-medium">
                      {selectedAd.ad_creative_link_titles[0]}
                    </div>
                  )}
                  {selectedAd.ad_creative_bodies?.[0] && (
                    <p className="text-sm text-zinc-400 mt-2">
                      {selectedAd.ad_creative_bodies[0]}
                    </p>
                  )}
                </div>

                {/* Product Info Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                      Your Product Name
                    </label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="e.g., AcmeFit Resistance Bands"
                      className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                      Product Description (optional)
                    </label>
                    <textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="Brief description of your product and its key benefits..."
                      rows={3}
                      className="w-full bg-bg-dark border border-border rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent resize-none"
                    />
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !productName.trim()}
                    className={cn(
                      'w-full px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                      'bg-emerald-500 hover:bg-emerald-600 text-white',
                      (isGenerating || !productName.trim()) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Ad Variations
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generated Results */}
          {generatedAds.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Generated Ad Copy</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {generatedAds.map((ad, index) => (
                  <div
                    key={index}
                    className="bg-bg-card border border-border rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                          {ad.angle}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(ad, index)}
                        className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Headline</div>
                      <div className="text-white font-medium">{ad.headline}</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Primary Text</div>
                      <div className="text-zinc-300 text-sm whitespace-pre-wrap">{ad.primaryText}</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Description</div>
                      <div className="text-zinc-400 text-sm">{ad.description}</div>
                    </div>

                    <div className="pt-3 border-t border-border">
                      <div className="text-xs text-zinc-500 mb-1">Why it works</div>
                      <div className="text-zinc-500 text-sm italic">{ad.whyItWorks}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!selectedAd && searchResults.length === 0 && !isSearching && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-6">
                <Search className="w-10 h-10 text-zinc-600" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Search for competitor ads</h3>
              <p className="text-sm text-zinc-500 max-w-md">
                Enter a competitor's brand name or keyword to find their ads in Meta Ad Library.
                Then generate winning ad copy inspired by what's working.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
