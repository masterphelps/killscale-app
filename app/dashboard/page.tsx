'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()

  // Redirect to Launch as the default dashboard screen
  useEffect(() => {
    router.replace('/dashboard/launch')
  }, [router])

  // Show nothing while redirecting
  return null
}
