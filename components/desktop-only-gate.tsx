'use client'

import { Monitor } from 'lucide-react'

export function DesktopOnlyGate({ children, feature }: { children: React.ReactNode; feature?: string }) {
  return (
    <>
      {/* Mobile: show message */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center lg:hidden">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/15 flex items-center justify-center mb-4">
          <Monitor className="w-7 h-7 text-purple-400" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Desktop recommended</h2>
        <p className="text-sm text-zinc-400 max-w-xs">
          {feature || 'This feature'} doesn&apos;t work well on mobile. Please use a desktop browser for the best experience.
        </p>
      </div>
      {/* Desktop: show content */}
      <div className="hidden lg:contents">
        {children}
      </div>
    </>
  )
}
