import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, confirmEmail } = await request.json()

    if (!userId || !confirmEmail) {
      return NextResponse.json(
        { error: 'User ID and confirmation email are required' },
        { status: 400 }
      )
    }

    // Verify the user exists and email matches
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId)

    if (userError || !user?.user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (user.user.email?.toLowerCase() !== confirmEmail.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email does not match' },
        { status: 400 }
      )
    }

    // Cancel Stripe subscription if exists
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (subscription?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id)
      } catch (stripeError: any) {
        console.error('Stripe cancellation error:', stripeError)
        // Continue with deletion even if Stripe cancellation fails
      }
    }

    // Delete the user from Supabase Auth
    // This will cascade delete all related data due to foreign key constraints
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('User deletion error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete account. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Account deletion error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete account' },
      { status: 500 }
    )
  }
}
