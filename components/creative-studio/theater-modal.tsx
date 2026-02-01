'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Rocket, DollarSign, TrendingUp, Eye, MousePointer, Users, Layers, Play, ChevronRight, ChevronDown, Image, Film, HardDrive, Calendar, Ruler, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FatigueTrendChart } from './fatigue-trend-chart'
import { PeriodComparison } from './period-comparison'
import { AudienceBreakdown } from './audience-breakdown'
import type { StudioAsset, StudioAssetDetail, FatigueStatus } from './types'

interface TheaterModalProps {
  item: StudioAsset | null
  isOpen: boolean
  onClose: () => void
  detailData: StudioAssetDetail | null
  isLoadingDetail: boolean
  isStarred: boolean
  onToggleStar: () => Promise<void>
  onBuildNewAds?: () => void
}

const fatigueStatusConfig: Record<FatigueStatus, { label: string; color: string; bgColor: string }> = {
  fresh: { label: 'Fresh', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  healthy: { label: 'Healthy', color: 'text-verdict-scale', bgColor: 'bg-verdict-scale/20' },
  warning: { label: 'Warning', color: 'text-verdict-watch', bgColor: 'bg-verdict-watch/20' },
  fatiguing: { label: 'Fatiguing', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  fatigued: { label: 'Fatigued', color: 'text-verdict-kill', bgColor: 'bg-verdict-kill/20' },
}

function getFatigueProgress(status: FatigueStatus): number {
  switch (status) {
    case 'fresh': return 10
    case 'healthy': return 25
    case 'warning': return 50
    case 'fatiguing': return 75
    case 'fatigued': return 100
  }
}

function getProgressColor(status: FatigueStatus): string {
  switch (status) {
    case 'fresh': return 'bg-cyan-500'
    case 'healthy': return 'bg-verdict-scale'
    case 'warning': return 'bg-verdict-watch'
    case 'fatiguing': return 'bg-orange-500'
    case 'fatigued': return 'bg-verdict-kill'
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function getStatusColor(status: string): string {
  const s = status.toUpperCase()
  if (s === 'ACTIVE') return 'text-emerald-400 bg-emerald-500/20'
  if (s === 'PAUSED') return 'text-amber-400 bg-amber-500/20'
  return 'text-zinc-400 bg-zinc-500/20'
}

export function TheaterModal({
  item,
  isOpen,
  onClose,
  detailData,
  isLoadingDetail,
  isStarred,
  onToggleStar,
  onBuildNewAds,
}: TheaterModalProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isTogglingStarred, setIsTogglingStarred] = useState(false)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === ' ') { e.preventDefault(); setIsPlaying(prev => !prev) }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false)
      setExpandedCampaigns(new Set())
      setExpandedAdsets(new Set())
    }
  }, [isOpen])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleToggleStar = async () => {
    if (isTogglingStarred) return
    setIsTogglingStarred(true)
    try { await onToggleStar() } finally { setIsTogglingStarred(false) }
  }

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAdset = (id: string) => {
    setExpandedAdsets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (!item) return null

  const isVideo = item.mediaType === 'video'
  const hasPerf = item.hasPerformanceData
  const storageUrl = item.storageUrl || null
  const displayUrl = storageUrl || item.imageUrl || item.thumbnailUrl

  const statusConfig = hasPerf ? fatigueStatusConfig[item.fatigueStatus] : null
  const fatigueProgress = hasPerf ? getFatigueProgress(item.fatigueStatus) : 0
  const progressColor = hasPerf ? getProgressColor(item.fatigueStatus) : ''

  const videoSource = isVideo
    ? (storageUrl || detailData?.videoSource)
    : null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex bg-black/90 backdrop-blur-sm"
          onClick={handleBackdropClick}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-3 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <div className="flex flex-col lg:flex-row w-full h-full overflow-hidden">
            {/* Left side - Media player */}
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex-1 flex items-center justify-center p-4 lg:p-8 min-h-[300px] lg:min-h-0"
            >
              {isVideo ? (
                <div className="max-w-[90vw] sm:max-w-4xl max-h-[80vh] rounded-xl overflow-hidden shadow-2xl bg-black flex items-center justify-center">
                  {videoSource ? (
                    <video
                      src={videoSource}
                      controls playsInline
                      poster={(!storageUrl && displayUrl) ? displayUrl : undefined}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      className="max-w-full max-h-[80vh] rounded-xl"
                    >
                      Your browser does not support video playback.
                    </video>
                  ) : isLoadingDetail ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                      <span className="text-sm text-zinc-400">Loading video...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <img
                        src={displayUrl || '/placeholder-image.png'}
                        alt="Video thumbnail"
                        className="max-w-full max-h-[60vh] object-contain rounded-xl"
                      />
                      <p className="text-zinc-400 text-sm">Video source not available</p>
                    </div>
                  )}
                </div>
              ) : (
                <img
                  src={displayUrl || '/placeholder-image.png'}
                  alt="Creative"
                  className="max-w-full max-h-[70vh] rounded-xl shadow-2xl object-contain"
                />
              )}
            </motion.div>

            {/* Right side - Scrollable sections */}
            <motion.div
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="w-full lg:w-[450px] xl:w-[500px] bg-bg-sidebar border-l border-border overflow-y-auto"
            >
              <div className="p-6 space-y-6">

                {/* ========== ASSET WITH PERFORMANCE DATA ========== */}
                {hasPerf && (
                  <>
                    {/* PERFORMANCE OVER TIME Section */}
                    {!isLoadingDetail && detailData && (
                      <Section title="Performance Over Time" icon={<Calendar className="w-4 h-4 text-zinc-400" />}>
                        <div className="space-y-3">
                          {detailData.dailyData.length > 0 && (
                            <FatigueTrendChart data={detailData.dailyData} />
                          )}
                          <PeriodComparison
                            earlyPeriod={detailData.earlyPeriod}
                            recentPeriod={detailData.recentPeriod}
                          />
                        </div>
                      </Section>
                    )}

                    {/* HOOK Section (video only) */}
                    {isVideo && (
                      <Section title="Hook" icon={<Eye className="w-4 h-4 text-purple-400" />}>
                        {item.thumbstopRate !== null ? (
                          <div className="space-y-3">
                            <MetricBar
                              label="Thumbstop Rate"
                              value={`${item.thumbstopRate.toFixed(1)}%`}
                              progress={Math.min(100, item.thumbstopRate * 2)}
                              color="bg-purple-500"
                            />
                            {item.hookScore !== null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500">Hook Score</span>
                                <ScoreBadge value={item.hookScore} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-500 italic">Sync video metrics to unlock Hook data</p>
                        )}
                      </Section>
                    )}

                    {/* HOLD Section (video only) */}
                    {isVideo && (
                      <Section title="Hold" icon={<Play className="w-4 h-4 text-blue-400" />}>
                        {item.holdRate !== null ? (
                          <div className="space-y-3">
                            <MetricBar
                              label="Hold Rate"
                              value={`${item.holdRate.toFixed(1)}%`}
                              progress={Math.min(100, item.holdRate * 1.5)}
                              color="bg-blue-500"
                            />
                            {item.completionRate !== null && (
                              <MetricBar
                                label="Completion Rate"
                                value={`${item.completionRate.toFixed(1)}%`}
                                progress={Math.min(100, item.completionRate * 4)}
                                color="bg-cyan-500"
                              />
                            )}
                            {item.avgWatchTime !== null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500">Avg Watch Time</span>
                                <span className="text-sm font-mono text-white">{item.avgWatchTime.toFixed(1)}s</span>
                              </div>
                            )}
                            {item.holdScore !== null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500">Hold Score</span>
                                <ScoreBadge value={item.holdScore} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-500 italic">Sync video metrics to unlock Hold data</p>
                        )}
                      </Section>
                    )}

                    {/* CLICK Section (all assets) */}
                    <Section title="Click" icon={<MousePointer className="w-4 h-4 text-orange-400" />}>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <StatCard
                            icon={<MousePointer className="w-4 h-4" />}
                            label="CTR"
                            value={`${item.ctr.toFixed(2)}%`}
                            iconColor="text-orange-400"
                          />
                          <StatCard
                            icon={<DollarSign className="w-4 h-4" />}
                            label="CPC"
                            value={`$${item.cpc.toFixed(2)}`}
                            iconColor="text-zinc-400"
                          />
                          <StatCard
                            icon={<Layers className="w-4 h-4" />}
                            label="Ads"
                            value={item.adCount.toString()}
                            iconColor="text-zinc-400"
                          />
                        </div>
                        {item.clickScore !== null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Click Score</span>
                            <ScoreBadge value={item.clickScore} />
                          </div>
                        )}
                      </div>
                    </Section>

                    {/* CONVERT Section (all assets) */}
                    <Section title="Convert" icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <StatCard
                            icon={<TrendingUp className="w-4 h-4" />}
                            label="ROAS"
                            value={`${item.roas.toFixed(2)}x`}
                            iconColor={item.roas >= 2 ? 'text-verdict-scale' : item.roas >= 1 ? 'text-verdict-watch' : 'text-verdict-kill'}
                            valueColor={item.roas >= 2 ? 'text-verdict-scale' : item.roas >= 1 ? 'text-verdict-watch' : 'text-verdict-kill'}
                          />
                          <StatCard
                            icon={<TrendingUp className="w-4 h-4" />}
                            label="Revenue"
                            value={`$${item.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                            iconColor="text-verdict-scale"
                          />
                          <StatCard
                            icon={<DollarSign className="w-4 h-4" />}
                            label="Spend"
                            value={`$${item.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                            iconColor="text-zinc-400"
                          />
                        </div>
                        {item.convertScore !== null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Convert Score</span>
                            <ScoreBadge value={item.convertScore} />
                          </div>
                        )}
                      </div>
                    </Section>

                    {/* SCALE Section (fatigue) */}
                    <Section title="Scale" icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}>
                      {statusConfig && (
                        <div className="space-y-3">
                          {/* Fatigue status banner */}
                          <div className={cn('rounded-xl p-4', statusConfig.bgColor)}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={cn('text-sm font-medium', statusConfig.color)}>
                                {statusConfig.label}
                              </span>
                              <span className="text-xs text-zinc-500">
                                {item.daysActive} days active
                              </span>
                            </div>
                            <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${fatigueProgress}%` }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className={cn('h-full rounded-full', progressColor)}
                              />
                            </div>
                            <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
                              <span>Fresh</span>
                              <span>Fatigued</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Section>

                    {/* AUDIENCES Section */}
                    {!isLoadingDetail && detailData && detailData.audiencePerformance.length > 0 && (
                      <Section title="Audiences" icon={<Users className="w-4 h-4 text-indigo-400" />}>
                        <AudienceBreakdown audiences={detailData.audiencePerformance} />
                      </Section>
                    )}

                  </>
                )}

                {/* ========== ASSET INFO Section (always shown) ========== */}
                <Section title="Asset Info" icon={isVideo ? <Film className="w-4 h-4 text-purple-400" /> : <Image className="w-4 h-4 text-blue-400" />}>
                  <div className="space-y-2">
                    <InfoRow
                      icon={<span className="text-xs font-medium text-zinc-400">Name</span>}
                      value={(detailData?.media?.name || item.name) || 'Untitled'}
                    />
                    <InfoRow
                      icon={isVideo ? <Film className="w-3.5 h-3.5 text-purple-400" /> : <Image className="w-3.5 h-3.5 text-blue-400" />}
                      label="Type"
                      value={item.mediaType === 'video' ? 'Video' : 'Image'}
                    />
                    {(detailData?.media?.width || item.width) && (detailData?.media?.height || item.height) && (
                      <InfoRow
                        icon={<Ruler className="w-3.5 h-3.5 text-zinc-400" />}
                        label="Dimensions"
                        value={`${detailData?.media?.width || item.width} x ${detailData?.media?.height || item.height}`}
                      />
                    )}
                    {(detailData?.media?.fileSize || item.fileSize) && (
                      <InfoRow
                        icon={<HardDrive className="w-3.5 h-3.5 text-zinc-400" />}
                        label="File Size"
                        value={formatFileSize(detailData?.media?.fileSize || item.fileSize)}
                      />
                    )}
                    <InfoRow
                      icon={<Calendar className="w-3.5 h-3.5 text-zinc-400" />}
                      label="Synced"
                      value={formatDate(detailData?.media?.syncedAt || item.syncedAt)}
                    />
                    {hasPerf && (
                      <InfoRow
                        icon={<Layers className="w-3.5 h-3.5 text-zinc-400" />}
                        label="Used in"
                        value={`${item.adCount} ads, ${item.adsetCount} ad sets, ${item.campaignCount} campaigns`}
                      />
                    )}
                    {!hasPerf && (
                      <p className="text-sm text-zinc-500 py-2">Not used in any ads</p>
                    )}
                  </div>
                </Section>

                {/* WHERE IS THIS USED? Hierarchy (from detail data) */}
                {!isLoadingDetail && detailData && detailData.hierarchy.length > 0 && (
                  <Section title="Where is this used?" icon={<Eye className="w-4 h-4 text-zinc-400" />}>
                    <div className="space-y-1">
                      {detailData.hierarchy.map(campaign => {
                        const isCampaignOpen = expandedCampaigns.has(campaign.campaignId)
                        const totalAds = campaign.adsets.reduce((sum, as) => sum + as.ads.length, 0)

                        return (
                          <div key={campaign.campaignId}>
                            <button
                              onClick={() => toggleCampaign(campaign.campaignId)}
                              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-bg-hover transition-colors text-left"
                            >
                              {isCampaignOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              )}
                              <span className="text-xs font-medium text-hierarchy-campaign truncate flex-1">
                                {campaign.campaignName}
                              </span>
                              <span className="text-[10px] text-zinc-500 shrink-0">
                                {campaign.adsets.length} set{campaign.adsets.length !== 1 ? 's' : ''}, {totalAds} ad{totalAds !== 1 ? 's' : ''}
                              </span>
                            </button>

                            {isCampaignOpen && (
                              <div className="ml-4 space-y-0.5">
                                {campaign.adsets.map(adset => {
                                  const isAdsetOpen = expandedAdsets.has(adset.adsetId)
                                  return (
                                    <div key={adset.adsetId}>
                                      <button
                                        onClick={() => toggleAdset(adset.adsetId)}
                                        className="w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-bg-hover transition-colors text-left"
                                      >
                                        {isAdsetOpen ? (
                                          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
                                        )}
                                        <span className="text-xs text-hierarchy-adset truncate flex-1">
                                          {adset.adsetName}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 shrink-0">
                                          {adset.ads.length} ad{adset.ads.length !== 1 ? 's' : ''}
                                        </span>
                                      </button>

                                      {isAdsetOpen && (
                                        <div className="ml-6 space-y-0.5">
                                          {adset.ads.map(ad => (
                                            <div
                                              key={ad.adId}
                                              className="flex items-center gap-2 py-1 px-2 text-xs"
                                            >
                                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                                              <span className="text-zinc-300 truncate flex-1">
                                                {ad.adName}
                                              </span>
                                              <span className={cn(
                                                'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                                                getStatusColor(ad.status)
                                              )}>
                                                {ad.status}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Section>
                )}

                {/* Loading state for detail sections */}
                {isLoadingDetail && (
                  <div className="space-y-4">
                    <div className="h-64 bg-bg-card rounded-xl animate-pulse" />
                    <div className="h-32 bg-bg-card rounded-xl animate-pulse" />
                    <div className="h-48 bg-bg-card rounded-xl animate-pulse" />
                  </div>
                )}

                {/* Footer actions */}
                <div className="pt-4 border-t border-border flex gap-3">
                  <button
                    onClick={handleToggleStar}
                    disabled={isTogglingStarred}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all border',
                      isTogglingStarred && 'opacity-50 cursor-wait',
                      isStarred
                        ? 'border-yellow-500/50 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
                        : 'border-zinc-600 text-zinc-400 hover:border-yellow-500/30 hover:text-yellow-500/70 hover:bg-yellow-500/10'
                    )}
                  >
                    <Star className={cn('w-5 h-5', isStarred && 'fill-yellow-500')} />
                    {isStarred ? 'Starred' : 'Star'}
                  </button>

                  {onBuildNewAds && (
                    <button
                      onClick={onBuildNewAds}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all bg-accent hover:bg-accent-hover text-white"
                    >
                      <Rocket className="w-5 h-5" />
                      Build New Ads
                    </button>
                  )}
                </div>

                <p className="text-xs text-zinc-600 text-center">
                  Press Esc to close{isVideo ? ', Space to play/pause' : ''}
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Section wrapper with collapsible title
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// Stat card
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  iconColor?: string
  valueColor?: string
}

function StatCard({ icon, label, value, iconColor = 'text-zinc-400', valueColor = 'text-white' }: StatCardProps) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="bg-black/30 rounded-lg p-3"
    >
      <div className={cn('mb-1', iconColor)}>{icon}</div>
      <div className={cn('text-lg font-semibold font-mono', valueColor)}>{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </motion.div>
  )
}

// Info row
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label?: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="shrink-0">{icon}</div>
      {label && <span className="text-zinc-500 shrink-0">{label}:</span>}
      <span className="text-zinc-300 truncate">{value}</span>
    </div>
  )
}

// Metric bar with progress
function MetricBar({ label, value, progress, color }: { label: string; value: string; progress: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="text-sm font-mono text-white">{value}</span>
      </div>
      <div className="h-2 bg-black/30 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={cn('h-full rounded-full', color)}
        />
      </div>
    </div>
  )
}

// Score badge
function ScoreBadge({ value }: { value: number }) {
  const colorClass = value >= 75
    ? 'text-emerald-400 bg-emerald-500/20'
    : value >= 50
    ? 'text-amber-400 bg-amber-500/20'
    : value >= 25
    ? 'text-orange-400 bg-orange-500/20'
    : 'text-red-400 bg-red-500/20'

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold font-mono',
      colorClass
    )}>
      {value}
    </span>
  )
}
