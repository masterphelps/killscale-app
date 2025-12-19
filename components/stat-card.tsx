'use client'

import { cn } from '@/lib/utils'
import React from 'react'

// Modern white SVG icons
export const StatIcons = {
  spend: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  revenue: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  ),
  roas: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
    </svg>
  ),
  results: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  ),
  cpr: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
    </svg>
  ),
  budget: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  cpm: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  cpc: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" />
    </svg>
  ),
  ctr: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  aov: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  ),
  convRate: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
    </svg>
  ),
}

// Glow color types (includes 'default' for backward compatibility - renders as no glow)
type GlowColor = 'blue' | 'green' | 'purple' | 'amber' | 'rose' | 'cyan' | 'default'

const glowStyles: Record<GlowColor, string> = {
  blue: 'before:from-blue-500/8',
  green: 'before:from-emerald-500/8',
  purple: 'before:from-purple-500/8',
  amber: 'before:from-amber-500/8',
  rose: 'before:from-rose-500/8',
  cyan: 'before:from-cyan-500/8',
  default: '',  // No glow for default
}

type StatCardProps = {
  label: string
  value: string
  subValue?: string  // Secondary value shown below the main value (e.g., "CPR" for Results)
  change?: number    // Percentage change (positive or negative)
  icon?: React.ReactNode | string  // Support both SVG icons and emoji strings
  glow?: GlowColor
  color?: GlowColor  // Alias for glow (backward compatibility)
}

export function StatCard({ label, value, subValue, change, icon, glow, color }: StatCardProps) {
  // Support color as alias for glow (backward compatibility)
  const glowColor = glow || color
  // Only apply glow effect for non-default colors
  const hasGlow = glowColor && glowColor !== 'default'

  return (
    <div className={cn(
      'relative rounded-2xl p-4 lg:p-5 transition-all duration-200 overflow-hidden',
      'bg-bg-card',
      'border border-border',
      'hover:border-border/50',
      hasGlow && 'before:absolute before:inset-0 before:bg-gradient-to-br before:to-transparent before:pointer-events-none',
      hasGlow && glowStyles[glowColor],
    )}>
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          {icon && <span className="text-zinc-400">{icon}</span>}
          <span className="text-xs lg:text-sm text-zinc-400">{label}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
            {subValue && (
              <div className="text-xs lg:text-sm text-zinc-400 mt-0.5">{subValue}</div>
            )}
          </div>
          {change !== undefined && (
            <div className={cn(
              'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
              change >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            )}>
              <span>{change >= 0 ? '↗' : '↘'}</span>
              <span>{Math.abs(change)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Special Budget Card with CBO/ABO breakdown
type BudgetCardProps = {
  totalBudget: string
  cboBudget: string
  aboBudget: string
}

export function BudgetCard({ totalBudget, cboBudget, aboBudget }: BudgetCardProps) {
  return (
    <div className={cn(
      'relative rounded-2xl p-4 lg:p-5 transition-all duration-200 overflow-hidden',
      'bg-bg-card',
      'border border-indigo-500/20',
      'hover:border-indigo-500/30',
      'before:absolute before:inset-0 before:bg-gradient-to-br before:from-indigo-500/10 before:to-transparent before:pointer-events-none',
    )}>
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-zinc-400">{StatIcons.budget}</span>
          <span className="text-xs lg:text-sm text-zinc-400">Daily Budgets</span>
        </div>
        <div className="text-xl lg:text-2xl font-bold font-mono text-white mb-2">{totalBudget}</div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.6)]"></span>
            <span className="text-zinc-500">CBO</span>
            <span className="text-zinc-300 font-mono">{cboBudget}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_6px_rgba(168,85,247,0.6)]"></span>
            <span className="text-zinc-500">ABO</span>
            <span className="text-zinc-300 font-mono">{aboBudget}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
