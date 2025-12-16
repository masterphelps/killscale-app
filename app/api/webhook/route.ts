import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_TO_PLAN: Record<string, string> = {
  // Launch ($29/mo)
  'price_1Sf2JjLEX79epwdhXY0l5qJf': 'launch',   // monthly
  'price_1SbocjLEX79epwdhFZhRCOKb': 'launch',   // yearly
  // Scale ($49/mo)
  'price_1SYcIELEX79epwdhuRMs2lge': 'scale',    // monthly
  'price_1SbodCLEX79epwdhgYsuS0pz': 'scale',    // yearly
  // Pro ($99/mo)
  'price_1SYcIZLEX79epwdhlJu1JS0z': 'pro',      // monthly
  'price_1SbodULEX79epwdh3yvUhyC6': 'pro',      // yearly
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    
    const userId = session.metadata?.userId
    const customerId = session.customer as string
    const subscriptionId = session.subscription as string

    if (userId && subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
        const priceId = subscription.items.data[0].price.id
        const plan = PRICE_TO_PLAN[priceId] || 'launch'

        const periodEnd = subscription.current_period_end 
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null

        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: plan,
            status: subscription.status, // 'trialing' or 'active'
            current_period_end: periodEnd,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          })

        if (error) {
          console.error('Error saving subscription:', error)
        }
      } catch (err) {
        console.error('Error retrieving subscription:', err)
      }
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as any
    const priceId = subscription.items.data[0].price.id
    const plan = PRICE_TO_PLAN[priceId] || 'launch'

    const periodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null

    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan: plan,
        status: subscription.status,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id)

    if (error) {
      console.error('Error updating subscription:', error)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any

    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan: 'expired',
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id)

    if (error) {
      console.error('Error canceling subscription:', error)
    }
  }

  return NextResponse.json({ received: true })
}
