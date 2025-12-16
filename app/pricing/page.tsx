'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'

const plans = [
  {
    name: 'Launch',
    monthlyPrice: '$29',
    yearlyPrice: '$24',
    yearlyTotal: '$290',
    period: '/mo',
    description: '7-day free trial',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_LAUNCH_PRICE_ID,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_LAUNCH_YEARLY_PRICE_ID,
    features: [
      'Meta API sync',
      'Unlimited campaigns',
      '1 ad account',
      'Campaign Launcher',
      'Insights & Trends',
      'Alerts',
    ],
  },
  {
    name: 'Scale',
    featured: true,
    monthlyPrice: '$49',
    yearlyPrice: '$41',
    yearlyTotal: '$490',
    period: '/mo',
    description: 'Most popular',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_SCALE_YEARLY_PRICE_ID,
    features: [
      'Everything in Launch',
      'First Party Pixel',
      'Dynamic Attribution',
      '2 ad accounts',
      'Workspaces',
      'Manual Events',
    ],
  },
  {
    name: 'Pro',
    monthlyPrice: '$99',
    yearlyPrice: '$82',
    yearlyTotal: '$990',
    period: '/mo',
    description: 'For agencies & teams',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID,
    features: [
      'Everything in Scale',
      'Unlimited ad accounts',
      'Workspace reporting portal',
      'Priority support',
    ],
  },
]

export default function PricingPage() {
  const { user } = useAuth()
  const { plan: currentPlan } = useSubscription()
  const [loading, setLoading] = useState<string | null>(null)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly')

  const handleCheckout = async (plan: typeof plans[0]) => {
    const priceId = billingPeriod === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId

    if (!priceId) return

    if (!user) {
      window.location.href = '/signup'
      return
    }

    setLoading(plan.name)

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
            <svg width="180" height="36" viewBox="0 0 280 50">
              <rect x="5" y="8" width="40" height="34" rx="8" fill="#1a1a1a"/>
              <path d="M15 18 L15 32 L10 27 M15 32 L20 27" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M30 32 L30 18 L25 23 M30 18 L35 23" stroke="#10b981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <text x="55" y="33" fill="white" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="24">KillScale</text>
            </svg>
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
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Simple, honest pricing</h1>
          <p className="text-zinc-500 text-lg">Try free for 7 days. Cancel anytime.</p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={`text-sm font-medium transition-colors ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-500'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingPeriod(p => p === 'monthly' ? 'yearly' : 'monthly')}
            className="relative w-14 h-7 bg-accent rounded-full transition-colors"
          >
            <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-200 ${
              billingPeriod === 'yearly' ? 'left-8' : 'left-1'
            }`} />
          </button>
          <span className={`text-sm font-medium transition-colors flex items-center gap-2 ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-500'}`}>
            Yearly
            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">
              2 months free
            </span>
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const isCurrentPlan = user && currentPlan === plan.name
            const displayPrice = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
            const showYearlyTotal = billingPeriod === 'yearly' && plan.yearlyTotal

            return (
              <div
                key={plan.name}
                className={`bg-bg-card border rounded-2xl p-6 relative ${
                  isCurrentPlan
                    ? 'border-green-500 bg-gradient-to-b from-green-500/10 to-bg-card'
                    : plan.featured
                      ? 'border-accent bg-gradient-to-b from-accent/10 to-bg-card'
                      : 'border-border'
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                    CURRENT PLAN
                  </div>
                )}

                {!isCurrentPlan && plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-white text-xs font-bold rounded-full">
                    POPULAR
                  </div>
                )}

                <div className="mb-6">
                  <div className="text-sm text-zinc-500 uppercase tracking-wide mb-1">
                    {plan.name}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{displayPrice}</span>
                    <span className="text-zinc-500">{plan.period}</span>
                  </div>
                  {showYearlyTotal && (
                    <p className="text-zinc-500 text-xs mt-1">billed {plan.yearlyTotal}/year</p>
                  )}
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

                {isCurrentPlan ? (
                  <div className="w-full py-3 rounded-lg font-semibold text-center text-sm bg-green-500/20 border border-green-500/50 text-green-400">
                    Current Plan
                  </div>
                ) : (billingPeriod === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId) ? (
                  <button
                    onClick={() => handleCheckout(plan)}
                    disabled={loading !== null}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors text-sm ${
                      plan.featured
                        ? 'bg-accent hover:bg-accent-hover text-white'
                        : 'bg-bg-dark border border-border hover:border-accent text-white'
                    } disabled:opacity-50`}
                  >
                    {loading === plan.name
                      ? 'Loading...'
                      : `Get ${plan.name}`}
                  </button>
                ) : (
                  <Link
                    href={user ? '/dashboard' : '/signup'}
                    className="block w-full py-3 rounded-lg font-semibold text-center text-sm bg-bg-dark border border-border hover:border-accent text-white transition-colors"
                  >
                    Start Free Trial
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-12 text-center text-zinc-500 text-sm">
          <p>All plans include a 7-day money-back guarantee. Cancel anytime.</p>
        </div>
      </div>
    </div>
  )
}
