'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// This page is deprecated — connections are managed in Settings > Connections
export default function ConnectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return null
}
