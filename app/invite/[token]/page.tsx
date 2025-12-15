'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, UserPlus, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface InviteDetails {
  email: string
  role: string
  workspaceName: string
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const { user, loading: authLoading } = useAuth()

  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Validate invite on load
  useEffect(() => {
    if (token) {
      validateInvite()
    }
  }, [token])

  const validateInvite = async () => {
    try {
      const res = await fetch(`/api/workspace/invite/accept?token=${token}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid invite')
        return
      }

      setInvite(data.invite)
    } catch (err) {
      setError('Failed to validate invite')
    } finally {
      setLoading(false)
    }
  }

  const acceptInvite = async () => {
    if (!user?.id) {
      // Redirect to login with invite token
      router.push(`/login?invite=${token}`)
      return
    }

    setAccepting(true)
    setError(null)

    try {
      const res = await fetch('/api/workspace/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userId: user.id })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to accept invite')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/client')
      }, 2000)

    } catch (err) {
      setError('Failed to accept invite')
    } finally {
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Invite</h1>
          <p className="text-zinc-400 mb-6">{error}</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome!</h1>
          <p className="text-zinc-400 mb-4">
            You've joined {invite?.workspaceName}. Redirecting to your dashboard...
          </p>
          <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <UserPlus className="w-8 h-8 text-accent" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">You're Invited!</h1>
        <p className="text-zinc-400 mb-6">
          You've been invited to join <span className="text-white font-medium">{invite?.workspaceName}</span> as a {invite?.role}.
        </p>

        <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Email</span>
            <span className="text-white">{invite?.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-zinc-500">Role</span>
            <span className="text-white capitalize">{invite?.role}</span>
          </div>
        </div>

        {user ? (
          <>
            {user.email?.toLowerCase() !== invite?.email.toLowerCase() && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                You're logged in as {user.email}. This invite is for {invite?.email}.
              </div>
            )}

            <button
              onClick={acceptInvite}
              disabled={accepting}
              className="w-full py-4 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-bold transition-colors"
            >
              {accepting ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Accept Invite'
              )}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/signup?invite=${token}&email=${encodeURIComponent(invite?.email || '')}`}
              className="block w-full py-4 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold transition-colors"
            >
              Create Account
            </Link>
            <Link
              href={`/login?invite=${token}&email=${encodeURIComponent(invite?.email || '')}`}
              className="block w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
