'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { 
  BarChart3, 
  TrendingUp, 
  Bell, 
  Settings, 
  Link as LinkIcon,
  ChevronDown,
  LogOut,
  Check,
  FileSpreadsheet
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type AdAccount = {
  id: string
  name: string
  account_status: number
  currency: string
  in_dashboard?: boolean
}

type MetaConnection = {
  ad_accounts: AdAccount[]
  selected_account_id: string | null
}

type DataSource = 'none' | 'csv' | 'meta_api'

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
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<DataSource>('none')
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)
  const [alertCount, setUnreadAlertCount] = useState(0)

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  
  // Load Meta connection data and check current data source
  useEffect(() => {
    if (user) {
      loadConnection()
      checkDataSource()
      loadAlertCount()
    }
  }, [user])

  // Periodically check alert count
  useEffect(() => {
    if (!user) return
    
    const interval = setInterval(loadAlertCount, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [user])

  // Listen for storage events to refresh when data changes
  useEffect(() => {
    const handleStorageChange = () => {
      checkDataSource()
    }
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleStorageChange)
    
    // Also check periodically for changes (handles same-tab updates)
    const interval = setInterval(checkDataSource, 2000)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleStorageChange)
      clearInterval(interval)
    }
  }, [user])

  const loadConnection = async () => {
    if (!user) return
    
    const { data, error } = await supabase
      .from('meta_connections')
      .select('ad_accounts, selected_account_id')
      .eq('user_id', user.id)
      .single()
    
    if (data && !error) {
      setConnection(data)
      setSelectedAccountId(data.selected_account_id)
    }
  }

  const checkDataSource = async () => {
    if (!user) return
    
    // Check what type of data exists
    const { data, error } = await supabase
      .from('ad_data')
      .select('source, ad_account_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    
    if (error || !data) {
      setDataSource('none')
      setCurrentAccountId(null)
    } else if (data.source === 'meta_api') {
      setDataSource('meta_api')
      setCurrentAccountId(data.ad_account_id)
    } else {
      // Treat NULL or 'csv' as CSV data
      setDataSource('csv')
      setCurrentAccountId(null)
    }
  }

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

  // Get dashboard accounts - if none have in_dashboard set, show all accounts
  const allAccounts = connection?.ad_accounts || []
  const dashboardAccounts = allAccounts.filter(a => a.in_dashboard)
  
  // Fallback: if no accounts have in_dashboard set yet, use all accounts
  const displayAccounts = dashboardAccounts.length > 0 ? dashboardAccounts : allAccounts
  const selectedAccount = displayAccounts.find(a => a.id === selectedAccountId) || displayAccounts[0]
  const currentMetaAccount = allAccounts.find(a => a.id === currentAccountId) // Search ALL accounts, not just display
  
  // Show dropdown if there are multiple dashboard accounts OR if there's at least one to switch to
  const canShowDropdown = displayAccounts.length > 0

  // Determine what to show in the account selector
  const getDisplayName = () => {
    if (dataSource === 'none') return 'No data'
    if (dataSource === 'csv') return 'CSV Data'
    if (dataSource === 'meta_api') {
      // First try to find the account by currentAccountId
      if (currentMetaAccount) return currentMetaAccount.name
      // Fallback to selected account
      if (selectedAccount) return selectedAccount.name
      // Last resort
      return 'Meta Account'
    }
    return 'No account selected'
  }

  const handleSelectAccount = async (accountId: string) => {
    if (!user) return
    
    setSelectedAccountId(accountId)
    setShowAccountDropdown(false)
    
    // Save selection to database
    await supabase
      .from('meta_connections')
      .update({ selected_account_id: accountId })
      .eq('user_id', user.id)
    
    // Trigger sync for this account by navigating to dashboard with sync param
    window.location.href = `/dashboard?sync=${accountId}`
  }
  
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
      <div className="relative mb-6">
        <button
          onClick={() => canShowDropdown && setShowAccountDropdown(!showAccountDropdown)}
          className={cn(
            "w-full bg-bg-card border border-border rounded-lg p-3 text-left transition-colors",
            canShowDropdown && "hover:border-zinc-600 cursor-pointer",
          )}
        >
          <div className="text-xs text-zinc-500 mb-1">
            {dataSource === 'csv' ? 'Data Source' : 'Ad Account'}
          </div>
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="truncate flex items-center gap-2">
              {dataSource === 'csv' && <FileSpreadsheet className="w-4 h-4 text-zinc-400" />}
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
            <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden">
              {/* Show CSV option if currently viewing CSV */}
              {dataSource === 'csv' && (
                <div className="px-3 py-2 text-sm text-zinc-400 bg-accent/10 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV Data (current)
                </div>
              )}
              
              {/* Show Meta accounts */}
              {displayAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleSelectAccount(account.id)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-bg-hover transition-colors",
                    dataSource === 'meta_api' && account.id === currentAccountId && "bg-accent/10"
                  )}
                >
                  <span className="truncate">{account.name}</span>
                  {dataSource === 'meta_api' && account.id === currentAccountId && (
                    <Check className="w-4 h-4 text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
              
              <Link
                href="/dashboard/connect"
                className="w-full px-3 py-2 text-left text-sm text-zinc-500 hover:text-white hover:bg-bg-hover transition-colors border-t border-border flex items-center gap-2"
              >
                <LinkIcon className="w-3 h-3" />
                Manage accounts
              </Link>
            </div>
          </>
        )}
        
        {/* No accounts tooltip */}
        {dataSource === 'none' && displayAccounts.length === 0 && (
          <Link 
            href="/dashboard/connect"
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
      </nav>
      
      {/* Connect Account */}
      <div className="space-y-1 mb-6">
        <div className="text-xs text-zinc-600 uppercase tracking-wider px-3 mb-2">
          Accounts
        </div>
        <Link
          href="/dashboard/connect"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
            pathname === '/dashboard/connect'
              ? 'bg-accent text-white'
              : 'text-zinc-400 hover:bg-bg-hover hover:text-white'
          )}
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
