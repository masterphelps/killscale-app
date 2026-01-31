'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import { cn, formatCurrency } from '@/lib/utils'
import type { DailyMetrics } from './types'

interface FatigueTrendChartProps {
  data: DailyMetrics[]
  className?: string
}

export function FatigueTrendChart({ data, className }: FatigueTrendChartProps) {
  // Calculate 7-day moving average and find peak ROAS
  const chartData = useMemo(() => {
    if (!data.length) return { points: [], peakRoas: 0 }

    let peakRoas = 0
    const points = data.map((day, index) => {
      // Calculate 7-day moving average
      const windowStart = Math.max(0, index - 6)
      const window = data.slice(windowStart, index + 1)
      const maRoas = window.reduce((sum, d) => sum + d.roas, 0) / window.length

      // Track peak ROAS
      if (day.roas > peakRoas) {
        peakRoas = day.roas
      }

      return {
        ...day,
        maRoas,
        dateFormatted: new Date(day.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      }
    })

    return { points, peakRoas }
  }, [data])

  if (!data.length) {
    return (
      <div className={cn('bg-bg-card border border-border rounded-xl p-6', className)}>
        <div className="h-64 flex items-center justify-center text-zinc-500">
          No data available
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-bg-card border border-border rounded-xl p-6', className)}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData.points}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="dateFormatted"
              stroke="#3f3f46"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={{ stroke: '#3f3f46' }}
            />
            <YAxis
              stroke="#3f3f46"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={{ stroke: '#3f3f46' }}
              tickFormatter={(value) => `${value.toFixed(1)}x`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null
                const point = payload[0]?.payload
                return (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm shadow-xl">
                    <div className="font-medium text-white mb-2">{label}</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                          <span className="text-zinc-400">ROAS</span>
                        </span>
                        <span className="font-medium text-white">
                          {point?.roas?.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                          <span className="text-zinc-400">7-Day Avg</span>
                        </span>
                        <span className="font-medium text-white">
                          {point?.maRoas?.toFixed(2)}x
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-zinc-400">Spend</span>
                        <span className="font-medium text-white">
                          {formatCurrency(point?.spend || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-zinc-400">CTR</span>
                        <span className="font-medium text-white">
                          {point?.ctr?.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="line"
              wrapperStyle={{ color: '#a1a1aa' }}
            />
            {/* Peak ROAS reference line */}
            {chartData.peakRoas > 0 && (
              <ReferenceLine
                y={chartData.peakRoas}
                stroke="#22c55e"
                strokeDasharray="5 5"
                label={{
                  value: `Peak: ${chartData.peakRoas.toFixed(1)}x`,
                  position: 'insideTopRight',
                  fill: '#22c55e',
                  fontSize: 11,
                }}
              />
            )}
            {/* Main ROAS line */}
            <Line
              type="monotone"
              dataKey="roas"
              name="ROAS"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
            />
            {/* 7-day moving average line */}
            <Line
              type="monotone"
              dataKey="maRoas"
              name="7-Day MA"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
