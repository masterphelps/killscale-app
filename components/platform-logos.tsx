'use client'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32
}

// Meta (Facebook) Logo - Blue circle with white 'f'
export function MetaLogo({ size = 'sm', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        d="M16.5 12.25h-2.75v8.25h-3.5v-8.25H8V9h2.25V7.13c0-2.25 1.13-3.63 3.5-3.63h2.75v3.25h-1.88c-.62 0-1.12.38-1.12 1.12V9h3l-.5 3.25z"
        fill="white"
      />
    </svg>
  )
}

// Google Ads Logo - Triangle icon
export function GoogleLogo({ size = 'sm', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={className}>
      {/* Yellow segment */}
      <path
        d="M3.29 16.76L10.62 4.5a2.78 2.78 0 014.76 0l7.33 12.26a2.78 2.78 0 01-2.38 4.24H5.67a2.78 2.78 0 01-2.38-4.24z"
        fill="#FBBC04"
      />
      {/* Blue segment */}
      <path
        d="M12 8.5l7.33 12.26a2.78 2.78 0 01-2.38 4.24H12V8.5z"
        fill="#4285F4"
      />
      {/* Green segment */}
      <path
        d="M5.67 21a2.78 2.78 0 01-2.38-4.24L10.62 4.5a2.78 2.78 0 012.38-1.5v17H5.67z"
        fill="#34A853"
      />
      {/* Center circle */}
      <circle cx="12" cy="17" r="2.5" fill="white" />
    </svg>
  )
}

// Shopify Logo - Green shopping bag
export function ShopifyLogo({ size = 'sm', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={className}>
      <path
        d="M15.34 3.33c-.08-.03-.11-.06-.15-.11-.56-1.2-1.27-1.68-2.21-1.68-.05 0-.1 0-.15.01-.03-.03-.05-.06-.08-.09C12.23.92 11.58.62 10.82.62c-1.48.02-2.95 1.11-4.14 3.08-1.24 2.07-1.78 4.67-1.57 5.94.03.17.14.32.3.38l9.37 3.55c.23.08.48-.05.55-.28.45-1.54.69-2.63.75-3.34-.09-1.19-.41-3.94-1.35-6.06l-.39.44zM11.04 2.37c.42-.04.81.13 1.15.5-.38.19-.76.48-1.13.87-.55.58-1.13 1.47-1.58 2.62-.56.21-1.11.41-1.63.6.46-2.05 1.75-4.5 3.19-4.59zm-.2 4.88c.36-.13.72-.27 1.08-.4.22-.08.44-.17.66-.25-.13.52-.23 1.05-.31 1.57-.46.17-.92.35-1.43.54v-1.46zm1.86 1.31c.73 2.08.8 3.83.74 4.82l-4.85-1.83c.3-1.22.81-2.52 1.45-3.56l2.66.57z"
        fill="#95BF47"
      />
      <path
        d="M15.49 3.22c-.03.01-.07.03-.11.04l-.04.01v.06c.08.13.15.27.21.43.94 2.12 1.26 4.87 1.35 6.06-.06.71-.3 1.8-.75 3.34-.07.23.08.48.31.56l3.72 1.41c.22.08.47-.04.55-.27.5-1.47.98-3.8.48-6.29-.58-2.85-2.56-5.12-5.47-5.41-.08 0-.16.03-.25.06z"
        fill="#5E8E3E"
      />
      <path
        d="M9.77 23.38l5.12-1.28s-2.2-14.95-2.22-15.06c-.02-.11-.1-.19-.21-.2-.11-.01-2.23-.17-2.23-.17s-1.48-1.44-1.64-1.59c-.1-.1-.21-.13-.32-.13l.5 18.43z"
        fill="#95BF47"
      />
      <path
        d="M12.43 6.85l-1.05 3.1s-.93-.49-2.05-.41c-1.63.11-1.65 1.13-1.64 1.38.09 1.43 3.85 1.75 4.06 5.12.17 2.65-1.4 4.46-3.66 4.6-2.71.18-4.21-1.43-4.21-1.43l.57-2.45s1.5 1.13 2.7 1.05c.79-.05 1.07-.69 1.04-1.15-.11-1.87-3.18-1.76-3.37-4.84-.16-2.59 1.54-5.22 5.29-5.46 1.45-.1 2.32.28 2.32.49z"
        fill="#fff"
      />
    </svg>
  )
}

// TikTok Logo - Black circle with logo
export function TikTokLogo({ size = 'sm', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="12" fill="#000000" />
      <path
        d="M16.5 8.13V10.38c-1.13 0-2.17-.33-3.05-.9v4.19c0 2.09-1.7 3.79-3.79 3.79-1.56 0-2.9-.95-3.48-2.3.46.29 1.01.46 1.59.46 1.66 0 3-1.35 3-3.01v-6.8h2.25c.05.75.35 1.43.82 1.95.56.62 1.37.99 2.26.99.13 0 .27-.01.4-.03v-.6z"
        fill="#25F4EE"
      />
      <path
        d="M17.1 7.53V8.13c-.13.02-.27.03-.4.03-.89 0-1.7-.37-2.26-.99-.47-.52-.77-1.2-.82-1.95h-.9v7.12c0 1.32-1.07 2.39-2.38 2.39-.44 0-.85-.12-1.21-.33.5.57 1.23.93 2.04.93 1.32 0 2.38-1.07 2.38-2.39v-6.8h1.65v1.39c.6.35 1.27.58 1.98.64.06 0 .12.01.18.01.11 0 .21 0 .32-.02.14-.01.28-.04.42-.07v.44z"
        fill="#FE2C55"
      />
      <path
        d="M9.13 10.94c-.72.05-1.38.33-1.91.77-.7.57-1.14 1.43-1.14 2.39 0 .6.17 1.16.47 1.64.58.91 1.61 1.52 2.77 1.52.46 0 .9-.1 1.3-.27-.81-.5-1.35-1.4-1.35-2.43 0-.99.51-1.87 1.28-2.38-.42-.76-1.17-1.23-2.01-1.24h.59z"
        fill="white"
      />
    </svg>
  )
}

// KillScale Pixel Logo - Purple bolt
export function KillScaleLogo({ size = 'sm', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="12" fill="#8B5CF6" />
      <path
        d="M13.5 4L8 13h4l-1.5 7L17 11h-4l1.5-7z"
        fill="white"
      />
    </svg>
  )
}

// Platform badge with value - for use in stat card breakdowns
interface PlatformBadgeProps {
  platform: 'meta' | 'google' | 'shopify' | 'tiktok' | 'killscale'
  value: string
  percentage?: number
  size?: 'sm' | 'md'
}

export function PlatformBadge({ platform, value, percentage, size = 'sm' }: PlatformBadgeProps) {
  const Logo = {
    meta: MetaLogo,
    google: GoogleLogo,
    shopify: ShopifyLogo,
    tiktok: TikTokLogo,
    killscale: KillScaleLogo
  }[platform]

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <Logo size={size} />
        <span className="text-sm font-mono text-zinc-300">{value}</span>
      </div>
      {percentage !== undefined && (
        <span className="text-xs text-zinc-500">{percentage}%</span>
      )}
    </div>
  )
}

// Platform breakdown row - horizontal layout of platform badges
interface PlatformBreakdownProps {
  items: Array<{
    platform: 'meta' | 'google' | 'shopify' | 'tiktok' | 'killscale'
    value: string
    percentage?: number
  }>
}

export function PlatformBreakdown({ items }: PlatformBreakdownProps) {
  return (
    <div className="flex items-center justify-center gap-4 pt-2 border-t border-zinc-700/50">
      {items.map((item, i) => (
        <PlatformBadge key={i} {...item} />
      ))}
    </div>
  )
}
