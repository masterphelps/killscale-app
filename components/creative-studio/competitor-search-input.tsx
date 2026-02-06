'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Building2, Loader2, X, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompetitorSearchResult } from './types'

interface CompetitorSearchInputProps {
  onSelect: (company: CompetitorSearchResult) => void
  selectedCompany: CompetitorSearchResult | null
  onClear: () => void
}

export function CompetitorSearchInput({
  onSelect,
  selectedCompany,
  onClear,
}: CompetitorSearchInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompetitorSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [usePageIdMode, setUsePageIdMode] = useState(false)
  const [pageIdInput, setPageIdInput] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/creative-studio/competitor-search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setResults(data.companies || [])
      setHighlightedIndex(0)
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length >= 2) {
      debounceRef.current = setTimeout(() => {
        search(query)
      }, 300)
    } else {
      setResults([])
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, search])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % results.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
        break
      case 'Enter':
        e.preventDefault()
        if (results[highlightedIndex]) {
          handleSelect(results[highlightedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
    }
  }

  const handleSelect = (company: CompetitorSearchResult) => {
    onSelect(company)
    setQuery('')
    setResults([])
    setIsOpen(false)
    setUsePageIdMode(false)
    setPageIdInput('')
  }

  const handleUsePageId = () => {
    const trimmedId = pageIdInput.trim()
    if (!trimmedId) return

    // Create a CompetitorSearchResult from the page ID
    onSelect({
      name: `Page ${trimmedId}`,
      pageId: trimmedId,
      logoUrl: null,
    })
    setPageIdInput('')
    setUsePageIdMode(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // If company is selected, show the selected state
  if (selectedCompany) {
    return (
      <div className="flex items-center gap-3 p-3 bg-bg-dark border border-emerald-500/30 rounded-lg">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center overflow-hidden">
          {selectedCompany.logoUrl ? (
            <img
              src={selectedCompany.logoUrl}
              alt={selectedCompany.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Building2 className="w-5 h-5 text-emerald-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white truncate">{selectedCompany.name}</div>
          <div className="text-xs text-zinc-500">Selected competitor</div>
        </div>
        <button
          onClick={onClear}
          className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // Page ID mode - direct entry
  if (usePageIdMode) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            value={pageIdInput}
            onChange={(e) => setPageIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleUsePageId()
              }
            }}
            placeholder="Enter Facebook Page ID (e.g., 51212153078)"
            className="w-full bg-bg-dark border border-border rounded-lg pl-10 pr-24 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleUsePageId}
            disabled={!pageIdInput.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-accent hover:bg-accent/80 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            Use
          </button>
        </div>
        <button
          onClick={() => {
            setUsePageIdMode(false)
            setPageIdInput('')
          }}
          className="text-sm text-zinc-500 hover:text-white transition-colors"
        >
          Back to search
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => {
              if (results.length > 0) setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search competitor brands..."
            className="w-full bg-bg-dark border border-border rounded-lg pl-10 pr-10 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 animate-spin" />
          )}
        </div>

        {/* Dropdown */}
        {isOpen && results.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-2 bg-bg-card border border-border rounded-lg shadow-xl overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto">
              {results.map((company, index) => (
                <button
                  key={company.pageId || index}
                  onClick={() => handleSelect(company)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    index === highlightedIndex ? 'bg-accent/20' : 'hover:bg-white/5'
                  )}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt={company.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Building2 className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                  <span className="flex-1 text-sm text-white truncate">{company.name}</span>
                  {company.adCount !== undefined && company.adCount > 0 && (
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent rounded-full">
                      {company.adCount.toLocaleString()} ads
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
          <div className="absolute z-50 w-full mt-2 bg-bg-card border border-border rounded-lg shadow-xl p-4 text-center">
            <p className="text-sm text-zinc-500">No companies found for "{query}"</p>
          </div>
        )}
      </div>

      {/* Use Page ID link */}
      <button
        onClick={() => setUsePageIdMode(true)}
        className="text-sm text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
      >
        <Hash className="w-3.5 h-3.5" />
        Use Page ID instead
      </button>
    </div>
  )
}
