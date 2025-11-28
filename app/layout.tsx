import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { SubscriptionProvider } from '@/lib/subscription'

export const metadata: Metadata = {
  title: 'KillScale - Meta Ads Dashboard',
  description: 'See your Meta Ads at a glance. Know what to scale, watch, and cut in 30 seconds.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <SubscriptionProvider>
            {children}
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
