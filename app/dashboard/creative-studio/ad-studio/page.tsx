'use client'

import { useState, useCallback } from 'react'
import { Search, Wand2, Sparkles, ExternalLink, Copy, Check, Loader2, Image as ImageIcon, AlertCircle, Link as LinkIcon, Package, ChevronRight, Download, ImagePlus } from 'lucide-react'
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

interface ProductInfo {
  name: string
  description?: string
  price?: string
  currency?: string
  features?: string[]
  brand?: string
  category?: string
  uniqueSellingPoint?: string
}

interface GeneratedAd {
  headline: string
  primaryText: string
  description: string
  angle: string
  whyItWorks: string
}

interface GeneratedImage {
  base64: string
  mimeType: string
}

export default function AdStudioPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan } = useSubscription()

  const isPro = plan === 'Scale' || plan === 'Pro'

  // Step tracking
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  // Step 1: Product URL
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false)
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null)
  const [productError, setProductError] = useState<string | null>(null)

  // Step 2: Competitor search
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<AdLibraryAd[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedAd, setSelectedAd] = useState<AdLibraryAd | null>(null)

  // Step 3: Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Image generation
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Record<number, GeneratedImage>>({})
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const [imageStyle, setImageStyle] = useState<'lifestyle' | 'product' | 'minimal' | 'bold'>('lifestyle')

  // Step 1: Analyze product URL
  const handleAnalyzeProduct = useCallback(async () => {
    if (!productUrl.trim()) return

    setIsAnalyzingProduct(true)
    setProductError(null)
    setProductInfo(null)

    try {
      const res = await fetch('/api/creative-studio/analyze-product-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      })

      const data = await res.json()

      if (!res.ok) {
        setProductError(data.error || 'Failed to analyze product')
        return
      }

      setProductInfo(data.product)
      setCurrentStep(2)
    } catch (err) {
      setProductError('Failed to analyze product URL')
    } finally {
      setIsAnalyzingProduct(false)
    }
  }, [productUrl])

  // Step 2: Search competitors
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

  const handleSelectAd = useCallback((ad: AdLibraryAd) => {
    setSelectedAd(ad)
    setCurrentStep(3)
  }, [])

  // Step 3: Generate
  const handleGenerate = useCallback(async () => {
    if (!selectedAd || !productInfo) return

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
          product: productInfo,
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
  }, [selectedAd, productInfo])

  const copyToClipboard = (ad: GeneratedAd, index: number) => {
    const text = `Headline: ${ad.headline}\n\nPrimary Text: ${ad.primaryText}\n\nDescription: ${ad.description}`
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleGenerateImage = useCallback(async (ad: GeneratedAd, index: number) => {
    if (!productInfo) return

    setGeneratingImageIndex(index)
    setImageErrors(prev => ({ ...prev, [index]: '' }))

    try {
      const res = await fetch('/api/creative-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adCopy: {
            headline: ad.headline,
            primaryText: ad.primaryText,
            description: ad.description,
            angle: ad.angle,
          },
          product: productInfo,
          style: imageStyle,
          aspectRatio: '1:1',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setImageErrors(prev => ({ ...prev, [index]: data.error || 'Failed to generate image' }))
        return
      }

      setGeneratedImages(prev => ({ ...prev, [index]: data.image }))
    } catch (err) {
      setImageErrors(prev => ({ ...prev, [index]: 'Failed to generate image' }))
    } finally {
      setGeneratingImageIndex(null)
    }
  }, [productInfo, imageStyle])

  const downloadImage = (image: GeneratedImage, adIndex: number) => {
    const link = document.createElement('a')
    link.href = `data:${image.mimeType};base64,${image.base64}`
    link.download = `ad-image-${adIndex + 1}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const resetToStep = (step: 1 | 2 | 3) => {
    if (step === 1) {
      setProductInfo(null)
      setSearchResults([])
      setSelectedAd(null)
      setGeneratedAds([])
      setGeneratedImages({})
      setImageErrors({})
    } else if (step === 2) {
      setSelectedAd(null)
      setGeneratedAds([])
      setGeneratedImages({})
      setImageErrors({})
    }
    setCurrentStep(step)
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
        <div className="max-w-[1000px] mx-auto space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Ad Studio</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 rounded">
                NEW
              </span>
            </div>
            <p className="text-zinc-500 mt-1">
              Generate winning ads by combining your product with competitor strategies
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => resetToStep(1)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
                currentStep >= 1 ? 'text-white' : 'text-zinc-500',
                productInfo && 'bg-emerald-500/20 text-emerald-400'
              )}
            >
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                productInfo ? 'bg-emerald-500 text-white' : currentStep === 1 ? 'bg-accent text-white' : 'bg-zinc-700'
              )}>
                {productInfo ? '✓' : '1'}
              </span>
              Your Product
            </button>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
            <button
              onClick={() => productInfo && resetToStep(2)}
              disabled={!productInfo}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
                currentStep >= 2 ? 'text-white' : 'text-zinc-500',
                selectedAd && 'bg-emerald-500/20 text-emerald-400',
                !productInfo && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                selectedAd ? 'bg-emerald-500 text-white' : currentStep === 2 ? 'bg-accent text-white' : 'bg-zinc-700'
              )}>
                {selectedAd ? '✓' : '2'}
              </span>
              Competitor Ad
            </button>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg',
              currentStep === 3 ? 'text-white' : 'text-zinc-500'
            )}>
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                generatedAds.length > 0 ? 'bg-emerald-500 text-white' : currentStep === 3 ? 'bg-accent text-white' : 'bg-zinc-700'
              )}>
                {generatedAds.length > 0 ? '✓' : '3'}
              </span>
              Generate
            </div>
          </div>

          {/* Step 1: Product URL */}
          {currentStep === 1 && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-accent" />
                Enter Your Product URL
              </h2>
              <p className="text-sm text-zinc-400">
                Paste a link to your product page. We'll extract the product details automatically.
              </p>

              <div className="flex gap-3">
                <input
                  type="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeProduct()}
                  placeholder="https://yourstore.com/products/awesome-product"
                  className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleAnalyzeProduct}
                  disabled={isAnalyzingProduct || !productUrl.trim()}
                  className={cn(
                    'px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2',
                    'bg-accent hover:bg-accent-hover text-white',
                    (isAnalyzingProduct || !productUrl.trim()) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isAnalyzingProduct ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Analyze
                </button>
              </div>

              {productError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {productError}
                </div>
              )}
            </div>
          )}

          {/* Product Info Card (shows after step 1) */}
          {productInfo && (
            <div className="bg-bg-card border border-emerald-500/30 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{productInfo.name}</h3>
                    {productInfo.brand && productInfo.brand !== productInfo.name && (
                      <div className="text-sm text-zinc-400">by {productInfo.brand}</div>
                    )}
                    {productInfo.description && (
                      <p className="text-sm text-zinc-400 mt-1">{productInfo.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {productInfo.price && (
                        <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                          {productInfo.currency || '$'}{productInfo.price}
                        </span>
                      )}
                      {productInfo.category && (
                        <span className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-300 rounded">
                          {productInfo.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => resetToStep(1)}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Competitor Search */}
          {currentStep === 2 && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-accent" />
                Find Competitor Ads
              </h2>
              <p className="text-sm text-zinc-400">
                Search Meta Ad Library for competitor ads to use as inspiration.
              </p>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter competitor name (e.g., Nike, Glossier, Casper)"
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
                  <div className="text-sm text-zinc-500">{searchResults.length} ads found — click one to use as inspiration</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.map((ad) => (
                      <div
                        key={ad.id}
                        className="bg-bg-dark border border-border rounded-xl overflow-hidden transition-all hover:border-accent/50"
                      >
                        {/* Ad Preview Iframe */}
                        <div className="relative aspect-square bg-zinc-900">
                          <iframe
                            src={ad.ad_snapshot_url}
                            className="w-full h-full border-0"
                            sandbox="allow-scripts allow-same-origin"
                            loading="lazy"
                            title={`Ad preview from ${ad.page_name}`}
                          />
                          <a
                            href={ad.ad_snapshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                            onClick={(e) => e.stopPropagation()}
                            title="Open in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        {/* Ad Info */}
                        <div className="p-4 space-y-3">
                          <div>
                            <div className="font-medium text-white truncate">{ad.page_name}</div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                              Running since {new Date(ad.ad_delivery_start_time).toLocaleDateString()}
                            </div>
                          </div>

                          {ad.ad_creative_link_titles?.[0] && (
                            <div className="text-sm text-zinc-300 font-medium line-clamp-2">
                              {ad.ad_creative_link_titles[0]}
                            </div>
                          )}

                          {ad.ad_creative_bodies?.[0] && (
                            <p className="text-sm text-zinc-500 line-clamp-3">
                              {ad.ad_creative_bodies[0]}
                            </p>
                          )}

                          <button
                            onClick={() => handleSelectAd(ad)}
                            className="w-full py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors"
                          >
                            Use as Inspiration →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Ad Card (shows after step 2) */}
          {selectedAd && currentStep === 3 && (
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-400">Inspiration Ad</h3>
                <button
                  onClick={() => resetToStep(2)}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Change
                </button>
              </div>
              <div className="font-medium text-white">{selectedAd.page_name}</div>
              {selectedAd.ad_creative_link_titles?.[0] && (
                <div className="text-sm text-zinc-300 mt-1 font-medium">
                  "{selectedAd.ad_creative_link_titles[0]}"
                </div>
              )}
              {selectedAd.ad_creative_bodies?.[0] && (
                <p className="text-sm text-zinc-500 mt-2 line-clamp-2">
                  {selectedAd.ad_creative_bodies[0]}
                </p>
              )}
            </div>
          )}

          {/* Step 3: Generate */}
          {currentStep === 3 && !generatedAds.length && (
            <div className="bg-bg-card border border-border rounded-xl p-6 text-center">
              <Wand2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-white mb-2">Ready to Generate</h2>
              <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
                We'll analyze the competitor's ad strategy and create 4 unique ad variations for your product.
              </p>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={cn(
                  'px-8 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2',
                  'bg-emerald-500 hover:bg-emerald-600 text-white',
                  isGenerating && 'opacity-50 cursor-not-allowed'
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
          )}

          {/* Generated Results */}
          {generatedAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-lg font-semibold text-white">Your Generated Ads</h2>
                <div className="flex items-center gap-4">
                  {/* Image Style Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Image style:</span>
                    <select
                      value={imageStyle}
                      onChange={(e) => setImageStyle(e.target.value as typeof imageStyle)}
                      className="bg-bg-dark border border-border rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
                    >
                      <option value="lifestyle">Lifestyle</option>
                      <option value="product">Product</option>
                      <option value="minimal">Minimal</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="text-sm text-accent hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Regenerate Copy
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {generatedAds.map((ad, index) => (
                  <div
                    key={index}
                    className="bg-bg-card border border-border rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <span className="px-2 py-0.5 text-xs font-semibold bg-accent/20 text-accent rounded">
                        {ad.angle}
                      </span>
                      <button
                        onClick={() => copyToClipboard(ad, index)}
                        className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                        title="Copy ad copy"
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
                      <div className="text-white font-semibold">{ad.headline}</div>
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
                      <div className="text-xs text-emerald-400 mb-1">💡 Why it works</div>
                      <div className="text-zinc-500 text-sm">{ad.whyItWorks}</div>
                    </div>

                    {/* Image Generation Section */}
                    <div className="pt-3 border-t border-border">
                      {generatedImages[index] ? (
                        <div className="space-y-3">
                          <div className="text-xs text-zinc-500">Generated Image</div>
                          <div className="relative">
                            <img
                              src={`data:${generatedImages[index].mimeType};base64,${generatedImages[index].base64}`}
                              alt={`Generated ad image for ${ad.angle}`}
                              className="w-full rounded-lg border border-border"
                            />
                            <div className="absolute bottom-2 right-2 flex gap-2">
                              <button
                                onClick={() => downloadImage(generatedImages[index], index)}
                                className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                                title="Download image"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleGenerateImage(ad, index)}
                                disabled={generatingImageIndex !== null}
                                className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                                title="Regenerate image"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={() => handleGenerateImage(ad, index)}
                            disabled={generatingImageIndex !== null}
                            className={cn(
                              'w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                              'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30',
                              generatingImageIndex !== null && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {generatingImageIndex === index ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating Image...
                              </>
                            ) : (
                              <>
                                <ImagePlus className="w-4 h-4" />
                                Generate Image
                              </>
                            )}
                          </button>
                          {imageErrors[index] && (
                            <div className="flex items-center gap-2 text-red-400 text-xs">
                              <AlertCircle className="w-3 h-3" />
                              {imageErrors[index]}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Start Over */}
              <div className="text-center pt-4">
                <button
                  onClick={() => resetToStep(1)}
                  className="text-sm text-zinc-500 hover:text-white"
                >
                  Start over with a different product
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
