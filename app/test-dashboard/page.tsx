'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'

// Modern white icons as SVG components
const Icons = {
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

// Stat Card with subtle glow
type GlowColor = 'blue' | 'green' | 'purple' | 'amber' | 'rose' | 'cyan'
const glowStyles: Record<GlowColor, string> = {
  blue: 'before:from-blue-500/8',
  green: 'before:from-emerald-500/8',
  purple: 'before:from-purple-500/8',
  amber: 'before:from-amber-500/8',
  rose: 'before:from-rose-500/8',
  cyan: 'before:from-cyan-500/8',
}

function StatCard({ label, value, icon, change, glow }: {
  label: string
  value: string
  icon?: React.ReactNode
  change?: number
  glow?: GlowColor
}) {
  return (
    <div className={cn(
      'relative rounded-2xl p-4 lg:p-5 transition-all duration-200 overflow-hidden',
      'bg-[#0f1419]',
      'border border-white/10',
      'hover:border-white/20',
      glow && 'before:absolute before:inset-0 before:bg-gradient-to-br before:to-transparent before:pointer-events-none',
      glow && glowStyles[glow],
    )}>
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          {icon && <span className="text-zinc-400">{icon}</span>}
          <span className="text-xs lg:text-sm text-zinc-400">{label}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
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

// Budget Card (special styling)
function BudgetCard() {
  return (
    <div className={cn(
      'relative rounded-2xl p-4 lg:p-5 transition-all duration-200 overflow-hidden',
      'bg-[#0f1419]',
      'border border-indigo-500/20',
      'hover:border-indigo-500/30',
      'before:absolute before:inset-0 before:bg-gradient-to-br before:from-indigo-500/10 before:to-transparent before:pointer-events-none',
    )}>
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-zinc-400">{Icons.budget}</span>
          <span className="text-xs lg:text-sm text-zinc-400">Daily Budgets</span>
        </div>
        <div className="text-xl lg:text-2xl font-bold font-mono text-white mb-2">$847.00</div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.6)]"></span>
            <span className="text-zinc-500">CBO</span>
            <span className="text-zinc-300 font-mono">$547</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_6px_rgba(168,85,247,0.6)]"></span>
            <span className="text-zinc-500">ABO</span>
            <span className="text-zinc-300 font-mono">$300</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Card-style table row
type Verdict = 'SCALE' | 'WATCH' | 'KILL' | 'LEARN'
const verdictStyles: Record<Verdict, { bg: string; text: string; border: string }> = {
  SCALE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  WATCH: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  KILL: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  LEARN: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
}

function TableRowCard({
  name,
  type,
  spend,
  revenue,
  roas,
  results,
  cpr,
  verdict,
  isExpanded,
  indent = 0,
  onToggle,
  hasChildren = false,
  status = 'ACTIVE',
  budgetType,
  budget,
  viewMode = 'simple',
  // Detailed view extras
  cpc,
  ctr,
  cpa,
  convRate,
  clicks,
  impressions,
}: {
  name: string
  type: 'campaign' | 'adset' | 'ad'
  spend: string
  revenue: string
  roas: string
  results: string
  cpr: string
  verdict: Verdict
  isExpanded?: boolean
  indent?: number
  onToggle?: () => void
  hasChildren?: boolean
  status?: 'ACTIVE' | 'PAUSED'
  budgetType?: 'CBO' | 'ABO'
  budget?: string
  viewMode?: 'simple' | 'detailed'
  // Detailed view extras
  cpc?: string
  ctr?: string
  cpa?: string
  convRate?: string
  clicks?: string
  impressions?: string
}) {
  const v = verdictStyles[verdict]
  const typeColors = {
    campaign: 'bg-blue-500',
    adset: 'bg-purple-500',
    ad: 'bg-zinc-500'
  }
  const typeLabels = {
    campaign: 'Campaign',
    adset: 'Ad Set',
    ad: 'Ad'
  }
  // Only show checkbox for campaigns and ABO adsets (where budget lives)
  const showCheckbox = type === 'campaign' || (type === 'adset' && budgetType === 'ABO')

  return (
    <div
      className={cn(
        'rounded-xl p-4 transition-all duration-200',
        'bg-[#0f1419]',
        'border border-white/10',
        'hover:border-white/20 hover:bg-[#131820]',
        'flex items-center gap-3',
      )}
      style={{ marginLeft: indent * 28 }}
    >
      {/* 1. Checkbox (only for campaigns and ABO adsets) */}
      {showCheckbox ? (
        <input
          type="checkbox"
          className={cn(
            'w-4 h-4 rounded border-zinc-600 bg-zinc-800 focus:ring-offset-0',
            type === 'campaign'
              ? 'text-indigo-500 focus:ring-indigo-500/50'
              : 'text-purple-500 focus:ring-purple-500/50'
          )}
          defaultChecked
        />
      ) : (
        <div className="w-4" />
      )}

      {/* 2. Expand/collapse chevron */}
      {hasChildren ? (
        <button
          onClick={onToggle}
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      ) : (
        <div className="w-5" />
      )}

      {/* 3. Type indicator bar */}
      <div className={cn('w-1.5 self-stretch rounded-full', typeColors[type])} />

      {/* 4. Name section - two rows */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name */}
        <div className="font-medium text-white truncate">{name}</div>
        {/* Row 2: Type label + status + budget type */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-500">{typeLabels[type]}</span>
          {status === 'PAUSED' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 border border-zinc-600/50">
              Paused
            </span>
          )}
          {budgetType && (type === 'campaign' || type === 'adset') && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              budgetType === 'CBO'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            )}>
              {budgetType}
            </span>
          )}
        </div>
      </div>

      {/* Metrics - Simple: Spend, Revenue, Results, CPR, ROAS, Budget */}
      <div className="hidden lg:flex items-center gap-4 text-sm">
        <div className="text-right w-20">
          <div className="text-zinc-500 text-xs mb-0.5">Spend</div>
          <div className="font-mono text-white">{spend}</div>
        </div>
        <div className="text-right w-20">
          <div className="text-zinc-500 text-xs mb-0.5">Revenue</div>
          <div className="font-mono text-white">{revenue}</div>
        </div>
        <div className="text-right w-16">
          <div className="text-zinc-500 text-xs mb-0.5">Results</div>
          <div className="font-mono text-white">{results}</div>
        </div>
        <div className="text-right w-16">
          <div className="text-zinc-500 text-xs mb-0.5">CPR</div>
          <div className="font-mono text-white">{cpr}</div>
        </div>
        <div className="text-right w-16">
          <div className="text-zinc-500 text-xs mb-0.5">ROAS</div>
          <div className="font-mono text-white">{roas}</div>
        </div>
        <div className="text-right w-20">
          <div className="text-zinc-500 text-xs mb-0.5">Budget</div>
          <div className="font-mono text-white">{budget || '—'}</div>
        </div>

        {/* Detailed view extras */}
        {viewMode === 'detailed' && (
          <>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">CPC</div>
              <div className="font-mono text-white">{cpc || '—'}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">CTR</div>
              <div className="font-mono text-white">{ctr || '—'}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">CPA</div>
              <div className="font-mono text-white">{cpa || '—'}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">Conv%</div>
              <div className="font-mono text-white">{convRate || '—'}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">Clicks</div>
              <div className="font-mono text-white">{clicks || '—'}</div>
            </div>
            <div className="text-right w-20">
              <div className="text-zinc-500 text-xs mb-0.5">Impr</div>
              <div className="font-mono text-white">{impressions || '—'}</div>
            </div>
          </>
        )}
      </div>

      {/* Verdict badge */}
      <div className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide min-w-[70px] text-center',
        v.bg, v.text, 'border', v.border
      )}>
        {verdict}
      </div>

      {/* Actions */}
      <button className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
        ⋮
      </button>
    </div>
  )
}


type SortOption = 'name' | 'spend' | 'revenue' | 'roas' | 'results' | 'cpr'
type SortDirection = 'asc' | 'desc'

const sortLabels: Record<SortOption, string> = {
  name: 'Name',
  spend: 'Spend',
  revenue: 'Revenue',
  roas: 'ROAS',
  results: 'Results',
  cpr: 'CPR',
}

// Sample campaign data with hierarchy
type CampaignData = {
  id: string
  name: string
  spend: string
  revenue: string
  roas: string
  results: string
  cpr: string
  verdict: Verdict
  budgetType: 'CBO' | 'ABO'
  budget?: string
  status?: 'ACTIVE' | 'PAUSED'
  adsets?: Array<{
    id: string
    name: string
    spend: string
    revenue: string
    roas: string
    results: string
    cpr: string
    verdict: Verdict
    budget?: string
    status?: 'ACTIVE' | 'PAUSED'
    ads?: Array<{
      id: string
      name: string
      spend: string
      revenue: string
      roas: string
      results: string
      cpr: string
      verdict: Verdict
      status?: 'ACTIVE' | 'PAUSED'
    }>
  }>
}

const sampleCampaigns: CampaignData[] = [
  {
    id: '1',
    name: 'Summer Sale 2024',
    spend: '$2,450',
    revenue: '$8,230',
    roas: '3.36x',
    results: '156',
    cpr: '$15.71',
    verdict: 'SCALE',
    budgetType: 'CBO',
    budget: '$500/day',
    adsets: [
      {
        id: '1-1',
        name: 'Lookalike - US 1%',
        spend: '$1,230',
        revenue: '$4,560',
        roas: '3.71x',
        results: '89',
        cpr: '$13.82',
        verdict: 'SCALE',
        ads: [
          { id: '1-1-1', name: 'UGC Video - Testimonial', spend: '$650', revenue: '$2,890', roas: '4.45x', results: '52', cpr: '$12.50', verdict: 'SCALE' },
          { id: '1-1-2', name: 'Static - Product Shot', spend: '$580', revenue: '$1,670', roas: '2.88x', results: '37', cpr: '$15.68', verdict: 'WATCH' },
        ]
      },
      {
        id: '1-2',
        name: 'Interest - Fitness Enthusiasts',
        spend: '$1,220',
        revenue: '$3,670',
        roas: '3.01x',
        results: '67',
        cpr: '$18.21',
        verdict: 'WATCH',
      }
    ]
  },
  {
    id: '2',
    name: 'Holiday Promo - Black Friday',
    spend: '$890',
    revenue: '$1,120',
    roas: '1.26x',
    results: '24',
    cpr: '$37.08',
    verdict: 'KILL',
    budgetType: 'ABO',
    status: 'PAUSED',
    adsets: [
      { id: '2-1', name: 'Broad Targeting', spend: '$450', revenue: '$560', roas: '1.24x', results: '12', cpr: '$37.50', verdict: 'KILL', status: 'PAUSED', budget: '$50/day' },
      { id: '2-2', name: 'Lookalike 2%', spend: '$440', revenue: '$560', roas: '1.27x', results: '12', cpr: '$36.67', verdict: 'KILL', budget: '$50/day' },
    ]
  },
  { id: '3', name: 'New Creative Test - Q4', spend: '$45', revenue: '$0', roas: '0.00x', results: '0', cpr: '—', verdict: 'LEARN', budgetType: 'CBO', budget: '$20/day' },
  { id: '4', name: 'Retargeting - Cart Abandoners', spend: '$845', revenue: '$3,100', roas: '3.67x', results: '62', cpr: '$13.63', verdict: 'SCALE', budgetType: 'CBO', budget: '$150/day' },
  { id: '5', name: 'Lookalike - Top Purchasers', spend: '$1,230', revenue: '$4,560', roas: '3.71x', results: '89', cpr: '$13.82', verdict: 'SCALE', budgetType: 'CBO', budget: '$200/day' },
  { id: '6', name: 'Interest - Fitness Enthusiasts', spend: '$1,220', revenue: '$3,670', roas: '3.01x', results: '67', cpr: '$18.21', verdict: 'WATCH', budgetType: 'ABO' },
  { id: '7', name: 'Brand Awareness - Q4', spend: '$320', revenue: '$450', roas: '1.41x', results: '12', cpr: '$26.67', verdict: 'KILL', budgetType: 'CBO', status: 'PAUSED', budget: '$100/day' },
  { id: '8', name: 'UGC Video Campaign', spend: '$650', revenue: '$2,890', roas: '4.45x', results: '52', cpr: '$12.50', verdict: 'SCALE', budgetType: 'CBO', budget: '$75/day' },
  { id: '9', name: 'Static Product Shots', spend: '$580', revenue: '$1,670', roas: '2.88x', results: '37', cpr: '$15.68', verdict: 'WATCH', budgetType: 'ABO' },
  { id: '10', name: 'Influencer Collab - Dec', spend: '$1,500', revenue: '$5,200', roas: '3.47x', results: '98', cpr: '$15.31', verdict: 'SCALE', budgetType: 'CBO', budget: '$250/day' },
  { id: '11', name: 'Flash Sale Weekend', spend: '$780', revenue: '$2,340', roas: '3.00x', results: '45', cpr: '$17.33', verdict: 'WATCH', budgetType: 'CBO', budget: '$120/day' },
  { id: '12', name: 'Email List Retarget', spend: '$290', revenue: '$1,450', roas: '5.00x', results: '34', cpr: '$8.53', verdict: 'SCALE', budgetType: 'CBO', budget: '$50/day' },
  { id: '13', name: 'New Product Launch', spend: '$125', revenue: '$180', roas: '1.44x', results: '4', cpr: '$31.25', verdict: 'LEARN', budgetType: 'ABO' },
  { id: '14', name: 'Competitor Targeting', spend: '$430', revenue: '$890', roas: '2.07x', results: '19', cpr: '$22.63', verdict: 'WATCH', budgetType: 'CBO', budget: '$80/day' },
  { id: '15', name: 'Geo Test - California', spend: '$560', revenue: '$1,890', roas: '3.38x', results: '41', cpr: '$13.66', verdict: 'SCALE', budgetType: 'CBO', budget: '$100/day' },
]

export default function TestDashboardPage() {
  const [sortBy, setSortBy] = useState<SortOption>('spend')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [sortOpen, setSortOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [allExpanded, setAllExpanded] = useState(false)
  // Expand first two campaigns and their adsets by default to show hierarchy
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    '1': true,      // Summer Sale campaign
    '1-1': true,    // Lookalike adset
    '2': true,      // Holiday Promo campaign (ABO example)
  })

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleExpandAll = () => {
    if (allExpanded) {
      // Collapse all
      setExpanded({})
      setAllExpanded(false)
    } else {
      // Expand all campaigns and adsets
      const newExpanded: Record<string, boolean> = {}
      sampleCampaigns.forEach(campaign => {
        newExpanded[campaign.id] = true
        campaign.adsets?.forEach(adset => {
          newExpanded[adset.id] = true
        })
      })
      setExpanded(newExpanded)
      setAllExpanded(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0d12]">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">Performance Dashboard</h1>
            <select className="bg-[#0f1419] border border-white/10 rounded-xl px-4 py-2 text-sm text-white">
              <option>My Ad Account</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <select className="bg-[#0f1419] border border-white/10 rounded-xl px-4 py-2 text-sm text-white">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>This month</option>
            </select>
            <button className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
              <span>↻</span> Sync
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Primary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-4">
          <StatCard label="Total Spend" value="$4,230" icon={Icons.spend} change={33} glow="blue" />
          <StatCard label="Revenue" value="$12,450" icon={Icons.revenue} change={15} glow="green" />
          <StatCard label="ROAS" value="2.94x" icon={Icons.roas} change={-8} glow="purple" />
          <StatCard label="Results" value="342" icon={Icons.results} change={66} glow="amber" />
          <StatCard label="CPR/CPA" value="$12.37" icon={Icons.cpr} change={12} glow="rose" />
        </div>

        {/* Secondary Stats */}
        <div className="hidden lg:grid grid-cols-6 gap-4 mb-8">
          <BudgetCard />
          <StatCard label="CPM" value="$8.42" icon={Icons.cpm} glow="cyan" />
          <StatCard label="CPC" value="$0.87" icon={Icons.cpc} glow="blue" />
          <StatCard label="CTR" value="2.4%" icon={Icons.ctr} glow="purple" />
          <StatCard label="AOV" value="$78.50" icon={Icons.aov} glow="green" />
          <StatCard label="Conv Rate" value="3.2%" icon={Icons.convRate} glow="amber" />
        </div>

        {/* Controls Bar */}
        <div className="flex items-center gap-4 mb-6">
          {/* Select All on left */}
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500/50"
              defaultChecked
            />
            Select All
          </label>
          <span className="text-xs text-zinc-500">({sampleCampaigns.length} campaigns)</span>

          <div className="ml-auto flex items-center gap-4">
          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all duration-200',
                'bg-[#0f1419] border-white/10 text-zinc-300 hover:border-white/20',
              )}
            >
              <span className="text-zinc-500">Sort:</span>
              <span>{sortLabels[sortBy]}</span>
              <span className="text-zinc-500">{sortDir === 'desc' ? '↓' : '↑'}</span>
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#0f1419] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      if (sortBy === option) {
                        setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
                      } else {
                        setSortBy(option)
                        setSortDir('desc')
                      }
                      setSortOpen(false)
                    }}
                    className={cn(
                      'w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors',
                      sortBy === option
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : 'text-zinc-300 hover:bg-white/5'
                    )}
                  >
                    <span>{sortLabels[option]}</span>
                    {sortBy === option && (
                      <span className="text-xs">{sortDir === 'desc' ? '↓ High to Low' : '↑ Low to High'}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={toggleExpandAll}
            className="px-3 py-2 text-sm rounded-xl border border-white/10 bg-[#0f1419] text-zinc-400 hover:text-white hover:border-white/20 transition-colors"
          >
            {allExpanded ? '⊟ Collapse All' : '⊞ Expand All'}
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" className="w-4 h-4 rounded border-zinc-600 bg-zinc-800" defaultChecked />
            Include Paused
          </label>
          <div className="flex items-center gap-1 bg-[#0f1419] rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setViewMode('simple')}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                viewMode === 'simple' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-white'
              )}
            >
              Simple
            </button>
            <button
              onClick={() => setViewMode('detailed')}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                viewMode === 'detailed' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-white'
              )}
            >
              Detailed
            </button>
          </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="space-y-2">
          {/* Campaign Rows with Hierarchy */}
          {sampleCampaigns.map((campaign) => (
            <div key={campaign.id}>
              {/* Campaign Row */}
              <TableRowCard
                name={campaign.name}
                type="campaign"
                spend={campaign.spend}
                revenue={campaign.revenue}
                roas={campaign.roas}
                results={campaign.results}
                cpr={campaign.cpr}
                verdict={campaign.verdict}
                budgetType={campaign.budgetType}
                budget={campaign.budgetType === 'CBO' ? campaign.budget : undefined}
                status={campaign.status}
                hasChildren={!!campaign.adsets?.length}
                isExpanded={expanded[campaign.id]}
                onToggle={() => toggleExpand(campaign.id)}
                viewMode={viewMode}
              />

              {/* Adset Rows (when expanded) */}
              {expanded[campaign.id] && campaign.adsets?.map((adset) => (
                <div key={adset.id} className="mt-2">
                  <TableRowCard
                    name={adset.name}
                    type="adset"
                    spend={adset.spend}
                    revenue={adset.revenue}
                    roas={adset.roas}
                    results={adset.results}
                    cpr={adset.cpr}
                    verdict={adset.verdict}
                    budgetType={campaign.budgetType === 'ABO' ? 'ABO' : undefined}
                    budget={campaign.budgetType === 'ABO' ? adset.budget : undefined}
                    status={adset.status}
                    indent={1}
                    hasChildren={!!adset.ads?.length}
                    isExpanded={expanded[adset.id]}
                    onToggle={() => toggleExpand(adset.id)}
                    viewMode={viewMode}
                  />

                  {/* Ad Rows (when adset expanded) */}
                  {expanded[adset.id] && adset.ads?.map((ad) => (
                    <div key={ad.id} className="mt-2">
                      <TableRowCard
                        name={ad.name}
                        type="ad"
                        spend={ad.spend}
                        revenue={ad.revenue}
                        roas={ad.roas}
                        results={ad.results}
                        cpr={ad.cpr}
                        verdict={ad.verdict}
                        status={ad.status}
                        indent={2}
                        viewMode={viewMode}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
