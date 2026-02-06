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
    <div className="bg-white rounded-2xl p-8 text-center shadow-sm" style={{ border: '1px solid #E4DFF0' }}>
      {status === 'loading' && (
        <>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#F0EDFA' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#7c3aed' }} />
          </div>
          <h1 className="text-3xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1A1A1A' }}>
            Confirming your email...
          </h1>
          <p style={{ color: '#6B7280' }}>Please wait a moment.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#ECFDF5' }}>
            <CheckCircle className="w-8 h-8" style={{ color: '#10b981' }} />
          </div>
          <h1 className="text-3xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1A1A1A' }}>
            Email Confirmed!
          </h1>
          <p className="mb-8 text-base" style={{ color: '#6B7280' }}>
            Your account is ready to go. Log in to start optimizing your Meta Ads.
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-3 text-white font-semibold rounded-lg transition-colors"
            style={{ background: '#7c3aed' }}
          >
            Log In →
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#FEF2F2' }}>
            <XCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
          </div>
          <h1 className="text-3xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1A1A1A' }}>
            Confirmation Failed
          </h1>
          <p className="mb-8 text-base" style={{ color: '#6B7280' }}>
            {errorMessage || 'The confirmation link may have expired. Please try signing up again.'}
          </p>
          <Link
            href="/signup"
            className="inline-block w-full py-3 text-white font-semibold rounded-lg transition-colors"
            style={{ background: '#7c3aed' }}
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
    <div className="bg-white rounded-2xl p-8 text-center shadow-sm" style={{ border: '1px solid #E4DFF0' }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#F0EDFA' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#7c3aed' }} />
      </div>
      <h1 className="text-3xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1A1A1A' }}>
        Loading...
      </h1>
      <p style={{ color: '#6B7280' }}>Please wait a moment.</p>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAF8FF', fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.png" alt="KillScale" className="h-12" />
          </Link>
        </div>

        <Suspense fallback={<LoadingState />}>
          <ConfirmContent />
        </Suspense>
      </div>
    </div>
  )
}
