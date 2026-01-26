'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase-browser'

function ConfirmContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const confirmEmail = async () => {
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (!tokenHash || !type) {
        // No token - user came here directly after already confirming
        setStatus('success')
        return
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email' | 'signup' | 'recovery' | 'invite',
        })

        if (error) {
          console.error('Verification error:', error)
          setErrorMessage(error.message)
          setStatus('error')
        } else {
          setStatus('success')
        }
      } catch (err) {
        console.error('Confirmation error:', err)
        setErrorMessage('Something went wrong. Please try again.')
        setStatus('error')
      }
    }

    confirmEmail()
  }, [searchParams])

  return (
    <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
      {status === 'loading' && (
        <>
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Confirming your email...</h1>
          <p className="text-zinc-500">Please wait a moment.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Email Confirmed!</h1>
          <p className="text-zinc-500 mb-8">
            Your account is ready to go. Log in to start optimizing your Meta Ads.
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
          >
            Log In →
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Confirmation Failed</h1>
          <p className="text-zinc-500 mb-8">
            {errorMessage || 'The confirmation link may have expired. Please try signing up again.'}
          </p>
          <Link
            href="/signup"
            className="inline-block w-full py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
          >
            Try Again
          </Link>
        </>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
      <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Loading...</h1>
      <p className="text-zinc-500">Please wait a moment.</p>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <svg width="200" height="45" viewBox="0 0 280 50">
              <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a"/>
              <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <text x="55" y="33" fill="white" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="24">KillScale</text>
            </svg>
          </Link>
        </div>

        <Suspense fallback={<LoadingState />}>
          <ConfirmContent />
        </Suspense>
      </div>
    </div>
  )
}
