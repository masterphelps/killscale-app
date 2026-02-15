'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'

type DailyMetrics = {
  date: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  reach: number
  frequency: number
  ctr: number
  cpm: number
  cpa: number
  cpaSma: number
  results: number
}

type FatigueStatus = 'healthy' | 'warning' | 'fatiguing' | 'fatigued'

type FatigueAnalysis = {
  baselineCtr: number
  baselineCpm: number
  baselineCpa: number
  currentCtr: number
  currentCpm: number
  currentCpa: number
  ctrDeclinePct: number
  cpmIncreasePct: number
  cpaIncreasePct: number
  crossoverDates: string[]
  status: FatigueStatus
}

type FatigueChartEntity = {
  type: 'campaign' | 'adset' | 'ad'
  id: string
  name: string
  accountId: string
}

type Props = {
  entity: FatigueChartEntity
  userId: string
  since: string
  until: string
  anchorRect: DOMRect
  onClose: () => void
}

const STATUS_COLORS: Record<FatigueStatus, { bg: string; text: string; label: string }> = {
  healthy: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Healthy' },
  warning: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Warning' },
  fatiguing: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Fatiguing' },
  fatigued: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Fatigued' },
}

const FREQ_COLOR = '#f97316'  // orange
const CTR_COLOR = '#3b82f6'   // blue
const CPM_COLOR = '#ef4444'   // red
const CPA_COLOR = '#8b5cf6'   // purple

function getFrequencyStatus(freq: number): { color: string; label: string } {
  if (freq >= 3) return { color: 'text-red-400', label: 'Burnout' }
  if (freq >= 2) return { color: 'text-amber-400', label: 'Elevated' }
  if (freq >= 1.5) return { color: 'text-zinc-300', label: 'Acceptable' }
  return { color: 'text-green-400', label: 'Healthy' }
}

export function FatigueBurnoutPopover({ entity, userId, since, until, anchorRect, onClose }: Props) {
  const [dailyData, setDailyData] = useState<DailyMetrics[]>([])
  const [fatigue, setFatigue] = useState<FatigueAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          userId,
          adAccountId: entity.accountId,
          entityType: entity.type,
          entityId: entity.id,
          since,
          until,
        })
        const res = await fetch(`/api/fatigue-chart?${params}`)
        if (!res.ok) throw new Error('Failed to fetch data')
        const json = await res.json()
        setDailyData(json.dailyData || [])
        setFatigue(json.fatigue || null)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [entity.id, entity.type, entity.accountId, userId, since, until])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  // Calculate position
  const getPosition = useCallback(() => {
    const popW = 560
    const popH = 420
    const gap = 8
    // Try to position below the anchor, centered horizontally
    let left = anchorRect.left + anchorRect.width / 2 - popW / 2
    let top = anchorRect.bottom + gap

    // Keep within viewport
    if (left < 8) left = 8
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8
    if (top + popH > window.innerHeight - 8) {
      // Position above if no room below
      top = anchorRect.top - popH - gap
    }
    if (top < 8) top = 8

    return { left, top }
  }, [anchorRect])

  const pos = getPosition()

  // Build crossover reference areas (consecutive dates form zones)
  const crossoverZones: { x1: string; x2: string }[] = []
  if (fatigue?.crossoverDates && fatigue.crossoverDates.length > 0) {
    let zoneStart = fatigue.crossoverDates[0]
    let prev = fatigue.crossoverDates[0]
    for (let i = 1; i < fatigue.crossoverDates.length; i++) {
      const curr = fatigue.crossoverDates[i]
      // Check if consecutive day
      const prevDate = new Date(prev)
      const currDate = new Date(curr)
      const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      if (diffDays > 1) {
        crossoverZones.push({ x1: zoneStart, x2: prev })
        zoneStart = curr
      }
      prev = curr
    }
    crossoverZones.push({ x1: zoneStart, x2: prev })
  }

  const statusInfo = fatigue ? STATUS_COLORS[fatigue.status] : null

  return (
    <div
      ref={popoverRef}
      className="fixed z-[60] bg-bg-card border border-border rounded-xl shadow-2xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: Math.min(560, window.innerWidth - 16),
        maxHeight: 420,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium text-white truncate max-w-[280px]">{entity.name}</h3>
          {statusInfo && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
              {statusInfo.label}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[300px] text-zinc-400 text-sm">{error}</div>
        ) : dailyData.length < 3 ? (
          <div className="flex items-center justify-center h-[300px] text-zinc-400 text-sm">
            Need at least 3 days of data
          </div>
        ) : (
          <>
            {/* Fatigue summary */}
            {fatigue && (
              <div className="flex items-center gap-4 mb-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">CTR</span>
                  <span className={fatigue.ctrDeclinePct > 20 ? 'text-red-400' : fatigue.ctrDeclinePct > 10 ? 'text-amber-400' : 'text-green-400'}>
                    {fatigue.ctrDeclinePct > 0 ? '↓' : '↑'}{Math.abs(fatigue.ctrDeclinePct).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">CPM</span>
                  <span className={fatigue.cpmIncreasePct > 20 ? 'text-red-400' : fatigue.cpmIncreasePct > 10 ? 'text-amber-400' : 'text-green-400'}>
                    {fatigue.cpmIncreasePct > 0 ? '↑' : '↓'}{Math.abs(fatigue.cpmIncreasePct).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">CPA</span>
                  <span className={fatigue.cpaIncreasePct > 20 ? 'text-red-400' : fatigue.cpaIncreasePct > 10 ? 'text-amber-400' : 'text-green-400'}>
                    {fatigue.cpaIncreasePct > 0 ? '↑' : '↓'}{Math.abs(fatigue.cpaIncreasePct).toFixed(0)}%
                  </span>
                </div>
                <div className="text-zinc-600">vs baseline (first 3 days)</div>
              </div>
            )}

            {/* Chart */}
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    stroke="#3f3f46"
                    tick={{ fill: '#a1a1aa', fontSize: 10, stroke: 'none' }}
                    tickLine={{ stroke: '#3f3f46' }}
                    tickFormatter={(value) => {
                      const d = new Date(value + 'T00:00:00')
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }}
                  />
                  {/* Left Y-axis: Frequency / CPM / CPA */}
                  <YAxis
                    yAxisId="left"
                    stroke="#3f3f46"
                    tick={{ fill: '#a1a1aa', fontSize: 10, stroke: 'none' }}
                    tickLine={{ stroke: '#3f3f46' }}
                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : v >= 1 ? `$${v.toFixed(0)}` : v.toFixed(1)}
                    width={45}
                  />
                  {/* Right Y-axis: CTR% */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#3f3f46"
                    tick={{ fill: '#a1a1aa', fontSize: 10, stroke: 'none' }}
                    tickLine={{ stroke: '#3f3f46' }}
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    width={45}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null
                      const d = payload[0]?.payload as DailyMetrics
                      if (!d) return null
                      const date = new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                      const freqStatus = getFrequencyStatus(d.frequency)
                      return (
                        <div className="bg-[#18181b] border border-[#3f3f46] rounded-lg p-3 text-sm shadow-xl">
                          <div className="text-zinc-400 mb-2 text-xs">{date}</div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between gap-6">
                              <span style={{ color: FREQ_COLOR }}>Frequency</span>
                              <span className="font-medium text-white">
                                {d.frequency.toFixed(2)}
                                <span className={`ml-1.5 text-xs ${freqStatus.color}`}>{freqStatus.label}</span>
                              </span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span style={{ color: CTR_COLOR }}>CTR</span>
                              <span className="font-medium text-white">
                                {d.ctr.toFixed(2)}%
                                {fatigue && fatigue.baselineCtr > 0 && (
                                  <span className={`ml-1.5 text-xs ${((fatigue.baselineCtr - d.ctr) / fatigue.baselineCtr * 100) > 20 ? 'text-red-400' : 'text-zinc-500'}`}>
                                    {((d.ctr - fatigue.baselineCtr) / fatigue.baselineCtr * 100) > 0 ? '+' : ''}{((d.ctr - fatigue.baselineCtr) / fatigue.baselineCtr * 100).toFixed(0)}%
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span style={{ color: CPM_COLOR }}>CPM</span>
                              <span className="font-medium text-white">${d.cpm.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span style={{ color: CPA_COLOR }}>CPA (3d avg)</span>
                              <span className="font-medium text-white">${(d.cpaSma || d.cpa).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: '#a1a1aa', fontSize: 11 }}
                  />

                  {/* Reference lines for frequency thresholds */}
                  <ReferenceLine yAxisId="left" y={2} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <ReferenceLine yAxisId="left" y={3} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />

                  {/* Crossover zones */}
                  {crossoverZones.map((zone, i) => (
                    <ReferenceArea
                      key={i}
                      yAxisId="left"
                      x1={zone.x1}
                      x2={zone.x2}
                      fill="rgba(239, 68, 68, 0.08)"
                      fillOpacity={1}
                    />
                  ))}

                  {/* Lines */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="frequency"
                    stroke={FREQ_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: FREQ_COLOR, stroke: '#fff', strokeWidth: 2 }}
                    name="Frequency"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="ctr"
                    stroke={CTR_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CTR_COLOR, stroke: '#fff', strokeWidth: 2 }}
                    name="CTR %"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="cpm"
                    stroke={CPM_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CPM_COLOR, stroke: '#fff', strokeWidth: 2 }}
                    name="CPM"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="cpaSma"
                    stroke={CPA_COLOR}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CPA_COLOR, stroke: '#fff', strokeWidth: 2 }}
                    name="CPA (3d avg)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
