'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface ScoreDistributionChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: Array<any>
  scoreField: string
  color: string  // hex color like '#10b981'
  label: string  // "Hook", "Hold", etc.
}

const BUCKETS = [
  { name: '0-24', min: 0, max: 24, opacity: 0.3 },
  { name: '25-49', min: 25, max: 49, opacity: 0.5 },
  { name: '50-74', min: 50, max: 74, opacity: 0.75 },
  { name: '75-100', min: 75, max: 100, opacity: 1 },
]

export function ScoreDistributionChart({ items, scoreField, color, label }: ScoreDistributionChartProps) {
  const data = useMemo(() => {
    return BUCKETS.map(bucket => {
      const count = items.filter(item => {
        const score = item[scoreField] as number | null
        if (score === null || score === undefined) return false
        return score >= bucket.min && score <= bucket.max
      }).length
      return { name: bucket.name, count, opacity: bucket.opacity }
    })
  }, [items, scoreField])

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">{label} Score Distribution</h3>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
              itemStyle={{ color: '#e4e4e7' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={color} fillOpacity={entry.opacity} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
