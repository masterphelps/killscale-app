import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  // Extract subdomain
  // In production: client.killscale.com → "client"
  // In dev: client.localhost:3001 → "client"
  const subdomain = hostname.split('.')[0]

  // Paths that should NOT be rewritten (work as-is on all subdomains)
  const skipRewritePaths = ['/api', '/_next', '/login', '/signup', '/auth', '/invite']
  const shouldSkipRewrite = skipRewritePaths.some(p => pathname.startsWith(p))

  // Handle client subdomain
  if (subdomain === 'client') {
    // Let auth and invite pages work normally (they exist at root)
    // Only rewrite other paths to /client/*
    if (!shouldSkipRewrite && !pathname.startsWith('/client')) {
      return NextResponse.rewrite(new URL(`/client${pathname}`, request.url))
    }
  }

  // Handle kiosk subdomain
  if (subdomain === 'kiosk') {
    // Kiosk uses PIN auth, no need for login pages
    // Rewrite kiosk.killscale.com/slug to /kiosk/slug
    if (!shouldSkipRewrite && !pathname.startsWith('/kiosk')) {
      return NextResponse.rewrite(new URL(`/kiosk${pathname}`, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
