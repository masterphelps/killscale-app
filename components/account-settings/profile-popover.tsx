'use client'

import { useEffect, useRef } from 'react'
import { Settings, EyeOff, Eye, HelpCircle, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProfilePopoverProps {
  isOpen: boolean
  onClose: () => void
  onOpenSettings: () => void
  isPrivacyMode: boolean
  onTogglePrivacy: () => void
  onSignOut: () => void
}

export function ProfilePopover({ isOpen, onClose, onOpenSettings, isPrivacyMode, onTogglePrivacy, onSignOut }: ProfilePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // Delay to avoid the click that opened the popover from immediately closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-2 bg-bg-card border border-border rounded-lg shadow-xl overflow-hidden z-30"
    >
      <button
        onClick={() => { onOpenSettings(); onClose() }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-bg-hover hover:text-white transition-colors"
      >
        <Settings className="w-4 h-4" />
        Account Settings
      </button>

      <button
        onClick={() => { onTogglePrivacy(); onClose() }}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
          isPrivacyMode
            ? 'text-purple-400 hover:bg-purple-500/10'
            : 'text-zinc-300 hover:bg-bg-hover hover:text-white'
        )}
      >
        {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        Privacy Mode {isPrivacyMode ? 'ON' : 'OFF'}
      </button>

      <a
        href="mailto:contactkillscale@gmail.com"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-bg-hover hover:text-white transition-colors"
        onClick={onClose}
      >
        <HelpCircle className="w-4 h-4" />
        Help
      </a>

      <div className="border-t border-border">
        <button
          onClick={() => { onSignOut(); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:bg-bg-hover hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
