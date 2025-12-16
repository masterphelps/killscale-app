'use client'

type UtmIndicatorProps = {
  tracked: number    // Number of ads with UTM
  total: number      // Total number of ads
  loading?: boolean  // Show spinner while fetching
}

export function UtmIndicator({ tracked, total, loading }: UtmIndicatorProps) {
  // Loading: Spinning purple ring
  if (loading) {
    return (
      <div
        className="w-2.5 h-2.5 rounded-full border border-purple-500 animate-spin ml-1.5"
        style={{ borderTopColor: 'transparent' }}
      />
    )
  }

  if (total === 0) return null

  const isFull = tracked === total
  const isPartial = tracked > 0 && tracked < total
  const isNone = tracked === 0

  return (
    <div
      title={`${tracked} of ${total} ads tracked`}
      className="relative w-2.5 h-2.5 rounded-full overflow-hidden ml-1.5 flex-shrink-0"
    >
      {isFull ? (
        // Full purple circle
        <div className="w-full h-full bg-purple-500 rounded-full" />
      ) : isPartial ? (
        // Half-filled - left half purple, right half empty with border
        <>
          <div className="absolute left-0 top-0 w-1/2 h-full bg-purple-500" />
          <div className="absolute right-0 top-0 w-1/2 h-full border-y border-r border-purple-500 rounded-r-full" />
        </>
      ) : isNone ? (
        // Empty ring outline
        <div className="w-full h-full border border-purple-500 rounded-full" />
      ) : null}
    </div>
  )
}
