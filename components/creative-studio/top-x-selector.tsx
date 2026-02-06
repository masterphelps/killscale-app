'use client'

import { cn } from '@/lib/utils'

interface TopXSelectorProps {
  value: number
  onChange: (value: number) => void
  options?: number[]
}

export function TopXSelector({ value, onChange, options = [3, 6, 9] }: TopXSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            value === opt
              ? 'bg-accent text-white'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          Top {opt}
        </button>
      ))}
    </div>
  )
}
