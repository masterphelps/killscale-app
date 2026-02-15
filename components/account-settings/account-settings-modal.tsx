'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, User, Plug, Settings, Database, Users, Radio, Bell, CreditCard, ChevronDown, Building2, ShoppingBag, Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { FEATURES } from '@/lib/feature-flags'
import { ProfilePanel } from './profile-panel'
import { ConnectionsPanel } from './connections-panel'
import { GeneralPanel } from './general-panel'
import { DataSourcesPanel } from './data-sources-panel'
import { MembersPanel } from './members-panel'
import { PixelPanel } from './pixel-panel'
import { ShopifyPanel } from './shopify-panel'
import { UpPromotePanel } from './uppromote-panel'
import { AlertsPanel } from './alerts-panel'
import { BillingPanel } from './billing-panel'

export type SettingsPanel =
  | 'profile'
  | 'connections'
  | 'general'
  | 'data-sources'
  | 'members'
  | 'pixel'
  | 'shopify'
  | 'uppromote'
  | 'alerts'
  | 'billing'

interface AccountSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialPanel?: SettingsPanel
}

type ModalWorkspace = {
  id: string
  name: string
}

const accountNavItems: { id: SettingsPanel; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'connections', label: 'Connections', icon: Plug },
]

const workspaceNavItems: { id: SettingsPanel; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'data-sources', label: 'Data Sources', icon: Database },
  { id: 'pixel', label: 'Pixel', icon: Radio },
  { id: 'shopify', label: 'Shopify', icon: ShoppingBag },
  ...(FEATURES.UPPROMOTE ? [{ id: 'uppromote' as SettingsPanel, label: 'UpPromote', icon: Gift }] : []),
  { id: 'members', label: 'Members', icon: Users },
  { id: 'alerts', label: 'Alerts', icon: Bell },
]

const billingNavItems: { id: SettingsPanel; label: string; icon: typeof CreditCard }[] = [
  { id: 'billing', label: 'Plan & Billing', icon: CreditCard },
]

export function AccountSettingsModal({ isOpen, onClose, initialPanel = 'profile' }: AccountSettingsModalProps) {
  const { user } = useAuth()
  const [activePanel, setActivePanel] = useState<SettingsPanel>(initialPanel)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Workspace selector state (self-contained, not dependent on sidebar selection)
  const [workspaces, setWorkspaces] = useState<ModalWorkspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false)

  // Load workspaces when modal opens
  useEffect(() => {
    if (!isOpen || !user) return

    const load = async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('is_default', false)
        .order('created_at', { ascending: true })

      const list = data || []
      setWorkspaces(list)
      // Auto-select first workspace if none selected
      if (list.length > 0 && !selectedWorkspaceId) {
        setSelectedWorkspaceId(list[0].id)
      }
    }

    load()
  }, [isOpen, user])

  useEffect(() => {
    if (isOpen) {
      setActivePanel(initialPanel)
      setMobileNavOpen(false)
    }
  }, [isOpen, initialPanel])

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = ''
      }
    }
  }, [isOpen, handleEscape])

  if (!isOpen) return null

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId)
  const workspaceName = selectedWorkspace?.name || 'Select Workspace'

  const isWorkspacePanel = ['general', 'data-sources', 'members', 'pixel', 'shopify', 'uppromote', 'alerts'].includes(activePanel)

  const renderPanel = () => {
    switch (activePanel) {
      case 'profile': return <ProfilePanel />
      case 'connections': return <ConnectionsPanel onClose={onClose} />
      case 'general': return <GeneralPanel workspaceId={selectedWorkspaceId} />
      case 'data-sources': return <DataSourcesPanel workspaceId={selectedWorkspaceId} />
      case 'members': return <MembersPanel workspaceId={selectedWorkspaceId} />
      case 'pixel': return <PixelPanel workspaceId={selectedWorkspaceId} />
      case 'shopify': return <ShopifyPanel workspaceId={selectedWorkspaceId} />
      case 'uppromote': return <UpPromotePanel workspaceId={selectedWorkspaceId} />
      case 'alerts': return <AlertsPanel />
      case 'billing': return <BillingPanel />
      default: return <ProfilePanel />
    }
  }

  const navItemButton = (item: { id: SettingsPanel; label: string; icon: typeof User }) => {
    const Icon = item.icon
    return (
      <button
        key={item.id}
        onClick={() => { setActivePanel(item.id); setMobileNavOpen(false) }}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
          activePanel === item.id
            ? 'bg-accent/15 text-white font-medium'
            : 'text-zinc-400 hover:text-white hover:bg-bg-hover'
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal - fixed height on desktop */}
      <div className="relative w-full h-full lg:h-[80vh] lg:max-w-4xl lg:rounded-xl bg-bg-dark border border-border overflow-hidden flex flex-col lg:flex-row">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="text-sm text-zinc-400 hover:text-white"
          >
            {mobileNavOpen ? 'Close Menu' : activePanel.charAt(0).toUpperCase() + activePanel.slice(1).replace('-', ' ')}
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-bg-hover text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Left nav */}
        <div className={cn(
          'w-full lg:w-52 border-r border-border bg-bg-card p-3 space-y-4 overflow-y-auto flex-shrink-0',
          'lg:block',
          mobileNavOpen ? 'block' : 'hidden'
        )}>
          {/* Account section */}
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-3 mb-1.5">Account</div>
            {accountNavItems.map(navItemButton)}
          </div>

          {/* Workspace section with dropdown selector */}
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-3 mb-1.5">Workspace</div>

            {/* Workspace selector dropdown */}
            {workspaces.length > 0 ? (
              <div className="relative mb-1.5">
                <button
                  onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-bg-dark border border-border hover:border-zinc-500 transition-colors text-left"
                >
                  <Building2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="flex-1 truncate text-zinc-200">{workspaceName}</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-500 transition-transform', showWorkspaceDropdown && 'rotate-180')} />
                </button>

                {showWorkspaceDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowWorkspaceDropdown(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden max-h-40 overflow-y-auto">
                      {workspaces.map(ws => (
                        <button
                          key={ws.id}
                          onClick={() => { setSelectedWorkspaceId(ws.id); setShowWorkspaceDropdown(false) }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-bg-hover transition-colors',
                            ws.id === selectedWorkspaceId && 'bg-purple-500/10 text-white'
                          )}
                        >
                          <Building2 className="w-3.5 h-3.5 text-purple-400" />
                          <span className="truncate">{ws.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-zinc-500">No workspaces created</div>
            )}

            {workspaceNavItems.map(navItemButton)}
          </div>

          {/* Organization section */}
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-3 mb-1.5">Organization</div>
            {billingNavItems.map(navItemButton)}
          </div>
        </div>

        {/* Right content area */}
        <div className={cn(
          'flex-1 overflow-y-auto p-6',
          mobileNavOpen ? 'hidden lg:block' : 'block'
        )}>
          {/* Desktop close button */}
          <button
            onClick={onClose}
            className="hidden lg:flex absolute top-4 right-4 p-2 rounded-lg hover:bg-bg-hover text-zinc-400 hover:text-white transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {renderPanel()}
        </div>
      </div>
    </div>
  )
}
