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
  workspace_id: string
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
  workspaceId: string | null
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
  refreshAttribution: (dateStart: string, dateEnd: string) => Promise<void>
  reloadConfig: () => void
}

const AttributionContext = createContext<AttributionContextType>({
  source: 'meta',
  pixelId: null,
  workspaceId: null,
  pixelConfig: null,
  attributionModel: 'last_touch',
  attributionData: {},
  lastTouchAttribution: {},
  multiTouchAttribution: {},
  loading: true,
  isKillScaleActive: false,
  isMultiTouchModel: false,
  refreshAttribution: async () => {},
  reloadConfig: () => {},
})

export function AttributionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { currentWorkspaceId } = useAccount()

  const [pixelConfig, setPixelConfig] = useState<PixelConfig | null>(null)
  const [attributionData, setAttributionData] = useState<AttributionData>({})
  const [lastTouchAttribution, setLastTouchAttribution] = useState<AttributionData>({})
  const [multiTouchAttribution, setMultiTouchAttribution] = useState<AttributionData>({})
  const [attributionModel, setAttributionModel] = useState<AttributionModel>('last_touch')
  const [loading, setLoading] = useState(true)
  const [configVersion, setConfigVersion] = useState(0)

  const userId = user?.id

  // Force reload of pixel config (call this after changing settings)
  const reloadConfig = useCallback(() => {
    console.log('[Attribution] reloadConfig called - incrementing version')
    setConfigVersion(v => v + 1)
  }, [])

  // Load pixel config when workspace changes or when reloadConfig is called
  // Pixel attribution is only available when viewing a workspace (not individual accounts)
  useEffect(() => {
    // IMMEDIATELY clear all state to prevent stale/mixed data
    setPixelConfig(null)
    setAttributionData({})
    setLastTouchAttribution({})
    setMultiTouchAttribution({})
    setAttributionModel('last_touch')

    if (!userId || !currentWorkspaceId) {
      // No workspace = no pixel attribution available
      // Individual account views use native API data only
      setLoading(false)
      return
    }

    const loadPixelConfig = async () => {
      setLoading(true)
      try {
        // Query workspace_pixels for this workspace's pixel config
        const { data: wsPixel, error } = await supabase
          .from('workspace_pixels')
          .select('pixel_id, attribution_source, attribution_window, attribution_model, time_decay_half_life')
          .eq('workspace_id', currentWorkspaceId)
          .single()

        if (error || !wsPixel) {
          console.log('[Attribution] No workspace pixel found for workspace:', currentWorkspaceId)
          setPixelConfig(null)
          setLoading(false)
          return
        }

        // Map workspace_pixels values ('native'/'pixel') to internal values ('meta'/'killscale')
        const mappedSource: AttributionSource = wsPixel.attribution_source === 'pixel' ? 'killscale' : 'meta'

        console.log('[Attribution] Loaded workspace pixel config:', {
          workspaceId: currentWorkspaceId,
          pixelId: wsPixel.pixel_id,
          rawSource: wsPixel.attribution_source,
          mappedSource,
          model: wsPixel.attribution_model,
          configVersion
        })

        setPixelConfig({
          pixel_id: wsPixel.pixel_id,
          workspace_id: currentWorkspaceId,
          attribution_source: mappedSource,
          attribution_window: wsPixel.attribution_window || 7,
          attribution_model: wsPixel.attribution_model || 'last_touch',
          time_decay_half_life: wsPixel.time_decay_half_life || 7,
        })
      } catch (err) {
        console.error('Error loading pixel config:', err)
        setPixelConfig(null)
      } finally {
        setLoading(false)
      }
    }

    loadPixelConfig()
  }, [userId, currentWorkspaceId, configVersion])

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
      const workspaceId = pixelConfig.workspace_id
      const url = `/api/pixel/attribution?pixelId=${pixelConfig.pixel_id}&userId=${userId}&workspaceId=${workspaceId}&dateStart=${dateStart}&dateEnd=${dateEnd}`
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
  }, [pixelConfig?.pixel_id, pixelConfig?.workspace_id, pixelConfig?.attribution_source, userId])

  // Computed values
  const isKillScaleActive = pixelConfig?.attribution_source === 'killscale'
  const isMultiTouchModel = attributionModel !== 'last_touch'
  const source = pixelConfig?.attribution_source || 'meta'
  const pixelId = pixelConfig?.pixel_id || null
  const workspaceId = pixelConfig?.workspace_id || null

  const contextValue = useMemo(() => ({
    source,
    pixelId,
    workspaceId,
    pixelConfig,
    attributionModel,
    attributionData,
    lastTouchAttribution,
    multiTouchAttribution,
    loading,
    isKillScaleActive,
    isMultiTouchModel,
    refreshAttribution,
    reloadConfig,
  }), [source, pixelId, workspaceId, pixelConfig, attributionModel, attributionData, lastTouchAttribution, multiTouchAttribution, loading, isKillScaleActive, isMultiTouchModel, refreshAttribution, reloadConfig])

  return (
    <AttributionContext.Provider value={contextValue}>
      {children}
    </AttributionContext.Provider>
  )
}

export const useAttribution = () => useContext(AttributionContext)
