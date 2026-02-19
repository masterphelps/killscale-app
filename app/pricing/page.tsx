'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'

const plans = [
  {
    name: 'Pro',
    featured: true,
    monthlyPrice: '$129',
    yearlyPrice: '$83',
    yearlyTotal: '$999',
    period: '/mo',
    description: '7-day free trial',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID,
    features: [
      '3 ad accounts',
      '50 AI image generations/mo',
      'Unlimited AI copy generation',
      'Unlimited AI reviews',
      'First-party pixel & attribution',
      'Campaign Launcher',
      'Meta Ad Library search',
      'Up to $100k tracked spend',
    ],
  },
]

const agencyPlan = {
  name: 'Agency',
  features: [
    '10+ ad accounts',
    'Custom AI generation limits',
    'Unlimited tracked spend',
    'Dedicated support + Slack',
    'White-label options',
  ],
}

export default function PricingPage() {
  const { user } = useAuth()
  const { plan: currentPlan } = useSubscription()
  const [loading, setLoading] = useState<string | null>(null)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')

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

  const isAuthenticated = !!user
  const hasExpiredTrial = isAuthenticated && currentPlan === 'None'
  const isTrialing = isAuthenticated && currentPlan !== 'None' &&
    (currentPlan === 'pro' || currentPlan === 'Pro')

  return (
    <div className="min-h-screen bg-bg-dark">
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo-white.png" alt="KillScale" className="h-9" />
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
          <h1 className="text-4xl font-bold mb-4">One plan. Everything you need.</h1>
          <p className="text-zinc-500 text-lg">
            {isAuthenticated ? 'Subscribe to unlock KillScale.' : '7-day free trial. No credit card required.'}
          </p>
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
              Save 35%
            </span>
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((plan) => {
            const isCurrentPlan = user && currentPlan === plan.name.toLowerCase()
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
                    className="w-full py-3 rounded-lg font-semibold transition-colors text-sm bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
                  >
                    {loading === plan.name ? 'Loading...' : isAuthenticated ? 'Subscribe to Pro' : 'Start 7-Day Free Trial'}
                  </button>
                ) : (
                  <Link
                    href={user ? '/dashboard' : '/signup'}
                    className="block w-full py-3 rounded-lg font-semibold text-center text-sm bg-accent hover:bg-accent-hover text-white transition-colors"
                  >
                    {isAuthenticated ? 'Subscribe to Pro' : 'Start 7-Day Free Trial'}
                  </Link>
                )}
              </div>
            )
          })}

          {/* Agency Card */}
          <div className="bg-bg-card border border-border rounded-2xl p-6 relative">
            <div className="mb-6">
              <div className="text-sm text-zinc-500 uppercase tracking-wide mb-1">
                {agencyPlan.name}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">Custom</span>
              </div>
              <p className="text-zinc-500 mt-2 text-sm">For agencies & teams</p>
            </div>

            <ul className="space-y-3 mb-6">
              {agencyPlan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-accent flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href="mailto:sales@killscale.com"
              className="block w-full py-3 rounded-lg font-semibold text-center text-sm bg-bg-dark border border-border hover:border-accent text-white transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>

        <div className="mt-12 text-center text-zinc-500 text-sm">
          <p>{isAuthenticated ? 'Cancel anytime. 7-day money-back guarantee.' : 'All plans include a 7-day money-back guarantee. Cancel anytime.'}</p>
        </div>
      </div>
    </div>
  )
}
