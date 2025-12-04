import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// Lazy initialize Resend to avoid build-time errors
let resend: Resend | null = null
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Alert = {
  id: string
  type: string
  priority: 'high' | 'medium' | 'low'
  title: string
  message: string
  entity_type?: string
  entity_name?: string
  created_at: string
}

const PRIORITY_EMOJI: Record<string, string> = {
  high: '🚨',
  medium: '⚠️',
  low: '💡',
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#eab308',
  low: '#3b82f6',
}

function generateEmailHtml(alerts: Alert[], userName: string): string {
  const alertRows = alerts.map(alert => `
    <tr>
      <td style="padding: 16px; border-bottom: 1px solid #27272a;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 18px;">${PRIORITY_EMOJI[alert.priority]}</span>
          <span style="color: ${PRIORITY_COLOR[alert.priority]}; font-weight: 600; font-size: 14px; text-transform: uppercase;">
            ${alert.priority}
          </span>
        </div>
        <div style="font-weight: 600; color: #ffffff; margin-bottom: 4px;">${alert.title}</div>
        <div style="color: #a1a1aa; font-size: 14px;">${alert.message}</div>
        ${alert.entity_name ? `<div style="color: #71717a; font-size: 12px; margin-top: 8px;">${alert.entity_type}: ${alert.entity_name}</div>` : ''}
      </td>
    </tr>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #ffffff; font-size: 24px; margin: 0;">
            <span style="color: #ef4444;">Kill</span><span style="color: #10b981;">Scale</span>
          </h1>
          <p style="color: #71717a; font-size: 14px; margin-top: 8px;">Ad Performance Alerts</p>
        </div>

        <!-- Greeting -->
        <div style="color: #ffffff; margin-bottom: 24px;">
          <p style="margin: 0;">Hey ${userName},</p>
          <p style="color: #a1a1aa; margin-top: 8px;">You have ${alerts.length} new alert${alerts.length > 1 ? 's' : ''} that need your attention:</p>
        </div>

        <!-- Alerts Table -->
        <table style="width: 100%; background-color: #18181b; border-radius: 12px; border-collapse: collapse; overflow: hidden;">
          <tbody>
            ${alertRows}
          </tbody>
        </table>

        <!-- CTA Button -->
        <div style="text-align: center; margin-top: 32px;">
          <a href="https://app.killscale.com/dashboard/alerts"
             style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            View All Alerts
          </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid #27272a;">
          <p style="color: #71717a; font-size: 12px; margin: 0;">
            You're receiving this because you have alert notifications enabled.
          </p>
          <p style="color: #71717a; font-size: 12px; margin-top: 8px;">
            <a href="https://app.killscale.com/account" style="color: #3b82f6; text-decoration: none;">Manage notification settings</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

export async function POST(request: NextRequest) {
  try {
    const { userId, alerts } = await request.json()

    if (!userId || !alerts || alerts.length === 0) {
      return NextResponse.json({ error: 'Missing userId or alerts' }, { status: 400 })
    }

    // Get user's email and preferences
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)

    if (authError || !authUser?.user?.email) {
      console.error('Error fetching user:', authError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user has alert emails enabled
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('alert_emails_enabled')
      .eq('user_id', userId)
      .single()

    // Default to true if no preferences exist
    if (preferences && preferences.alert_emails_enabled === false) {
      return NextResponse.json({ message: 'Alert emails disabled for user', sent: false })
    }

    const userEmail = authUser.user.email
    const userName = authUser.user.user_metadata?.full_name || userEmail.split('@')[0]

    // Generate email content
    const htmlContent = generateEmailHtml(alerts, userName)

    // Determine subject based on alert priority
    const hasHighPriority = alerts.some((a: Alert) => a.priority === 'high')
    const subject = hasHighPriority
      ? `🚨 ${alerts.length} urgent alert${alerts.length > 1 ? 's' : ''} for your ads`
      : `${alerts.length} new alert${alerts.length > 1 ? 's' : ''} from KillScale`

    // Send email via Resend
    const { data, error } = await getResend().emails.send({
      from: 'KillScale <alerts@killscale.com>',
      to: userEmail,
      subject,
      html: htmlContent,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Email sent successfully',
      sent: true,
      emailId: data?.id
    })

  } catch (err) {
    console.error('Send email error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
