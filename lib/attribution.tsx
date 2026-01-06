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
export type RevenueSource = 'shopify' | 'pixel' | 'meta'
export type BusinessType = 'ecommerce' | 'leadgen'

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

// Shopify attribution data keyed by ad_id (last_utm_content from orders)
export type ShopifyAttributionData = Record<string, {
  revenue: number
  orders: number
}>

type ShopifyTotals = {
  total_revenue: number
  total_orders: number
  attributed_revenue: number
  attributed_orders: number
  unattributed_revenue: number
  unattributed_orders: number
  pixel_match_rate: number  // % of orders with pixel data (target: 85%+)
}

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

  // NEW: Business type and Shopify state
  businessType: BusinessType
  hasShopify: boolean
  shopifyAttribution: ShopifyAttributionData
  shopifyTotals: ShopifyTotals | null
  revenueSource: RevenueSource
  // Pixel match rate for JOIN model (% of orders with pixel data, target 85%+)
  pixelMatchRate: number

  // Actions
  refreshAttribution: (dateStart: string, dateEnd: string) => Promise<void>
  refreshShopifyAttribution: (dateStart: string, dateEnd: string) => Promise<void>
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
  businessType: 'ecommerce',
  hasShopify: false,
  shopifyAttribution: {},
  shopifyTotals: null,
  revenueSource: 'meta',
  pixelMatchRate: 0,
  refreshAttribution: async () => {},
  refreshShopifyAttribution: async () => {},
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

  // NEW: Shopify state
  const [businessType, setBusinessType] = useState<BusinessType>('ecommerce')
  const [hasShopify, setHasShopify] = useState(false)
  const [shopifyAttribution, setShopifyAttribution] = useState<ShopifyAttributionData>({})
  const [shopifyTotals, setShopifyTotals] = useState<ShopifyTotals | null>(null)

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
    setBusinessType('ecommerce')
    setHasShopify(false)
    setShopifyAttribution({})
    setShopifyTotals(null)

    if (!userId || !currentWorkspaceId) {
      // No workspace = no pixel attribution available
      // Individual account views use native API data only
      setLoading(false)
      return
    }

    const loadConfig = async () => {
      setLoading(true)
      try {
        // Load workspace to get business_type
        const { data: workspace } = await supabase
          .from('workspaces')
          .select('business_type')
          .eq('id', currentWorkspaceId)
          .single()

        if (workspace?.business_type) {
          setBusinessType(workspace.business_type as BusinessType)
        }

        // Check for Shopify connection
        const { data: shopifyConn } = await supabase
          .from('shopify_connections')
          .select('id')
          .eq('workspace_id', currentWorkspaceId)
          .single()

        setHasShopify(!!shopifyConn)

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

        console.log('[Attribution] Loaded workspace config:', {
          workspaceId: currentWorkspaceId,
          businessType: workspace?.business_type,
          hasShopify: !!shopifyConn,
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
        console.error('Error loading config:', err)
        setPixelConfig(null)
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
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

  // NEW: Refresh Shopify attribution data
  const refreshShopifyAttribution = useCallback(async (dateStart: string, dateEnd: string) => {
    console.log('[Attribution] refreshShopifyAttribution called:', {
      hasShopify,
      currentWorkspaceId,
      userId,
      dateStart,
      dateEnd
    })

    if (!hasShopify || !currentWorkspaceId || !userId) {
      console.log('[Attribution] Skipping Shopify - not connected or missing params')
      setShopifyAttribution({})
      setShopifyTotals(null)
      return
    }

    try {
      // Pass timezone offset so API can convert local dates to UTC correctly
      const timezoneOffset = new Date().getTimezoneOffset()
      const url = `/api/shopify/attribution?workspaceId=${currentWorkspaceId}&userId=${userId}&dateStart=${dateStart}&dateEnd=${dateEnd}&timezoneOffset=${timezoneOffset}`
      console.log('[Attribution] Fetching Shopify attribution:', url)
      const res = await fetch(url)
      const data = await res.json()
      console.log('[Attribution] Shopify API Response:', data)

      if (data.attribution && data.totals) {
        console.log('[Attribution] Loaded Shopify data:', {
          totalOrders: data.totals.total_orders,
          totalRevenue: data.totals.total_revenue,
          uniqueAds: Object.keys(data.attribution).length,
          sampleData: Object.entries(data.attribution).slice(0, 3)
        })
        setShopifyAttribution(data.attribution)
        setShopifyTotals(data.totals)
      } else {
        console.log('[Attribution] No Shopify attribution data in response')
        setShopifyAttribution({})
        setShopifyTotals(null)
      }
    } catch (err) {
      console.error('Failed to load Shopify attribution:', err)
      setShopifyAttribution({})
      setShopifyTotals(null)
    }
  }, [hasShopify, currentWorkspaceId, userId])

  // Computed values
  const isKillScaleActive = pixelConfig?.attribution_source === 'killscale'
  const isMultiTouchModel = attributionModel !== 'last_touch'
  const source = pixelConfig?.attribution_source || 'meta'
  const pixelId = pixelConfig?.pixel_id || null
  const workspaceId = pixelConfig?.workspace_id || null

  // NEW: Determine revenue source based on waterfall logic
  const revenueSource: RevenueSource = useMemo(() => {
    if (businessType === 'leadgen') return 'meta' // Lead gen uses Meta results
    if (hasShopify) return 'shopify'
    if (isKillScaleActive) return 'pixel'
    return 'meta'
  }, [businessType, hasShopify, isKillScaleActive])

  // Pixel match rate from Shopify totals (JOIN model)
  const pixelMatchRate = shopifyTotals?.pixel_match_rate ?? 0

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
    businessType,
    hasShopify,
    shopifyAttribution,
    shopifyTotals,
    revenueSource,
    pixelMatchRate,
    refreshAttribution,
    refreshShopifyAttribution,
    reloadConfig,
  }), [source, pixelId, workspaceId, pixelConfig, attributionModel, attributionData, lastTouchAttribution, multiTouchAttribution, loading, isKillScaleActive, isMultiTouchModel, businessType, hasShopify, shopifyAttribution, shopifyTotals, revenueSource, pixelMatchRate, refreshAttribution, refreshShopifyAttribution, reloadConfig])

  return (
    <AttributionContext.Provider value={contextValue}>
      {children}
    </AttributionContext.Provider>
  )
}

export const useAttribution = () => useContext(AttributionContext)
