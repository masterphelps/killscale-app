'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Workspace settings have been moved to the Account Settings modal.
 * Redirect to dashboard to prevent orphaned page access.
 */
export default function WorkspaceSettingsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-zinc-400">Redirecting...</p>
        <p className="text-sm text-zinc-600 mt-2">
          Settings have moved to the account settings modal.
        </p>
      </div>
    </div>
  )
}
