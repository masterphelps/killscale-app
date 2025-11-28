'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'Try it out',
    priceId: null,
    features: [
      'CSV upload',
      '5 campaigns max',
      'Full hierarchy view',
      'Custom thresholds',
    ],
  },
  {
    name: 'Starter',
    featured: true,
    price: '$9',
    period: '/mo',
    description: 'For growing advertisers',
    priceId: 'price_1SYQDFLvvY2iVbuY0njXKK4c',
    features: [
      'CSV upload',
      'Unlimited campaigns',
      'Full hierarchy view',
      'Custom thresholds',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'For serious advertisers',
    priceId: 'price_1SYOWOLvvY2iVbuYa0ovAR0G',
    features: [
      'Meta API connection',
      '5 ad accounts',
      'Daily auto-refresh',
      'Date range comparisons',
      'Email alerts',
    ],
    comingSoon: true,
  },
  {
    name: 'Agency',
    price: '$99',
    period: '/mo',
    description: 'For teams & clients',
    priceId: 'price_1SYOWlLvvY2iVbuYgxcY88pk',
    features: [
      'Meta API connection',
      'Unlimited ad accounts',
      'Hourly refresh',
      'White-label reports',
      'Team access',
    ],
    comingSoon: true,
  },
]

export default function PricingPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState<string | null>(null)

  const handleCheckout = async (priceId: string, planName: string) => {
    if (!user) {
      window.location.href = '/signup'
      return
    }

    setLoading(planName)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          userId: user.id,
          userEmail: user.email,
        }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg-dark">
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-lg flex items-center justify-center text-lg">
              ⚖️
            </div>
            <span className="font-mono font-bold text-lg">KillScale</span>
          </Link>
          {user ? (
            <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">
              ← Back to Dashboard
            </Link>
          ) : (
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white">
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, honest pricing</h1>
          <p className="text-zinc-500 text-lg">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-bg-card border rounded-2xl p-6 relative ${
                plan.featured 
                  ? 'border-accent bg-gradient-to-b from-accent/10 to-bg-card' 
                  : 'border-border'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-white text-xs font-bold rounded-full">
                  POPULAR
                </div>
              )}
              
              {plan.comingSoon && (
                <div className="absolute top-4 right-4 px-2 py-1 bg-zinc-700 text-zinc-300 text-xs font-medium rounded">
                  COMING SOON
                </div>
              )}

              <div className="mb-6">
                <div className="text-sm text-zinc-500 uppercase tracking-wide mb-1">
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-zinc-500">{plan.period}</span>
                </div>
                <p className="text-zinc-500 mt-2 text-sm">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-accent flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.priceId ? (
                <button
                  onClick={() => !plan.comingSoon && handleCheckout(plan.priceId!, plan.name)}
                  disabled={loading !== null || plan.comingSoon}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors text-sm ${
                    plan.comingSoon
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : plan.featured
                        ? 'bg-accent hover:bg-accent-hover text-white'
                        : 'bg-bg-dark border border-border hover:border-accent text-white'
                  } disabled:opacity-50`}
                >
                  {plan.comingSoon 
                    ? 'Coming Soon' 
                    : loading === plan.name 
                      ? 'Loading...' 
                      : `Get ${plan.name}`}
                </button>
              ) : (
                <Link
                  href={user ? '/dashboard' : '/signup'}
                  className="block w-full py-3 rounded-lg font-semibold text-center text-sm bg-bg-dark border border-border hover:border-accent text-white transition-colors"
                >
                  {user ? 'Current Plan' : 'Get Started'}
                </Link>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-12 text-center text-zinc-500 text-sm">
          <p>All plans include a 7-day money-back guarantee. Cancel anytime.</p>
        </div>
      </div>
    </div>
  )
}
