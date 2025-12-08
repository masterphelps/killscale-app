import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

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

        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
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
        </div>
      </div>
    </div>
  )
}
