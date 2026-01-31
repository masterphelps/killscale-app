'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type FunnelStage = 'hook' | 'hold' | 'click' | 'convert' | 'scale'

type FunnelThresholds = Record<FunnelStage, number | null>

interface FunnelFilterBarProps {
  thresholds: FunnelThresholds
  onToggle: (stage: FunnelStage) => void
  onSetThreshold: (stage: FunnelStage, value: number) => void
  onClear: () => void
  stats: Record<FunnelStage, { good: number; total: number }>
}

const thresholdOptions = [
  { value: 25, label: '25+', desc: 'Any Signal' },
  { value: 50, label: '50+', desc: 'Good' },
  { value: 75, label: '75+', desc: 'Strong' },
  { value: 90, label: '90+', desc: 'Elite' },
]

const stages: {
  key: FunnelStage
  label: string
  dotColor: string
  labelColor: string
  defaultBg: string
  defaultBorder: string
  activeBorder: string
  activeShadow: string
  activeBg: string
  accentBar: string
  dropdownBorder: string
  dropdownHighlight: string
}[] = [
  {
    key: 'hook',
    label: 'Hook',
    dotColor: 'bg-emerald-500',
    labelColor: 'text-emerald-400',
    defaultBg: 'bg-emerald-500/5',
    defaultBorder: 'border-emerald-500/20',
    activeBorder: 'border-emerald-500',
    activeShadow: 'shadow-emerald-500/20',
    activeBg: 'bg-emerald-500/10',
    accentBar: 'bg-emerald-500',
    dropdownBorder: 'border-emerald-500/30',
    dropdownHighlight: 'bg-emerald-500/10',
  },
  {
    key: 'hold',
    label: 'Hold',
    dotColor: 'bg-blue-500',
    labelColor: 'text-blue-400',
    defaultBg: 'bg-blue-500/5',
    defaultBorder: 'border-blue-500/20',
    activeBorder: 'border-blue-500',
    activeShadow: 'shadow-blue-500/20',
    activeBg: 'bg-blue-500/10',
    accentBar: 'bg-blue-500',
    dropdownBorder: 'border-blue-500/30',
    dropdownHighlight: 'bg-blue-500/10',
  },
  {
    key: 'click',
    label: 'Click',
    dotColor: 'bg-violet-500',
    labelColor: 'text-violet-400',
    defaultBg: 'bg-violet-500/5',
    defaultBorder: 'border-violet-500/20',
    activeBorder: 'border-violet-500',
    activeShadow: 'shadow-violet-500/20',
    activeBg: 'bg-violet-500/10',
    accentBar: 'bg-violet-500',
    dropdownBorder: 'border-violet-500/30',
    dropdownHighlight: 'bg-violet-500/10',
  },
  {
    key: 'convert',
    label: 'Convert',
    dotColor: 'bg-amber-500',
    labelColor: 'text-amber-400',
    defaultBg: 'bg-amber-500/5',
    defaultBorder: 'border-amber-500/20',
    activeBorder: 'border-amber-500',
    activeShadow: 'shadow-amber-500/20',
    activeBg: 'bg-amber-500/10',
    accentBar: 'bg-amber-500',
    dropdownBorder: 'border-amber-500/30',
    dropdownHighlight: 'bg-amber-500/10',
  },
]

function FunnelPill({
  stage,
  threshold,
  stat,
  onToggle,
  onSetThreshold,
}: {
  stage: typeof stages[number]
  threshold: number | null
  stat: { good: number; total: number }
  onToggle: () => void
  onSetThreshold: (value: number) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const pillRef = useRef<HTMLDivElement>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isActive = threshold !== null
  const currentThreshold = threshold ?? 75

  // Position dropdown relative to the chevron button
  const openDropdown = useCallback(() => {
    if (chevronRef.current) {
      const rect = chevronRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 6,
        left: rect.right - 144, // 144 = w-36 (9rem)
      })
    }
    setDropdownOpen(prev => !prev)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        pillRef.current && !pillRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  // Close on scroll
  useEffect(() => {
    if (!dropdownOpen) return
    const handleScroll = () => setDropdownOpen(false)
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [dropdownOpen])

  return (
    <div className="flex-shrink-0" ref={pillRef}>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'relative flex items-center gap-2 pl-5 pr-2 py-3 rounded-xl border transition-all duration-200 min-w-[140px]',
          isActive
            ? [stage.activeBorder, stage.activeBg, 'shadow-lg', stage.activeShadow]
            : [stage.defaultBg, stage.defaultBorder, 'hover:border-opacity-50']
        )}
      >
        {/* Left accent bar */}
        <div
          className={cn(
            'absolute left-0 top-2 bottom-2 w-1 rounded-full transition-opacity',
            stage.accentBar,
            isActive ? 'opacity-100' : 'opacity-40'
          )}
        />

        {/* Main clickable area — toggles filter */}
        <button
          onClick={onToggle}
          className="flex flex-col items-start gap-1 flex-1 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-2.5 h-2.5 rounded-full transition-all',
              stage.dotColor,
              isActive ? 'opacity-100 scale-110' : 'opacity-70'
            )} />
            <span className={cn(
              'text-sm font-semibold transition-colors',
              isActive ? 'text-white' : stage.labelColor
            )}>
              {stage.label}
            </span>
          </div>
          <span className={cn(
            'text-xs tabular-nums pl-[18px] transition-colors',
            isActive ? 'text-zinc-300' : 'text-zinc-500'
          )}>
            {stat.good} / {stat.total}
          </span>
        </button>

        {/* Chevron — opens threshold dropdown */}
        <button
          ref={chevronRef}
          onClick={(e) => {
            e.stopPropagation()
            openDropdown()
          }}
          className={cn(
            'flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-colors',
            'hover:bg-white/5',
            dropdownOpen && 'bg-white/10'
          )}
        >
          <span className={cn(
            'text-[10px] tabular-nums font-medium leading-none',
            isActive ? 'text-zinc-300' : 'text-zinc-500'
          )}>
            {currentThreshold}+
          </span>
          <ChevronDown className={cn(
            'w-3 h-3 transition-transform',
            isActive ? 'text-zinc-400' : 'text-zinc-600',
            dropdownOpen && 'rotate-180'
          )} />
        </button>
      </motion.div>

      {/* Dropdown — rendered via portal to escape overflow container */}
      {dropdownOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
        >
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'w-36 rounded-lg border bg-zinc-900 shadow-xl overflow-hidden',
              stage.dropdownBorder
            )}
          >
            {thresholdOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSetThreshold(opt.value)
                  setDropdownOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-left transition-colors',
                  'hover:bg-white/5',
                  currentThreshold === opt.value && stage.dropdownHighlight
                )}
              >
                <span className="text-sm text-zinc-300">{opt.desc}</span>
                <span className={cn(
                  'text-xs tabular-nums font-medium',
                  currentThreshold === opt.value ? 'text-white' : 'text-zinc-500'
                )}>
                  {opt.label}
                </span>
              </button>
            ))}
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  )
}

export function FunnelFilterBar({ thresholds, onToggle, onSetThreshold, onClear, stats }: FunnelFilterBarProps) {
  const hasActiveFilters = Object.values(thresholds).some(v => v !== null)

  return (
    <div className="flex items-center gap-4 overflow-x-auto py-1 scrollbar-hide">
      {stages.map((stage) => (
        <FunnelPill
          key={stage.key}
          stage={stage}
          threshold={thresholds[stage.key]}
          stat={stats[stage.key]}
          onToggle={() => onToggle(stage.key)}
          onSetThreshold={(value) => onSetThreshold(stage.key, value)}
        />
      ))}

      {/* Clear button */}
      <AnimatePresence>
        {hasActiveFilters && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={onClear}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            title="Clear filters"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
