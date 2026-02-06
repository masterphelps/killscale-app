'use client'

import { useState } from 'react'
import { Provider } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  // Password complexity checks
  const hasMinLength = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!isPasswordValid) {
      setError('Password does not meet requirements')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    })

    if (error) {
      console.error('Signup error:', error)
      setError(error.message)
      setLoading(false)
    } else if (!data.user) {
      console.error('No user returned')
      setError('Signup failed - please try again')
      setLoading(false)
    } else {
      // Fire Meta Pixel CompleteRegistration event
      if (typeof window !== 'undefined' && (window as any).fbq) {
        (window as any).fbq('track', 'CompleteRegistration')
      }
      // Fire KillScale Pixel CompleteRegistration event
      if (typeof window !== 'undefined' && (window as any).ks) {
        (window as any).ks('completeRegistration')
      }
      setSuccess(true)
    }
  }

  const handleOAuthSignIn = async (provider: Provider) => {
    setOauthLoading(provider)
    setError('')

    // Fire Meta Pixel event before OAuth redirect
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'CompleteRegistration')
    }
    // Fire KillScale Pixel event before OAuth redirect
    if (typeof window !== 'undefined' && (window as any).ks) {
      (window as any).ks('completeRegistration')
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) {
      setError(error.message)
      setOauthLoading(null)
    }
  }

  const inputStyle = { background: '#FAF8FF', border: '1px solid #E4DFF0', color: '#1A1A1A' }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAF8FF', fontFamily: 'Inter, sans-serif' }}>
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl p-8 shadow-sm" style={{ border: '1px solid #E4DFF0' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#F0EDFA' }}>
              <span className="text-3xl">✉️</span>
            </div>
            <h1 className="text-3xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1A1A1A' }}>
              Check your email
            </h1>
            <p className="mb-6 text-base" style={{ color: '#6B7280' }}>
              We sent a confirmation link to {email}
            </p>
            <Link href="/login" className="font-medium hover:underline" style={{ color: '#7c3aed' }}>
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAF8FF', fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.png" alt="KillScale" className="h-12" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-sm" style={{ border: '1px solid #E4DFF0' }}>
          <h1 className="text-3xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1A1A1A' }}>
            Create an account
          </h1>
          <p className="mb-6 text-base" style={{ color: '#6B7280' }}>Start optimizing your Meta Ads</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm transition-colors focus:outline-none"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.target.style.borderColor = '#E4DFF0'}
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm transition-colors focus:outline-none"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.target.style.borderColor = '#E4DFF0'}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm transition-colors focus:outline-none"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.target.style.borderColor = '#E4DFF0'}
                placeholder="••••••••"
                required
              />
              {password.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  <div style={{ color: hasMinLength ? '#10b981' : '#9CA3AF' }}>
                    {hasMinLength ? '✓' : '○'} At least 8 characters
                  </div>
                  <div style={{ color: hasUppercase ? '#10b981' : '#9CA3AF' }}>
                    {hasUppercase ? '✓' : '○'} One uppercase letter
                  </div>
                  <div style={{ color: hasLowercase ? '#10b981' : '#9CA3AF' }}>
                    {hasLowercase ? '✓' : '○'} One lowercase letter
                  </div>
                  <div style={{ color: hasNumber ? '#10b981' : '#9CA3AF' }}>
                    {hasNumber ? '✓' : '○'} One number
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm transition-colors focus:outline-none"
                style={{
                  ...inputStyle,
                  borderColor: confirmPassword.length > 0 && !passwordsMatch ? '#ef4444' : '#E4DFF0'
                }}
                onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                onBlur={(e) => e.target.style.borderColor = confirmPassword.length > 0 && !passwordsMatch ? '#ef4444' : '#E4DFF0'}
                placeholder="••••••••"
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <div className="mt-1 text-xs" style={{ color: '#DC2626' }}>Passwords do not match</div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              style={{ background: '#7c3aed' }}
              onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = '#6d28d9' }}
              onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = '#7c3aed'}
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          {/* OAuth Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px" style={{ background: '#E4DFF0' }}></div>
            <span className="text-sm" style={{ color: '#9CA3AF' }}>or continue with</span>
            <div className="flex-1 h-px" style={{ background: '#E4DFF0' }}></div>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={oauthLoading !== null}
              className="w-full py-3 font-medium rounded-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              style={{ background: '#FFFFFF', border: '1px solid #E4DFF0', color: '#1A1A1A' }}
              onMouseEnter={(e) => (e.target as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'}
              onMouseLeave={(e) => (e.target as HTMLButtonElement).style.boxShadow = 'none'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {oauthLoading === 'google' ? 'Connecting...' : 'Continue with Google'}
            </button>

            <button
              onClick={() => handleOAuthSignIn('facebook')}
              disabled={oauthLoading !== null}
              className="w-full py-3 bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              {oauthLoading === 'facebook' ? 'Connecting...' : 'Continue with Facebook'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm" style={{ color: '#6B7280' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-medium hover:underline" style={{ color: '#7c3aed' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
