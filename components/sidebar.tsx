'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { 
  BarChart3, 
  TrendingUp, 
  Bell, 
  Settings, 
  Link as LinkIcon,
  ChevronDown,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/dashboard/trends', label: 'Trends', icon: TrendingUp },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
  { href: '/dashboard/settings', label: 'Rules', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { plan } = useSubscription()
  const [showTooltip, setShowTooltip] = useState(false)

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const accountName = 'My Store'
  
  const upgradeText = plan === 'Free' 
    ? { title: 'Upgrade to Starter', subtitle: 'Unlimited campaigns' }
    : plan === 'Starter'
      ? { title: 'Upgrade to Pro', subtitle: 'Meta API connection' }
      : null
  
  return (
    <aside className="w-60 bg-bg-sidebar border-r border-border fixed h-screen overflow-y-auto flex flex-col p-4">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 px-2 mb-6">
      <svg width="180" height="36" viewBox="0 0 280 50">
        <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a"/>
        <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="55" y="33" fill="white" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="24">KillScale</text>
      </svg>
    </Link>
      
      {/* Account Selector */}
      <div 
        className="bg-bg-card border border-border rounded-lg p-3 mb-6 relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="text-xs text-zinc-500 mb-1">Ad Account</div>
        <div className="w-full flex items-center justify-between text-sm font-medium text-zinc-400 cursor-default">
          {accountName}
          <ChevronDown className="w-4 h-4 text-zinc-600" />
        </div>
        {showTooltip && (plan === 'Free' || plan === 'Starter') && (
          <div className="absolute left-0 right-0 top-full mt-2 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 text-center z-10">
            Multiple accounts available in Pro & Agency plans
          </div>
        )}
      </div>
      
      {/* Navigation */}
      <nav className="space-y-1 mb-6">
        <div className="text-xs text-zinc-600 uppercase tracking-wider px-3 mb-2">
          Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive 
                  ? 'bg-accent text-white' 
                  : 'text-zinc-400 hover:bg-bg-hover hover:text-white'
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      
      {/* Connect Account */}
      <div className="space-y-1 mb-6">
        <div className="text-xs text-zinc-600 uppercase tracking-wider px-3 mb-2">
          Accounts
        </div>
        <Link
          href="/dashboard/connect"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-bg-hover hover:text-white transition-colors"
        >
          <LinkIcon className="w-5 h-5" />
          Connect Account
        </Link>
      </div>
      
      {/* Spacer */}
      <div className="flex-1" />

      {/* Upgrade CTA */}
      {upgradeText && (
        <Link
          href="/pricing"
          className="block mb-4 p-3 bg-gradient-to-r from-accent/20 to-emerald-500/20 border border-accent/30 rounded-lg text-center hover:border-accent transition-colors"
        >
          <div className="text-sm font-semibold text-accent">{upgradeText.title}</div>
          <div className="text-xs text-zinc-500">{upgradeText.subtitle}</div>
        </Link>
      )}
      
      {/* User Menu */}
      <Link 
        href="/account"
        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-bg-hover transition-colors"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-accent to-purple-500 rounded-lg flex items-center justify-center text-sm font-semibold">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{userName}</div>
          <div className="text-xs text-zinc-500">{plan} Plan</div>
        </div>
      </Link>
      
      {/* Logout */}
      <button
        onClick={signOut}
        className="flex items-center gap-3 px-3 py-2 mt-2 rounded-lg text-sm text-zinc-500 hover:bg-bg-hover hover:text-white transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </aside>
  )
}
