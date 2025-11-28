'use client'

import { useState, useEffect } from 'react'
import { Upload, Calendar, Lock, Trash2 } from 'lucide-react'
import { StatCard } from '@/components/stat-card'
import { PerformanceTable } from '@/components/performance-table'
import { CSVUpload } from '@/components/csv-upload'
import { CSVRow } from '@/lib/csv-parser'
import { Rules } from '@/lib/supabase'
import { formatCurrency, formatNumber, formatROAS, formatDateRange } from '@/lib/utils'
import { useSubscription } from '@/lib/subscription'
import { useAuth } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const FREE_CAMPAIGN_LIMIT = 5

const DEFAULT_RULES: Rules = {
  id: '',
  ad_account_id: '',
  scale_roas: 3.0,
  min_roas: 1.5,
  learning_spend: 100,
  created_at: '',
  updated_at: ''
}

export default function DashboardPage() {
  const [data, setData] = useState<CSVRow[]>([])
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [showUpload, setShowUpload] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const { plan } = useSubscription()
  const { user } = useAuth()
  
  // Load data from Supabase on mount
  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    if (!user) return
    
    setIsLoading(true)
    const { data: adData, error } = await supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', user.id)
      .order('date_start', { ascending: false })

    if (adData && !error) {
      setData(adData.map(row => ({
        date_start: row.date_start,
        date_end: row.date_end,
        campaign_name: row.campaign_name,
        adset_name: row.adset_name,
        ad_name: row.ad_name,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: parseFloat(row.spend),
        purchases: row.purchases,
        revenue: parseFloat(row.revenue),
      })))
    }
    setIsLoading(false)
  }

  const handleUpload = async (rows: CSVRow[]) => {
    if (!user) return
    
    setIsSaving(true)
    
    // Delete existing data for this user
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)

    // Insert new data
    const insertData = rows.map(row => ({
      user_id: user.id,
      date_start: row.date_start,
      date_end: row.date_end,
      campaign_name: row.campaign_name,
      adset_name: row.adset_name,
      ad_name: row.ad_name,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      purchases: row.purchases,
      revenue: row.revenue,
    }))

    const { error } = await supabase
      .from('ad_data')
      .insert(insertData)

    if (!error) {
      setData(rows)
    } else {
      console.error('Error saving data:', error)
      alert('Error saving data. Please try again.')
    }
    
    setIsSaving(false)
    setShowUpload(false)
  }

  const handleClearData = async () => {
    if (!user) return
    if (!confirm('Are you sure you want to clear all your ad data?')) return

    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)

    setData([])
  }
  
  const userPlan = plan
  
  const allCampaigns = Array.from(new Set(data.map(row => row.campaign_name)))
  const totalCampaigns = allCampaigns.length
  const isLimited = userPlan === 'Free' && totalCampaigns > FREE_CAMPAIGN_LIMIT
  const hiddenCampaigns = isLimited ? totalCampaigns - FREE_CAMPAIGN_LIMIT : 0
  
  const visibleCampaigns = userPlan === 'Free' 
    ? allCampaigns.slice(0, FREE_CAMPAIGN_LIMIT)
    : allCampaigns
  
  const filteredData = data.filter(row => visibleCampaigns.includes(row.campaign_name))
  
  const totals = {
    spend: filteredData.reduce((sum, row) => sum + row.spend, 0),
    revenue: filteredData.reduce((sum, row) => sum + row.revenue, 0),
    purchases: filteredData.reduce((sum, row) => sum + row.purchases, 0),
    impressions: filteredData.reduce((sum, row) => sum + row.impressions, 0),
    roas: 0
  }
  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0
  
  const dateRange = {
    start: data.length > 0 ? data[0].date_start : new Date().toISOString().split('T')[0],
    end: data.length > 0 ? data[0].date_end : new Date().toISOString().split('T')[0]
  }
  
  const tableData = filteredData.map(row => ({
    campaign_name: row.campaign_name,
    adset_name: row.adset_name,
    ad_name: row.ad_name,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    purchases: row.purchases,
    revenue: row.revenue,
    roas: row.spend > 0 ? row.revenue / row.spend : 0
  }))
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading your data...</div>
      </div>
    )
  }
  
  return (
    <>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
          <p className="text-zinc-500">Your Meta Ads performance at a glance</p>
        </div>
        
        <div className="flex items-center gap-3">
          {data.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="w-1.5 h-1.5 bg-verdict-scale rounded-full" />
                {totalCampaigns} campaign{totalCampaigns !== 1 ? 's' : ''}
              </div>
              
              <button className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-border rounded-lg text-sm hover:border-border-light transition-colors">
                <Calendar className="w-4 h-4" />
                {formatDateRange(dateRange.start, dateRange.end)}
              </button>

              <button 
                onClick={handleClearData}
                className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-border rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          
          <button 
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-border rounded-xl">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-xl font-semibold mb-2">No data yet</h2>
          <p className="text-zinc-500 mb-6">Upload a CSV export from Meta Ads to get started</p>
          <button 
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
        </div>
      ) : (
        <>
          {isLimited && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-amber-500" />
                <div>
                  <div className="font-medium text-amber-500">
                    {hiddenCampaigns} campaign{hiddenCampaigns > 1 ? 's' : ''} hidden
                  </div>
                  <div className="text-sm text-zinc-400">
                    Free plan is limited to {FREE_CAMPAIGN_LIMIT} campaigns. Upgrade to see all your data.
                  </div>
                </div>
              </div>
              <Link 
                href="/pricing"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg text-sm transition-colors"
              >
                Upgrade Now
              </Link>
            </div>
          )}
          
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard 
              label="Total Spend" 
              value={formatCurrency(totals.spend)}
              icon="💰"
            />
            <StatCard 
              label="Revenue" 
              value={formatCurrency(totals.revenue)}
              icon="💵"
            />
            <StatCard 
              label="ROAS" 
              value={formatROAS(totals.roas)}
              icon="📈"
            />
            <StatCard 
              label="Purchases" 
              value={formatNumber(totals.purchases)}
              icon="🛒"
            />
          </div>
          
          <PerformanceTable 
            data={tableData}
            rules={rules}
            dateRange={dateRange}
          />
        </>
      )}
      
      {showUpload && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowUpload(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-sidebar border border-border rounded-xl p-6 z-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Upload CSV</h2>
              <button 
                onClick={() => setShowUpload(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border text-zinc-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
            <CSVUpload onUpload={handleUpload} isLoading={isSaving} />
            {isSaving && (
              <div className="mt-4 text-center text-sm text-zinc-500">
                Saving your data...
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
