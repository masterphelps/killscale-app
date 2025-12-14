'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  Bell,
  Settings,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  LogOut,
  Check,
  FileSpreadsheet,
  Lightbulb,
  EyeOff,
  Eye,
  HelpCircle,
  Rocket,
  SlidersHorizontal,
  Scale,
  Radio,
  Users,
  Layers,
  Building2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth, supabase } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { usePrivacyMode } from '@/lib/privacy-mode'
import { useAccount } from '@/lib/account'

interface Workspace {
  id: string
  name: string
  is_default: boolean
  account_count?: number
}

const navItems = [
  { href: '/dashboard/launch', label: 'Launch', icon: Rocket },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/dashboard/insights', label: 'Insights', icon: Lightbulb },
  { href: '/dashboard/trends', label: 'Trends', icon: TrendingUp },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
]

const settingsItems = [
  { href: '/dashboard/settings', label: 'General', icon: SlidersHorizontal },
  { href: '/dashboard/settings/rules', label: 'Rules', icon: Scale },
  { href: '/dashboard/settings/pixel', label: 'Pixel', icon: Radio, proOnly: true },
  { href: '/dashboard/settings/accounts', label: 'Accounts', icon: Users },
  { href: '/dashboard/settings/workspaces', label: 'Workspaces', icon: Layers, proOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { plan } = useSubscription()
  const { isPrivacyMode, togglePrivacyMode, maskText } = usePrivacyMode()
  const {
    currentAccountId,
    currentAccount,
    accounts,
    dataSource,
    switchAccount,
    currentWorkspaceId,
    currentWorkspace,
    switchWorkspace
  } = useAccount()

  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [alertCount, setUnreadAlertCount] = useState(0)
  const [settingsExpanded, setSettingsExpanded] = useState(() => {
    // Auto-expand if currently on a settings page
    if (typeof window !== 'undefined') {
      return window.location.pathname.startsWith('/dashboard/settings')
    }
    return false
  })
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  // Check if user is Pro+ (can see workspaces)
  const isProPlus = plan === 'Pro' || plan === 'Agency'
  console.log('Sidebar plan:', plan, 'isProPlus:', isProPlus)

  const rawUserName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const userName = maskText(rawUserName, 'Demo User')

  // Auto-expand settings when navigating to a settings page
  useEffect(() => {
    if (pathname.startsWith('/dashboard/settings')) {
      setSettingsExpanded(true)
    }
  }, [pathname])

  // Check if any settings page is active
  const isSettingsActive = pathname.startsWith('/dashboard/settings')

  // Load alert count
  useEffect(() => {
    if (user) {
      loadAlertCount()
    }
  }, [user])

  // Periodically check alert count
  useEffect(() => {
    if (!user) return

    const interval = setInterval(loadAlertCount, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [user])

  const loadAlertCount = async () => {
    if (!user) return

    try {
      const res = await fetch(`/api/alerts?userId=${user.id}&countOnly=true`)
      const data = await res.json()
      if (typeof data.count === 'number') {
        setUnreadAlertCount(data.count)
      }
    } catch (err) {
      console.error('Failed to load alert count:', err)
    }
  }

  // Load workspaces for Pro+ users
  const loadWorkspaces = useCallback(async () => {
    if (!user || !isProPlus) return

    try {
      // Get workspaces (non-default only)
      const { data: workspacesData, error } = await supabase
        .from('workspaces')
        .select('id, name, is_default')
        .eq('user_id', user.id)
        .eq('is_default', false)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Failed to load workspaces:', error)
        return
      }

      console.log('Loaded workspaces:', workspacesData)

      const formatted = (workspacesData || []).map(w => ({
        id: w.id,
        name: w.name,
        is_default: w.is_default,
        account_count: 0
      }))

      setWorkspaces(formatted)
    } catch (err) {
      console.error('Failed to load workspaces:', err)
    }
  }, [user, isProPlus])

  // Load workspaces on mount for Pro+ users
  useEffect(() => {
    if (isProPlus) {
      loadWorkspaces()
    }
  }, [isProPlus, loadWorkspaces])

  const canShowDropdown = accounts.length > 0 || workspaces.length > 0

  // Determine what to show in the account selector
  const getDisplayName = () => {
    // If workspace is selected (Pro+ only)
    if (currentWorkspaceId && isProPlus) {
      if (currentWorkspace) return maskText(currentWorkspace.name, 'Demo Workspace')
      const workspace = workspaces.find(w => w.id === currentWorkspaceId)
      if (workspace) return maskText(workspace.name, 'Demo Workspace')
    }

    if (dataSource === 'none') return 'No data'
    if (dataSource === 'csv') return 'CSV Data'
    if (dataSource === 'meta_api') {
      if (currentAccount) return maskText(currentAccount.name, 'Demo Ad Account')
      return 'Meta Account'
    }
    return 'No account selected'
  }

  // Get the label for the selector
  const getSelectorLabel = () => {
    if (currentWorkspaceId && isProPlus) return 'Workspace'
    if (dataSource === 'csv') return 'Data Source'
    return 'Ad Account'
  }

  const handleSelectWorkspace = async (workspaceId: string) => {
    setShowAccountDropdown(false)
    await switchWorkspace(workspaceId)
  }

  const handleSelectAccount = async (accountId: string) => {
    setShowAccountDropdown(false)
    await switchAccount(accountId)
  }

  const upgradeText = plan === 'Free'
    ? { title: 'Upgrade to Starter', subtitle: 'More campaigns' }
    : plan === 'Starter'
      ? { title: 'Upgrade to Pro', subtitle: 'Unlimited campaigns' }
      : null

  return (
    <aside className="w-60 bg-bg-sidebar border-r border-border fixed h-screen overflow-y-auto flex flex-col p-4">
      {/* Logo + Privacy Toggle (Agency only) */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <svg width="150" height="30" viewBox="0 0 280 50">
            <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a"/>
            <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x="55" y="33" fill="white" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="24">KillScale</text>
          </svg>
        </Link>
        {plan === 'Agency' && (
          <button
            onClick={togglePrivacyMode}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isPrivacyMode
                ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-bg-hover"
            )}
            title={isPrivacyMode ? "Privacy mode ON - click to show real data" : "Privacy mode OFF - click to hide sensitive data"}
          >
            {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Account Selector */}
      <div className="relative mb-6">
        <button
          onClick={() => canShowDropdown && setShowAccountDropdown(!showAccountDropdown)}
          className={cn(
            "w-full bg-bg-card border border-border rounded-lg p-3 text-left transition-colors",
            canShowDropdown && "hover:border-zinc-600 cursor-pointer",
          )}
        >
          <div className="text-xs text-zinc-500 mb-1">
            {getSelectorLabel()}
          </div>
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="truncate flex items-center gap-2">
              {dataSource === 'csv' && <FileSpreadsheet className="w-4 h-4 text-zinc-400" />}
              {currentWorkspaceId && isProPlus && <Building2 className="w-4 h-4 text-purple-400" />}
              {getDisplayName()}
            </span>
            {canShowDropdown && (
              <ChevronDown className={cn(
                "w-4 h-4 text-zinc-500 transition-transform",
                showAccountDropdown && "rotate-180"
              )} />
            )}
          </div>
        </button>

        {/* Dropdown */}
        {showAccountDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowAccountDropdown(false)}
            />
            <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden max-h-80 overflow-y-auto">
              {/* Show CSV option if currently viewing CSV */}
              {dataSource === 'csv' && (
                <div className="px-3 py-2 text-sm text-zinc-400 bg-accent/10 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV Data (current)
                </div>
              )}

              {/* WORKSPACES section - Pro+ only */}
              {isProPlus && workspaces.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs text-zinc-500 uppercase tracking-wider bg-zinc-900/50">
                    Workspaces
                  </div>
                  {workspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      onClick={() => handleSelectWorkspace(workspace.id)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-bg-hover transition-colors",
                        currentWorkspaceId === workspace.id && !currentAccountId && "bg-purple-500/10"
                      )}
                    >
                      <span className="truncate flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-400" />
                        {maskText(workspace.name, 'Demo Workspace')}
                        {workspace.account_count !== undefined && workspace.account_count > 0 && (
                          <span className="text-xs text-zinc-500">({workspace.account_count})</span>
                        )}
                      </span>
                      {currentWorkspaceId === workspace.id && (
                        <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}

              {/* INDIVIDUAL ACCOUNTS section */}
              {accounts.length > 0 && (
                <>
                  {isProPlus && workspaces.length > 0 && (
                    <div className="px-3 py-1.5 text-xs text-zinc-500 uppercase tracking-wider bg-zinc-900/50 border-t border-border">
                      Individual Accounts
                    </div>
                  )}
                  {accounts.map((account, index) => (
                    <button
                      key={account.id}
                      onClick={() => handleSelectAccount(account.id)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-bg-hover transition-colors",
                        account.id === currentAccountId && !currentWorkspaceId && "bg-accent/10"
                      )}
                    >
                      <span className="truncate">{maskText(account.name, `Ad Account ${index + 1}`)}</span>
                      {account.id === currentAccountId && !currentWorkspaceId && (
                        <Check className="w-4 h-4 text-accent flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}

              <Link
                href="/dashboard/settings/accounts"
                className="w-full px-3 py-2 text-left text-sm text-zinc-500 hover:text-white hover:bg-bg-hover transition-colors border-t border-border flex items-center gap-2"
              >
                <LinkIcon className="w-3 h-3" />
                Manage accounts
              </Link>
            </div>
          </>
        )}

        {/* No accounts tooltip */}
        {dataSource === 'none' && accounts.length === 0 && (
          <Link
            href="/dashboard/settings/accounts"
            className="block mt-2 text-xs text-accent hover:text-accent-hover text-center"
          >
            Connect an account →
          </Link>
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
          const isAlerts = item.href === '/dashboard/alerts'

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
              <span className="flex-1">{item.label}</span>
              {isAlerts && alertCount > 0 && (
                <span className={cn(
                  "min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold flex items-center justify-center",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-red-500 text-white"
                )}>
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </Link>
          )
        })}

        {/* Settings - Expandable */}
        <div>
          <button
            onClick={() => setSettingsExpanded(!settingsExpanded)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              isSettingsActive
                ? 'bg-accent/20 text-white'
                : 'text-zinc-400 hover:bg-bg-hover hover:text-white'
            )}
          >
            <Settings className="w-5 h-5" />
            <span className="flex-1 text-left">Settings</span>
            <ChevronRight className={cn(
              "w-4 h-4 transition-transform",
              settingsExpanded && "rotate-90"
            )} />
          </button>

          {/* Settings Sub-items */}
          {settingsExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-zinc-700 pl-3">
              {settingsItems.map((item) => {
                // Skip Pro+ only items (Pixel, Workspaces) for Free and Starter tiers
                if (item.proOnly && !isProPlus) return null

                const Icon = item.icon
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-accent text-white'
                        : 'text-zinc-400 hover:bg-bg-hover hover:text-white'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </nav>

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

      {/* Support & Logout */}
      <div className="flex items-center gap-2 mt-2">
        <a
          href="mailto:contactkillscale@gmail.com"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-500 hover:bg-bg-hover hover:text-white transition-colors"
          title="Get Support"
        >
          <HelpCircle className="w-4 h-4" />
        </a>
        <button
          onClick={signOut}
          className="flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-bg-hover hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
