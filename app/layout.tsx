import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { SubscriptionProvider } from '@/lib/subscription'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // Enables safe-area-inset for iOS notch/home bar
}

export const metadata: Metadata = {
  title: 'KillScale - Meta Ads Dashboard',
  description: 'See your Meta Ads at a glance. Know what to scale, watch, and cut in 30 seconds.',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
}

const META_PIXEL_ID = '1552580212607017'
const KILLSCALE_PIXEL_ID = 'KS-KIL-SACY'
const KILLSCALE_PIXEL_SECRET = '598881274081441ba8cb8656cbeb603e'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Meta Pixel Code */}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        {/* KillScale Pixel Code */}
        <Script id="killscale-pixel" strategy="afterInteractive">
          {`
            !function(k,s,p,i,x,e,l){if(k.ks)return;x=k.ks=function(){x.q.push(arguments)};
            x.q=[];e=s.createElement(p);l=s.getElementsByTagName(p)[0];
            e.async=1;e.src='https://pixel.killscale.com/ks.js';l.parentNode.insertBefore(e,l)
            }(window,document,'script');

            ks('init', 'KS-KIL-SACY', { secret: '598881274081441ba8cb8656cbeb603e' });
            ks('pageview');
          `}
        </Script>
      </head>
      <body className="antialiased">
        <AuthProvider>
          <SubscriptionProvider>
            {children}
          </SubscriptionProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
