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

  if (success) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-bg-card border border-border rounded-xl p-8">
            <div className="text-3xl mb-4">✉️</div>
            <h1 className="text-2xl font-bold mb-2">Check your email</h1>
            <p className="text-zinc-500 mb-6">
              We sent a confirmation link to {email}
            </p>
            <Link href="/login" className="text-accent hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

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

        <div className="bg-bg-card border border-border rounded-xl p-8">
          <h1 className="text-2xl font-bold mb-2">Create an account</h1>
          <p className="text-zinc-500 mb-6">Start optimizing your Meta Ads</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-accent"
                placeholder="••••••••"
                required
              />
              {password.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  <div className={hasMinLength ? 'text-green-500' : 'text-zinc-500'}>
                    {hasMinLength ? '✓' : '○'} At least 8 characters
                  </div>
                  <div className={hasUppercase ? 'text-green-500' : 'text-zinc-500'}>
                    {hasUppercase ? '✓' : '○'} One uppercase letter
                  </div>
                  <div className={hasLowercase ? 'text-green-500' : 'text-zinc-500'}>
                    {hasLowercase ? '✓' : '○'} One lowercase letter
                  </div>
                  <div className={hasNumber ? 'text-green-500' : 'text-zinc-500'}>
                    {hasNumber ? '✓' : '○'} One number
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-3 bg-bg-dark border rounded-lg text-white focus:outline-none focus:border-accent ${
                  confirmPassword.length > 0 && !passwordsMatch ? 'border-red-500' : 'border-border'
                }`}
                placeholder="••••••••"
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <div className="mt-1 text-xs text-red-400">Passwords do not match</div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          {/* OAuth Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-zinc-500 text-sm">or continue with</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={oauthLoading !== null}
              className="w-full py-3 bg-white hover:bg-zinc-100 disabled:opacity-50 text-zinc-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
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

          <p className="mt-6 text-center text-zinc-500 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
