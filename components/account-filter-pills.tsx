'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdAccount } from '@/lib/account'

interface AccountFilterPillsProps {
  accounts: AdAccount[]
  workspaceAccountIds: string[]
  filterAccountId: string | null
  onFilterChange: (accountId: string | null) => void
  compact?: boolean
}

export function AccountFilterPills({
  accounts,
  workspaceAccountIds,
  filterAccountId,
  onFilterChange,
  compact = false,
}: AccountFilterPillsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Only show if workspace has 2+ accounts
  if (workspaceAccountIds.length < 2) return null

  // Filter to only show accounts in the workspace
  const workspaceAccounts = accounts.filter(a => workspaceAccountIds.includes(a.id))
  if (workspaceAccounts.length < 2) return null

  // Resolve the currently selected account
  const selectedAccount = filterAccountId
    ? workspaceAccounts.find(a => a.id === filterAccountId) || null
    : null

  const getButtonLabel = () => {
    if (!selectedAccount) return `All Accounts (${workspaceAccounts.length})`
    if (compact) return selectedAccount.name
    return selectedAccount.name
  }

  const getButtonIcon = () => {
    if (!selectedAccount) {
      return (
        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-zinc-700 text-zinc-300">
          {workspaceAccounts.length}
        </span>
      )
    }
    const isMeta = selectedAccount.platform === 'meta'
    return (
      <span className={cn(
        'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white',
        isMeta ? 'bg-[#0866FF]' : 'bg-[#EA4335]'
      )}>
        {isMeta ? 'M' : 'G'}
      </span>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 bg-bg-card border rounded-lg text-sm transition-all',
          isOpen
            ? 'border-accent text-white'
            : selectedAccount
              ? 'border-border text-zinc-300 hover:border-zinc-600'
              : 'border-border text-zinc-300 hover:border-zinc-600'
        )}
      >
        {getButtonIcon()}
        <span className={cn(
          'truncate',
          compact ? 'max-w-[100px]' : 'max-w-[160px]'
        )}>
          {getButtonLabel()}
        </span>
        <ChevronDown className={cn(
          'w-3.5 h-3.5 text-zinc-500 transition-transform flex-shrink-0',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className={cn(
            'absolute top-full mt-1.5 bg-bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden min-w-[220px]',
            compact ? 'right-0' : 'left-0'
          )}
            style={{ animation: 'fadeIn 0.15s ease' }}
          >
            {/* All accounts option */}
            <button
              onClick={() => { onFilterChange(null); setIsOpen(false) }}
              className={cn(
                'w-full px-3 py-2.5 text-left text-sm flex items-center justify-between hover:bg-bg-hover transition-colors',
                !filterAccountId && 'bg-white/[0.04]'
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-zinc-700 text-zinc-300">
                  {workspaceAccounts.length}
                </span>
                <span className="text-zinc-200">All Accounts</span>
              </span>
              {!filterAccountId && (
                <Check className="w-4 h-4 text-accent flex-shrink-0" />
              )}
            </button>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Account list */}
            <div className="max-h-[280px] overflow-y-auto">
              {workspaceAccounts.map((account) => {
                const isSelected = filterAccountId === account.id
                const isMeta = account.platform === 'meta'

                return (
                  <button
                    key={account.id}
                    onClick={() => { onFilterChange(isSelected ? null : account.id); setIsOpen(false) }}
                    className={cn(
                      'w-full px-3 py-2.5 text-left text-sm flex items-center justify-between hover:bg-bg-hover transition-colors',
                      isSelected && (isMeta ? 'bg-[#0866FF]/[0.06]' : 'bg-[#EA4335]/[0.06]')
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={cn(
                        'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                        isSelected
                          ? isMeta ? 'bg-[#0866FF] text-white' : 'bg-[#EA4335] text-white'
                          : isMeta ? 'bg-[#0866FF]/20 text-[#0866FF]' : 'bg-[#EA4335]/20 text-[#EA4335]'
                      )}>
                        {isMeta ? 'M' : 'G'}
                      </span>
                      <span className={cn(
                        'truncate',
                        isSelected ? 'text-white' : 'text-zinc-400'
                      )}>
                        {account.name}
                      </span>
                    </span>
                    {isSelected && (
                      <Check className={cn(
                        'w-4 h-4 flex-shrink-0',
                        isMeta ? 'text-[#0866FF]' : 'text-[#EA4335]'
                      )} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
