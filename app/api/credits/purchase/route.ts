import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Credit pack pricing
const CREDIT_PACKS: Record<string, { credits: number; amountCents: number; label: string }> = {
  'pack_100': { credits: 100, amountCents: 2000, label: '100 Credits' },
  'pack_250': { credits: 250, amountCents: 5000, label: '250 Credits' },
  'pack_500': { credits: 500, amountCents: 10000, label: '500 Credits' },
  'pack_1000': { credits: 1000, amountCents: 20000, label: '1000 Credits' },
}

export async function POST(request: NextRequest) {
  try {
    const { userId, packId } = await request.json()

    if (!userId || !packId) {
      return NextResponse.json({ error: 'userId and packId required' }, { status: 400 })
    }

    const pack = CREDIT_PACKS[packId]
    if (!pack) {
      return NextResponse.json({ error: 'Invalid pack ID' }, { status: 400 })
    }

    // Get the user's Stripe customer ID (or create one)
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    let customerId = sub?.stripe_customer_id

    if (!customerId) {
      // Get user email for Stripe customer creation
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()

      const customer = await stripe.customers.create({
        metadata: { userId },
        ...(profile?.email ? { email: profile.email } : {}),
      })
      customerId = customer.id
    }

    // Create Stripe Checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `KillScale AI Credits — ${pack.label}`,
              description: `${pack.credits} AI generation credits for image and video creation`,
            },
            unit_amount: pack.amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'credit_pack',
        credits: String(pack.credits),
        userId,
        packId,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/dashboard/settings?credits=purchased`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.killscale.com'}/dashboard/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[Credit Purchase] Error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
