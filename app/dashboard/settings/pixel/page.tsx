'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Pixel settings have been moved into the Workspaces page.
 * This page redirects to /dashboard/settings/workspaces.
 */
export default function PixelRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/settings/workspaces')
  }, [router])

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-zinc-400">Redirecting to Workspaces...</p>
        <p className="text-sm text-zinc-600 mt-2">
          Pixel settings are now configured per workspace.
        </p>
      </div>
    </div>
  )
}
