'use client'

import { cn } from '@/lib/utils'

// Command Center StatCard - test version
function StatCardNew({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl p-3 lg:p-5 transition-all duration-300',
      // Command center aesthetic - dark background with subtle cyan glow
      'bg-zinc-900/90 backdrop-blur-sm',
      'border border-zinc-700/50',
      'shadow-lg shadow-black/30',
      // Subtle inner glow effect
      'before:absolute before:inset-0 before:bg-gradient-to-br before:from-cyan-500/5 before:to-transparent before:pointer-events-none',
      // Hover state - brighter border
      'hover:border-zinc-500/70 hover:shadow-xl hover:shadow-cyan-500/5',
    )}>
      <div className="relative">
        <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
          {icon && (
            <span className="text-base lg:text-lg drop-shadow-sm">{icon}</span>
          )}
          <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide font-medium">{label}</span>
        </div>
        <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
      </div>
    </div>
  )
}

// Alternative: White border version
function StatCardWhiteBorder({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl p-3 lg:p-5 transition-all duration-300',
      'bg-zinc-900/80',
      'border border-white/10',
      'shadow-lg shadow-black/40',
      'hover:border-white/20 hover:shadow-xl',
    )}>
      <div className="relative">
        <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
          {icon && (
            <span className="text-base lg:text-lg drop-shadow-sm">{icon}</span>
          )}
          <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide font-medium">{label}</span>
        </div>
        <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
      </div>
    </div>
  )
}

// Alternative: Glassmorphism
function StatCardGlass({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl p-3 lg:p-5 transition-all duration-300',
      'bg-white/5 backdrop-blur-md',
      'border border-white/10',
      'shadow-xl shadow-black/20',
      'hover:bg-white/8 hover:border-white/15',
    )}>
      <div className="relative">
        <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
          {icon && (
            <span className="text-base lg:text-lg drop-shadow-sm">{icon}</span>
          )}
          <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide font-medium">{label}</span>
        </div>
        <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
      </div>
    </div>
  )
}

// Alternative: Minimal with accent line
function StatCardAccentLine({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl p-3 lg:p-5 transition-all duration-300',
      'bg-zinc-900/90',
      'border border-zinc-800',
      'shadow-lg shadow-black/30',
      // Accent line on left
      'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-cyan-500/50 before:rounded-full',
      'hover:border-zinc-700',
    )}>
      <div className="relative pl-2">
        <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
          {icon && (
            <span className="text-base lg:text-lg drop-shadow-sm">{icon}</span>
          )}
          <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide font-medium">{label}</span>
        </div>
        <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
      </div>
    </div>
  )
}

// Alternative: Neon glow bottom border
function StatCardNeon({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl p-3 lg:p-5 transition-all duration-300',
      'bg-zinc-900/90',
      'border border-zinc-800',
      'shadow-lg shadow-black/30',
      // Neon glow bottom
      'after:absolute after:bottom-0 after:left-4 after:right-4 after:h-px after:bg-gradient-to-r after:from-transparent after:via-cyan-500/50 after:to-transparent',
      'hover:border-zinc-700 hover:after:via-cyan-400/70',
    )}>
      <div className="relative">
        <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
          {icon && (
            <span className="text-base lg:text-lg drop-shadow-sm">{icon}</span>
          )}
          <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide font-medium">{label}</span>
        </div>
        <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
      </div>
    </div>
  )
}

// Option 6: Triple Whale Style (from reference image)
function StatCardTripleWhale({ label, value, icon, change }: { label: string; value: string; icon?: string; change?: number }) {
  return (
    <div className={cn(
      'relative rounded-2xl p-5 transition-all duration-200',
      'bg-[#0f1419]',
      'border border-white/10',
      'hover:border-white/20',
    )}>
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <span className="text-lg">{icon}</span>
        )}
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-3xl font-bold font-mono text-white">{value}</div>
        {change !== undefined && (
          <div className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1',
            change >= 0
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          )}>
            <span>{change >= 0 ? '↗' : '↘'}</span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Option 7: Triple Whale + Subtle Color Glow
type GlowColor = 'blue' | 'green' | 'purple' | 'amber' | 'rose' | 'cyan'
const glowStyles: Record<GlowColor, string> = {
  blue: 'before:from-blue-500/8',
  green: 'before:from-emerald-500/8',
  purple: 'before:from-purple-500/8',
  amber: 'before:from-amber-500/8',
  rose: 'before:from-rose-500/8',
  cyan: 'before:from-cyan-500/8',
}

function StatCardWithGlow({ label, value, icon, change, glow }: { label: string; value: string; icon?: string; change?: number; glow?: GlowColor }) {
  return (
    <div className={cn(
      'relative rounded-2xl p-5 transition-all duration-200 overflow-hidden',
      'bg-[#0f1419]',
      'border border-white/10',
      'hover:border-white/20',
      // Subtle glow
      glow && 'before:absolute before:inset-0 before:bg-gradient-to-br before:to-transparent before:pointer-events-none',
      glow && glowStyles[glow],
    )}>
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          {icon && (
            <span className="text-lg">{icon}</span>
          )}
          <span className="text-sm text-zinc-400">{label}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-3xl font-bold font-mono text-white">{value}</div>
          {change !== undefined && (
            <div className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1',
              change >= 0
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
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
  verdict,
  isExpanded,
  indent = 0
}: {
  name: string
  type: 'campaign' | 'adset' | 'ad'
  spend: string
  revenue: string
  roas: string
  verdict: Verdict
  isExpanded?: boolean
  indent?: number
}) {
  const v = verdictStyles[verdict]
  const typeColors = {
    campaign: 'bg-blue-500',
    adset: 'bg-purple-500',
    ad: 'bg-zinc-500'
  }

  return (
    <div
      className={cn(
        'rounded-xl p-4 transition-all duration-200',
        'bg-[#0f1419]',
        'border border-white/10',
        'hover:border-white/20 hover:bg-[#131820]',
        'flex items-center gap-4',
      )}
      style={{ marginLeft: indent * 24 }}
    >
      {/* Expand/collapse indicator */}
      {type !== 'ad' && (
        <button className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white">
          {isExpanded ? '▼' : '▶'}
        </button>
      )}
      {type === 'ad' && <div className="w-5" />}

      {/* Type indicator */}
      <div className={cn('w-1.5 h-8 rounded-full', typeColors[type])} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{name}</div>
        <div className="text-xs text-zinc-500 capitalize">{type}</div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-8 text-sm">
        <div className="text-right w-24">
          <div className="text-zinc-500 text-xs mb-0.5">Spend</div>
          <div className="font-mono text-white">{spend}</div>
        </div>
        <div className="text-right w-24">
          <div className="text-zinc-500 text-xs mb-0.5">Revenue</div>
          <div className="font-mono text-white">{revenue}</div>
        </div>
        <div className="text-right w-20">
          <div className="text-zinc-500 text-xs mb-0.5">ROAS</div>
          <div className="font-mono text-white">{roas}</div>
        </div>
      </div>

      {/* Verdict badge */}
      <div className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide',
        v.bg, v.text, 'border', v.border
      )}>
        {verdict}
      </div>
    </div>
  )
}

export default function TestCardsPage() {
  const stats = [
    { label: 'Total Spend', value: '$4,230', icon: '💰', change: 33 },
    { label: 'Revenue', value: '$12,450', icon: '💵', change: 15 },
    { label: 'ROAS', value: '2.94x', icon: '📈', change: -27 },
    { label: 'Results', value: '342', icon: '🎯', change: 66 },
    { label: 'CPR/CPA', value: '$12.37', icon: '💳', change: 12 },
  ]

  const secondaryStats = [
    { label: 'CPM', value: '$8.42', icon: '👁️', change: 12 },
    { label: 'CPC', value: '$0.87', icon: '👆', change: -10 },
    { label: 'CTR', value: '2.4%', icon: '🎯', change: 72 },
    { label: 'AOV', value: '$78.50', icon: '🧾', change: 8 },
    { label: 'Conv Rate', value: '3.2%', icon: '✅', change: 15 },
  ]

  return (
    <div className="min-h-screen bg-bg-dark p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Card Style Test</h1>

      {/* Option 1: Cyan Glow Command Center */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 1: Cyan Glow (Command Center)</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {stats.map((stat) => (
            <StatCardNew key={stat.label} {...stat} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {secondaryStats.map((stat) => (
            <StatCardNew key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Option 2: White Border */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 2: White Border (Clean)</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {stats.map((stat) => (
            <StatCardWhiteBorder key={stat.label} {...stat} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {secondaryStats.map((stat) => (
            <StatCardWhiteBorder key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Option 3: Glassmorphism */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 3: Glassmorphism</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {stats.map((stat) => (
            <StatCardGlass key={stat.label} {...stat} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {secondaryStats.map((stat) => (
            <StatCardGlass key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Option 4: Accent Line */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 4: Accent Line</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {stats.map((stat) => (
            <StatCardAccentLine key={stat.label} {...stat} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {secondaryStats.map((stat) => (
            <StatCardAccentLine key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Option 5: Neon Bottom */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 5: Neon Bottom Glow</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {stats.map((stat) => (
            <StatCardNeon key={stat.label} {...stat} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {secondaryStats.map((stat) => (
            <StatCardNeon key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Option 6: Triple Whale Style (Reference Image) */}
      <div className="mb-12 p-8 -mx-8 bg-[#0a0d12]">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 6: Triple Whale Style (Reference)</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          {stats.map((stat) => (
            <StatCardTripleWhale key={stat.label} {...stat} />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-4">
          {secondaryStats.map((stat) => (
            <StatCardTripleWhale key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      {/* Option 7: Triple Whale + Subtle Glow */}
      <div className="mb-12 p-8 -mx-8 bg-[#0a0d12]">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Option 7: Triple Whale + Subtle Color Glow</h2>
        <div className="grid grid-cols-5 gap-4 mb-4">
          <StatCardWithGlow label="Total Spend" value="$4,230" icon="💰" change={33} glow="blue" />
          <StatCardWithGlow label="Revenue" value="$12,450" icon="💵" change={15} glow="green" />
          <StatCardWithGlow label="ROAS" value="2.94x" icon="📈" change={-27} glow="purple" />
          <StatCardWithGlow label="Results" value="342" icon="🎯" change={66} glow="amber" />
          <StatCardWithGlow label="CPR/CPA" value="$12.37" icon="💳" change={12} glow="rose" />
        </div>
        <div className="grid grid-cols-5 gap-4">
          <StatCardWithGlow label="CPM" value="$8.42" icon="👁️" change={12} glow="cyan" />
          <StatCardWithGlow label="CPC" value="$0.87" icon="👆" change={-10} glow="blue" />
          <StatCardWithGlow label="CTR" value="2.4%" icon="🎯" change={72} glow="purple" />
          <StatCardWithGlow label="AOV" value="$78.50" icon="🧾" change={8} glow="green" />
          <StatCardWithGlow label="Conv Rate" value="3.2%" icon="✅" change={15} glow="amber" />
        </div>
      </div>

      {/* Data Table as Card Rows */}
      <div className="mb-12 p-8 -mx-8 bg-[#0a0d12]">
        <h2 className="text-lg font-semibold text-zinc-300 mb-4">Data Table - Card Row Style</h2>
        <div className="space-y-2">
          {/* Campaign */}
          <TableRowCard
            name="Summer Sale 2024"
            type="campaign"
            spend="$2,450"
            revenue="$8,230"
            roas="3.36x"
            verdict="SCALE"
            isExpanded={true}
          />
          {/* Ad Sets */}
          <TableRowCard
            name="Lookalike - US 1%"
            type="adset"
            spend="$1,230"
            revenue="$4,560"
            roas="3.71x"
            verdict="SCALE"
            isExpanded={true}
            indent={1}
          />
          {/* Ads */}
          <TableRowCard
            name="UGC Video - Testimonial"
            type="ad"
            spend="$650"
            revenue="$2,890"
            roas="4.45x"
            verdict="SCALE"
            indent={2}
          />
          <TableRowCard
            name="Static - Product Shot"
            type="ad"
            spend="$580"
            revenue="$1,670"
            roas="2.88x"
            verdict="WATCH"
            indent={2}
          />
          {/* Another Ad Set */}
          <TableRowCard
            name="Interest - Fitness"
            type="adset"
            spend="$1,220"
            revenue="$3,670"
            roas="3.01x"
            verdict="WATCH"
            isExpanded={false}
            indent={1}
          />
          {/* Another Campaign */}
          <TableRowCard
            name="Holiday Promo"
            type="campaign"
            spend="$890"
            revenue="$1,120"
            roas="1.26x"
            verdict="KILL"
            isExpanded={false}
          />
          {/* Learning Campaign */}
          <TableRowCard
            name="New Creative Test"
            type="campaign"
            spend="$45"
            revenue="$0"
            roas="0.00x"
            verdict="LEARN"
            isExpanded={false}
          />
        </div>
      </div>
    </div>
  )
}
