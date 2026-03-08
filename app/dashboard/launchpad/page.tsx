'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { usePrivacyMode } from '@/lib/privacy-mode'
import {
  BarChart3,
  Wand2,
  LayoutGrid,
  Zap,
  TrendingUp,
  Lightbulb,
  ArrowRight,
} from 'lucide-react'

interface LaunchTile {
  label: string
  description: string
  href: string
  icon: React.ElementType
  gradient: string
  glowColor: string
  iconBg: string
}

const tiles: LaunchTile[] = [
  {
    label: 'Performance',
    description: 'Verdicts, budgets & metrics',
    href: '/dashboard',
    icon: BarChart3,
    gradient: 'from-blue-600/20 via-blue-500/10 to-transparent',
    glowColor: 'rgba(59,130,246,0.15)',
    iconBg: 'bg-blue-500/20 text-blue-400',
  },
  {
    label: 'Ad Studio',
    description: 'Generate ads with AI',
    href: '/dashboard/creative-studio/ad-studio',
    icon: Wand2,
    gradient: 'from-purple-600/20 via-purple-500/10 to-transparent',
    glowColor: 'rgba(139,92,246,0.15)',
    iconBg: 'bg-purple-500/20 text-purple-400',
  },
  {
    label: 'Library',
    description: 'Media, videos & assets',
    href: '/dashboard/creative-studio/media',
    icon: LayoutGrid,
    gradient: 'from-cyan-600/20 via-cyan-500/10 to-transparent',
    glowColor: 'rgba(6,182,212,0.15)',
    iconBg: 'bg-cyan-500/20 text-cyan-400',
  },
  {
    label: 'Active Ads',
    description: 'Running creative analysis',
    href: '/dashboard/creative-studio/active',
    icon: Zap,
    gradient: 'from-emerald-600/20 via-emerald-500/10 to-transparent',
    glowColor: 'rgba(16,185,129,0.15)',
    iconBg: 'bg-emerald-500/20 text-emerald-400',
  },
  {
    label: 'Trends',
    description: '30-day performance history',
    href: '/dashboard/trends',
    icon: TrendingUp,
    gradient: 'from-orange-600/20 via-orange-500/10 to-transparent',
    glowColor: 'rgba(249,115,22,0.15)',
    iconBg: 'bg-orange-500/20 text-orange-400',
  },
  {
    label: 'Insights',
    description: 'AI-powered recommendations',
    href: '/dashboard/insights',
    icon: Lightbulb,
    gradient: 'from-amber-600/20 via-amber-500/10 to-transparent',
    glowColor: 'rgba(245,158,11,0.15)',
    iconBg: 'bg-amber-500/20 text-amber-400',
  },
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function LaunchpadPage() {
  const { user } = useAuth()
  const { maskText } = usePrivacyMode()
  const [mounted, setMounted] = useState(false)

  const rawName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || ''
  const firstName = rawName.split(' ')[0]
  const displayName = maskText(firstName, 'there')

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative min-h-[calc(100vh-5rem)] lg:min-h-[calc(100vh-2rem)] flex flex-col items-center overflow-hidden">
      {/* Ambient mesh gradient background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(99,102,241,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 20%, rgba(139,92,246,0.14) 0%, transparent 55%),
            radial-gradient(ellipse 70% 40% at 50% 90%, rgba(59,130,246,0.10) 0%, transparent 50%)
          `,
        }}
      />

      {/* Subtle noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-8 lg:py-16">
        {/* Greeting */}
        <div
          className="mb-10 lg:mb-14"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            {getGreeting()}{displayName ? `, ${displayName}` : ''}
          </h1>
          <p className="text-zinc-500 mt-2 text-base lg:text-lg">
            Where would you like to go?
          </p>
        </div>

        {/* Tile Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {tiles.map((tile, i) => {
            const Icon = tile.icon
            const delay = 80 + i * 60
            return (
              <Link
                key={tile.href}
                href={tile.href}
                {...(tile.label === 'Ad Studio' ? { 'data-tour': 'launchpad-ad-studio' } : {})}
                {...(tile.label === 'Performance' ? { 'data-tour': 'launchpad-performance' } : {})}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05] hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(16px)',
                  transition: `opacity 0.5s ease-out ${delay}ms, transform 0.5s ease-out ${delay}ms, border-color 0.3s, background-color 0.3s, box-shadow 0.3s`,
                  boxShadow: `0 0 0 0 ${tile.glowColor}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 4px 32px ${tile.glowColor}, 0 0 0 1px ${tile.glowColor}`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 0 0 ${tile.glowColor}`
                }}
              >
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${tile.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                {/* Content */}
                <div className="relative p-4 lg:p-6 flex flex-col min-h-[120px] lg:min-h-[150px]">
                  <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl ${tile.iconBg} flex items-center justify-center mb-auto`}>
                    <Icon className="w-5 h-5 lg:w-6 lg:h-6" />
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm lg:text-base font-semibold text-white">
                        {tile.label}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all duration-200" />
                    </div>
                    <p className="text-xs lg:text-sm text-zinc-500 mt-0.5 hidden lg:block">
                      {tile.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Subtle bottom tagline */}
        <div
          className="text-center mt-10 lg:mt-14"
          style={{
            opacity: mounted ? 1 : 0,
            transition: `opacity 0.6s ease-out 700ms`,
          }}
        >
          <p className="text-xs text-zinc-700">
            Scale what works. Kill what doesn&apos;t.
          </p>
        </div>
      </div>
    </div>
  )
}
