'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, DollarSign, TrendingUp, ShoppingCart, ChevronDown, Plus, Clock, X, LogOut } from 'lucide-react'
import { useAuth, supabase } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface Workspace {
  id: string
  name: string
  role: string
  canLogWalkins: boolean
}

interface WalkinEntry {
  value: number
  notes: string | null
  time: string
}

interface TopAd {
  adId: string
  adName: string
  roas?: number
  spend?: number
}

interface ClientData {
  workspace: { id: string; name: string }
  role: string
  canLogWalkins: boolean
  stats: {
    spend?: number
    revenue?: number
    roas?: number
    conversions: number
  }
  topAds: TopAd[]
  recentWalkins: WalkinEntry[]
}

export default function ClientPortalPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null)
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)

  // Log walk-in state
  const [logValue, setLogValue] = useState('100')
  const [logNotes, setLogNotes] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  // Load workspaces on mount
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }

    if (user) {
      loadWorkspaces()
    }
  }, [user, authLoading, router])

  // Load workspace data when selected
  useEffect(() => {
    if (selectedWorkspace) {
      loadClientData(selectedWorkspace)
    }
  }, [selectedWorkspace])

  const loadWorkspaces = async () => {
    if (!user?.id) return

    try {
      const res = await fetch(`/api/client/data?userId=${user.id}`)
      const data = await res.json()

      if (data.workspaces && data.workspaces.length > 0) {
        setWorkspaces(data.workspaces)
        setSelectedWorkspace(data.workspaces[0].id)
      } else {
        // User is not a member of any workspace
        setWorkspaces([])
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadClientData = async (workspaceId: string) => {
    if (!user?.id) return

    try {
      const res = await fetch(`/api/client/data?userId=${user.id}&workspaceId=${workspaceId}`)
      const data = await res.json()

      if (res.ok) {
        setClientData(data)
      }
    } catch (err) {
      console.error('Failed to load client data:', err)
    }
  }

  const handleLogWalkin = async () => {
    if (!user?.id || !selectedWorkspace) return

    const value = parseFloat(logValue)
    if (isNaN(value) || value <= 0) {
      setLogError('Please enter a valid amount')
      return
    }

    setLogLoading(true)
    setLogError(null)

    try {
      const res = await fetch('/api/pixel/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          eventType: 'purchase',
          eventValue: value,
          notes: logNotes || undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log walk-in')
      }

      setLogSuccess(true)
      setTimeout(() => {
        setShowLogModal(false)
        setLogSuccess(false)
        setLogValue('100')
        setLogNotes('')
        loadClientData(selectedWorkspace)
      }, 1500)

    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to log walk-in')
    } finally {
      setLogLoading(false)
    }
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return 'Just now'
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-zinc-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">No Workspaces</h1>
          <p className="text-zinc-400 mb-6">
            You haven't been invited to any workspaces yet. Ask your agency to send you an invite.
          </p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspace)

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-accent">KillScale</span>

            {/* Workspace Selector */}
            {workspaces.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                >
                  {currentWorkspace?.name || 'Select'}
                  <ChevronDown className="w-4 h-4" />
                </button>

                {showWorkspaceDropdown && (
                  <>
                    <div className="fixed inset-0" onClick={() => setShowWorkspaceDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50">
                      {workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          onClick={() => {
                            setSelectedWorkspace(ws.id)
                            setShowWorkspaceDropdown(false)
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 transition-colors",
                            ws.id === selectedWorkspace ? "bg-zinc-700" : ""
                          )}
                        >
                          {ws.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {clientData?.workspace.name || 'Your Ad Performance'}
          </h1>
          <p className="text-zinc-400 mt-1">Last 7 days</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {clientData?.stats.spend !== undefined && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                Spent
              </div>
              <p className="text-2xl font-bold text-white">
                ${clientData.stats.spend.toLocaleString()}
              </p>
            </div>
          )}

          {clientData?.stats.revenue !== undefined && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                Revenue
              </div>
              <p className="text-2xl font-bold text-emerald-400">
                ${clientData.stats.revenue.toLocaleString()}
              </p>
            </div>
          )}

          {clientData?.stats.roas !== undefined && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                ROAS
              </div>
              <p className="text-2xl font-bold text-accent">
                {clientData.stats.roas.toFixed(1)}x
              </p>
            </div>
          )}

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <ShoppingCart className="w-4 h-4" />
              Conversions
            </div>
            <p className="text-2xl font-bold text-white">
              {clientData?.stats.conversions || 0}
            </p>
          </div>
        </div>

        {/* Log Walk-In Button */}
        {currentWorkspace?.canLogWalkins && (
          <button
            onClick={() => setShowLogModal(true)}
            className="w-full mb-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-3"
          >
            <Plus className="w-5 h-5" />
            Log Walk-In Sale
          </button>
        )}

        {/* Top Performing Ads */}
        {clientData?.topAds && clientData.topAds.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Top Performing Ads</h2>
            <div className="space-y-2">
              {clientData.topAds.map((ad, i) => (
                <div
                  key={ad.adId}
                  className="flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                      i === 0 ? "bg-emerald-500/20 text-emerald-400" :
                      i === 1 ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-zinc-700 text-zinc-400"
                    )}>
                      {i + 1}
                    </span>
                    <span className="text-white font-medium truncate max-w-[200px]">{ad.adName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {ad.roas !== undefined && (
                      <span className={cn(
                        "font-semibold",
                        ad.roas >= 3 ? "text-emerald-400" :
                        ad.roas >= 1.5 ? "text-yellow-400" :
                        "text-red-400"
                      )}>
                        {ad.roas.toFixed(1)}x
                      </span>
                    )}
                    {ad.spend !== undefined && (
                      <span className="text-zinc-500">${ad.spend.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Walk-Ins */}
        {currentWorkspace?.canLogWalkins && clientData?.recentWalkins && clientData.recentWalkins.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-zinc-400" />
              Recent Walk-Ins
            </h2>
            <div className="space-y-2">
              {clientData.recentWalkins.map((walkin, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                >
                  <div>
                    <p className="font-semibold text-white">${walkin.value.toLocaleString()}</p>
                    {walkin.notes && (
                      <p className="text-sm text-zinc-500 truncate max-w-[200px]">{walkin.notes}</p>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500">{formatTimeAgo(walkin.time)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Log Walk-In Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Log Walk-In Sale</h2>
                <button onClick={() => setShowLogModal(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {logSuccess && (
                <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-center">
                  Walk-in logged successfully!
                </div>
              )}

              {logError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {logError}
                </div>
              )}

              {!logSuccess && (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Sale Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xl">$</span>
                      <input
                        type="number"
                        value={logValue}
                        onChange={(e) => setLogValue(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full pl-10 pr-4 py-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-2xl font-bold focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Notes (optional)</label>
                    <input
                      type="text"
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      placeholder="e.g., Full detail service"
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-accent"
                    />
                  </div>

                  <p className="text-xs text-zinc-500 mb-4">
                    This sale will be split proportionally across all active ads.
                  </p>

                  <button
                    onClick={handleLogWalkin}
                    disabled={logLoading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors"
                  >
                    {logLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Log Sale'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
