'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from './auth'
import { useAccount } from './account'
import { AttributionModel } from './attribution-models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type AttributionSource = 'meta' | 'killscale'

type PixelConfig = {
  pixel_id: string
  attribution_source: AttributionSource
  attribution_window: number
  attribution_model?: AttributionModel
  time_decay_half_life?: number
}

// Attribution data keyed by ad_id (utm_content from pixel events)
export type AttributionData = Record<string, {
  conversions: number
  revenue: number
}>

type AttributionContextType = {
  // Current state
  source: AttributionSource
  pixelId: string | null
  pixelConfig: PixelConfig | null
  attributionModel: AttributionModel
  // Legacy - for backwards compatibility (same as multiTouchAttribution)
  attributionData: AttributionData
  // Hybrid attribution: different data for different hierarchy levels
  lastTouchAttribution: AttributionData  // Whole numbers - for campaigns/adsets
  multiTouchAttribution: AttributionData // Fractional - for ads
  loading: boolean

  // Computed - TRUE means entire app uses KillScale pixel data (no Meta fallback)
  isKillScaleActive: boolean
  // TRUE when using a multi-touch model (linear, time_decay, position_based)
  isMultiTouchModel: boolean

  // Actions
  setSource: (source: AttributionSource) => Promise<void>
  refreshAttribution: (dateStart: string, dateEnd: string) => Promise<void>
}

const AttributionContext = createContext<AttributionContextType>({
  source: 'meta',
  pixelId: null,
  pixelConfig: null,
  attributionModel: 'last_touch',
  attributionData: {},
  lastTouchAttribution: {},
  multiTouchAttribution: {},
  loading: true,
  isKillScaleActive: false,
  isMultiTouchModel: false,
  setSource: async () => {},
  refreshAttribution: async () => {},
})

export function AttributionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()

  const [pixelConfig, setPixelConfig] = useState<PixelConfig | null>(null)
  const [attributionData, setAttributionData] = useState<AttributionData>({})
  const [lastTouchAttribution, setLastTouchAttribution] = useState<AttributionData>({})
  const [multiTouchAttribution, setMultiTouchAttribution] = useState<AttributionData>({})
  const [attributionModel, setAttributionModel] = useState<AttributionModel>('last_touch')
  const [loading, setLoading] = useState(true)

  const userId = user?.id

  // Load pixel config when account changes
  useEffect(() => {
    if (!userId || !currentAccountId) {
      setPixelConfig(null)
      setAttributionData({})
      setLastTouchAttribution({})
      setMultiTouchAttribution({})
      setAttributionModel('last_touch')
      setLoading(false)
      return
    }

    const loadPixelConfig = async () => {
      setLoading(true)
      try {
        const { data: pixels, error } = await supabase
          .from('pixels')
          .select('pixel_id, attribution_source, attribution_window')
          .eq('meta_account_id', currentAccountId)
          .eq('user_id', userId)
          .limit(1)

        if (error) {
          console.error('Failed to load pixel config:', error)
          setPixelConfig(null)
        } else if (pixels && pixels.length > 0) {
          setPixelConfig(pixels[0] as PixelConfig)
        } else {
          setPixelConfig(null)
        }
      } catch (err) {
        console.error('Error loading pixel config:', err)
        setPixelConfig(null)
      } finally {
        setLoading(false)
      }
    }

    loadPixelConfig()
  }, [userId, currentAccountId])

  // Refresh attribution data from KillScale pixel
  const refreshAttribution = useCallback(async (dateStart: string, dateEnd: string) => {
    console.log('[Attribution] refreshAttribution called:', {
      pixelId: pixelConfig?.pixel_id,
      userId,
      source: pixelConfig?.attribution_source,
      dateStart,
      dateEnd
    })

    if (!pixelConfig?.pixel_id || !userId) {
      console.log('[Attribution] Skipping - no pixelId or userId')
      setAttributionData({})
      setLastTouchAttribution({})
      setMultiTouchAttribution({})
      return
    }

    // Only fetch if KillScale attribution is active
    if (pixelConfig.attribution_source !== 'killscale') {
      console.log('[Attribution] Skipping - source is not killscale:', pixelConfig.attribution_source)
      setAttributionData({})
      setLastTouchAttribution({})
      setMultiTouchAttribution({})
      return
    }

    try {
      const url = `/api/pixel/attribution?pixelId=${pixelConfig.pixel_id}&userId=${userId}&dateStart=${dateStart}&dateEnd=${dateEnd}`
      console.log('[Attribution] Fetching:', url)
      const res = await fetch(url)
      const data = await res.json()
      console.log('[Attribution] API Response:', data)

      if (data.attribution) {
        console.log('[Attribution] Loaded KillScale data:', {
          totalEvents: data.totalEvents,
          uniqueAds: data.uniqueAds,
          model: data.model,
          adIds: Object.keys(data.attribution),
          sampleData: Object.entries(data.attribution).slice(0, 3)
        })
        // Legacy field for backwards compatibility
        setAttributionData(data.attribution)
        // Hybrid attribution fields
        setLastTouchAttribution(data.lastTouchAttribution || data.attribution)
        setMultiTouchAttribution(data.multiTouchAttribution || data.attribution)
        setAttributionModel(data.model || 'last_touch')
      } else {
        console.log('[Attribution] No attribution data in response')
        setAttributionData({})
        setLastTouchAttribution({})
        setMultiTouchAttribution({})
        setAttributionModel('last_touch')
      }
    } catch (err) {
      console.error('Failed to load KillScale attribution:', err)
      setAttributionData({})
      setLastTouchAttribution({})
      setMultiTouchAttribution({})
    }
  }, [pixelConfig?.pixel_id, pixelConfig?.attribution_source, userId])

  // Set attribution source (toggle between Meta and KillScale)
  const setSource = useCallback(async (source: AttributionSource) => {
    if (!userId || !currentAccountId || !pixelConfig?.pixel_id) return

    try {
      const { error } = await supabase
        .from('pixels')
        .update({ attribution_source: source })
        .eq('pixel_id', pixelConfig.pixel_id)
        .eq('user_id', userId)

      if (error) {
        console.error('Failed to update attribution source:', error)
        return
      }

      // Update local state
      setPixelConfig(prev => prev ? { ...prev, attribution_source: source } : null)

      // Clear attribution data when switching away from KillScale
      if (source !== 'killscale') {
        setAttributionData({})
        setLastTouchAttribution({})
        setMultiTouchAttribution({})
        setAttributionModel('last_touch')
      }
    } catch (err) {
      console.error('Error setting attribution source:', err)
    }
  }, [userId, currentAccountId, pixelConfig?.pixel_id])

  // Computed values
  const isKillScaleActive = pixelConfig?.attribution_source === 'killscale'
  const isMultiTouchModel = attributionModel !== 'last_touch'
  const source = pixelConfig?.attribution_source || 'meta'
  const pixelId = pixelConfig?.pixel_id || null

  const contextValue = useMemo(() => ({
    source,
    pixelId,
    pixelConfig,
    attributionModel,
    attributionData,
    lastTouchAttribution,
    multiTouchAttribution,
    loading,
    isKillScaleActive,
    isMultiTouchModel,
    setSource,
    refreshAttribution,
  }), [source, pixelId, pixelConfig, attributionModel, attributionData, lastTouchAttribution, multiTouchAttribution, loading, isKillScaleActive, isMultiTouchModel, setSource, refreshAttribution])

  return (
    <AttributionContext.Provider value={contextValue}>
      {children}
    </AttributionContext.Provider>
  )
}

export const useAttribution = () => useContext(AttributionContext)
