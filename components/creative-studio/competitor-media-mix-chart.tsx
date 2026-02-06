'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Film, Image, Layers, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MediaMixChartProps {
  mediaMix: {
    video: number
    image: number
    carousel: number
    text: number
  }
}

const COLORS = {
  video: '#a855f7',    // purple
  image: '#3b82f6',    // blue
  carousel: '#06b6d4', // cyan
  text: '#6b7280',     // gray
}

const LABELS = {
  video: 'Video',
  image: 'Image',
  carousel: 'Carousel',
  text: 'Text Only',
}

const ICONS = {
  video: Film,
  image: Image,
  carousel: Layers,
  text: FileText,
}

export function CompetitorMediaMixChart({ mediaMix }: MediaMixChartProps) {
  const data = [
    { name: 'video', value: mediaMix.video, color: COLORS.video },
    { name: 'image', value: mediaMix.image, color: COLORS.image },
    { name: 'carousel', value: mediaMix.carousel, color: COLORS.carousel },
    { name: 'text', value: mediaMix.text, color: COLORS.text },
  ].filter(item => item.value > 0)

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No media data available
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* Chart */}
      <div className="w-32 h-32 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={50}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
                      <span className="text-sm text-white">
                        {LABELS[item.name as keyof typeof LABELS]}: {item.value}%
                      </span>
                    </div>
                  )
                }
                return null
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center sm:flex-col sm:gap-2">
        {data.map((item) => {
          const Icon = ICONS[item.name as keyof typeof ICONS]
          return (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <Icon className="w-4 h-4" style={{ color: item.color }} />
              <span className="text-sm text-zinc-300">
                {LABELS[item.name as keyof typeof LABELS]}
              </span>
              <span className="text-sm text-zinc-500 font-mono">
                {item.value}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
