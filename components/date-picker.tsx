'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'

type DatePickerProps = {
  isOpen: boolean
  onClose: () => void
  datePreset: string
  onPresetChange: (preset: string) => void
  customStartDate: string
  customEndDate: string
  onCustomDateChange: (start: string, end: string) => void
  onApply: () => void
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 Days' },
  { value: 'last_14d', label: 'Last 14 Days' },
  { value: 'last_30d', label: 'Last 30 Days' },
  { value: 'last_90d', label: 'Last 90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'maximum', label: 'Maximum' },
  { value: 'custom', label: 'Custom Range' },
]

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Helper to calculate date range from preset
function getDateRangeFromPreset(preset: string): { start: string; end: string } | null {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'today':
      return { start: formatDate(today), end: formatDate(today) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { start: formatDate(yesterday), end: formatDate(yesterday) }
    }
    case 'last_7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { start: formatDate(start), end: formatDate(today) }
    }
    case 'last_14d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 13)
      return { start: formatDate(start), end: formatDate(today) }
    }
    case 'last_30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { start: formatDate(start), end: formatDate(today) }
    }
    case 'last_90d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 89)
      return { start: formatDate(start), end: formatDate(today) }
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start: formatDate(start), end: formatDate(today) }
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: formatDate(start), end: formatDate(end) }
    }
    default:
      return null
  }
}

export function DatePicker({
  isOpen,
  onClose,
  datePreset,
  onPresetChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
  onApply
}: DatePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectingStart, setSelectingStart] = useState(true)
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  useEffect(() => {
    if (datePreset === 'custom') {
      setShowCalendar(true)
    } else {
      setShowCalendar(false)
    }
  }, [datePreset])

  // Reset calendar view when opening and pre-fill custom dates from current preset
  useEffect(() => {
    if (isOpen) {
      const now = new Date()
      setViewMonth(now.getMonth())
      setViewYear(now.getFullYear())

      // If not already in custom mode, pre-fill custom dates from current preset
      if (datePreset !== 'custom') {
        const range = getDateRangeFromPreset(datePreset)
        if (range) {
          onCustomDateChange(range.start, range.end)
        }
      }
    }
  }, [isOpen])

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay()
  }

  const formatDate = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const parseDate = (dateStr: string) => {
    if (!dateStr) return null
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  // Get today's date string for comparison
  const today = new Date()
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate())

  const isDateInFuture = (dateStr: string) => {
    return dateStr > todayStr
  }

  const isInRange = (dateStr: string) => {
    if (!customStartDate) return false
    const date = parseDate(dateStr)
    const start = parseDate(customStartDate)
    const end = customEndDate ? parseDate(customEndDate) : (hoverDate ? parseDate(hoverDate) : null)

    if (!date || !start) return false
    if (!end) return dateStr === customStartDate

    return date >= start && date <= end
  }

  const isRangeStart = (dateStr: string) => dateStr === customStartDate
  const isRangeEnd = (dateStr: string) => dateStr === customEndDate || (!customEndDate && dateStr === hoverDate)

  const handleDateClick = (dateStr: string) => {
    // Don't allow future dates
    if (isDateInFuture(dateStr)) return

    if (selectingStart || !customStartDate) {
      onCustomDateChange(dateStr, '')
      setSelectingStart(false)
    } else {
      const start = parseDate(customStartDate)
      const clicked = parseDate(dateStr)

      if (clicked && start && clicked < start) {
        onCustomDateChange(dateStr, customStartDate)
      } else {
        onCustomDateChange(customStartDate, dateStr)
      }
      setSelectingStart(true)
    }
  }

  const handlePresetClick = (preset: string) => {
    onPresetChange(preset)
    if (preset !== 'custom') {
      onClose()
    }
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    // Don't allow navigating to future months
    const now = new Date()
    const currentYearMonth = now.getFullYear() * 12 + now.getMonth()
    const nextYearMonth = viewYear * 12 + viewMonth + 1
    if (nextYearMonth > currentYearMonth) return

    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const renderCalendar = (monthOffset: number = 0) => {
    let month = viewMonth + monthOffset
    let year = viewYear
    if (month > 11) {
      month = 0
      year++
    }
    if (month < 0) {
      month = 11
      year--
    }

    const daysInMonth = getDaysInMonth(month, year)
    const firstDay = getFirstDayOfMonth(month, year)
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3 px-1">
          {monthOffset === 0 ? (
            <button onClick={prevMonth} className="p-1 hover:bg-bg-hover rounded-md transition-colors">
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
          ) : <div className="w-6" />}
          <span className="text-sm font-medium text-white">
            {MONTHS[month]} {year}
          </span>
          {(monthOffset === 1 || monthOffset === 0) && (
            <button onClick={nextMonth} className="p-1 hover:bg-bg-hover rounded-md transition-colors">
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAYS.map(day => (
            <div key={day} className="text-center text-xs text-zinc-500 py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="h-8" />
            }

            const dateStr = formatDate(year, month, day)
            const isToday = dateStr === todayStr
            const isFuture = isDateInFuture(dateStr)
            const inRange = isInRange(dateStr)
            const isStart = isRangeStart(dateStr)
            const isEnd = isRangeEnd(dateStr)

            return (
              <button
                key={dateStr}
                onClick={() => handleDateClick(dateStr)}
                onMouseEnter={() => !customEndDate && customStartDate && !isFuture && setHoverDate(dateStr)}
                onMouseLeave={() => setHoverDate(null)}
                disabled={isFuture}
                className={`
                  h-8 text-sm rounded-md transition-all relative
                  ${isFuture
                    ? 'text-zinc-600 cursor-not-allowed'
                    : isStart || isEnd
                      ? 'bg-accent text-white font-medium'
                      : inRange
                        ? 'bg-accent/20 text-accent'
                        : 'text-zinc-300 hover:bg-bg-hover'
                  }
                  ${isToday && !isStart && !isEnd && !inRange && !isFuture ? 'ring-1 ring-accent/50' : ''}
                `}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 lg:bg-transparent" onClick={onClose} />

      {/* Mobile: Full screen modal */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end">
        <div className="w-full bg-bg-card rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up">
          {/* Header */}
          <div className="sticky top-0 bg-bg-card border-b border-border px-4 py-3 flex items-center justify-between">
            <span className="text-lg font-semibold text-white">Select Date Range</span>
            <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-lg transition-colors">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          {/* Presets */}
          <div className="p-4 border-b border-border">
            <div className="grid grid-cols-2 gap-2">
              {DATE_PRESETS.filter(p => p.value !== 'custom').map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    datePreset === preset.value
                      ? 'bg-accent text-white'
                      : 'bg-bg-hover text-zinc-300 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Range Section */}
          <div className="p-4">
            <button
              onClick={() => {
                onPresetChange('custom')
                setShowCalendar(true)
              }}
              className={`w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-4 ${
                datePreset === 'custom'
                  ? 'bg-accent text-white'
                  : 'bg-bg-hover text-zinc-300 hover:text-white'
              }`}
            >
              Custom Range
            </button>

            {showCalendar && (
              <>
                {/* Single calendar on mobile */}
                <div className="mb-4">
                  {renderCalendar(0)}
                </div>

                {/* Selected range display */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 bg-bg-hover rounded-lg px-3 py-2 text-center">
                    <div className="text-[10px] text-zinc-500 uppercase mb-1">From</div>
                    <div className={`text-sm ${customStartDate ? 'text-white' : 'text-zinc-500'}`}>
                      {customStartDate || 'Select'}
                    </div>
                  </div>
                  <span className="text-zinc-600">→</span>
                  <div className="flex-1 bg-bg-hover rounded-lg px-3 py-2 text-center">
                    <div className="text-[10px] text-zinc-500 uppercase mb-1">To</div>
                    <div className={`text-sm ${customEndDate ? 'text-white' : 'text-zinc-500'}`}>
                      {customEndDate || 'Select'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onApply()
                    onClose()
                  }}
                  disabled={!customStartDate || !customEndDate}
                  className="w-full py-3 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Apply Range
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: Dropdown */}
      <div className="hidden lg:block absolute right-0 top-full mt-2 bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
        <div className="flex">
          {/* Presets sidebar */}
          <div className="w-40 border-r border-border py-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  datePreset === preset.value
                    ? 'bg-accent/10 text-accent border-r-2 border-accent'
                    : 'text-zinc-400 hover:text-white hover:bg-bg-hover'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendar area */}
          {showCalendar && (
            <div className="p-4">
              <div className="flex gap-6">
                {renderCalendar(0)}
                {renderCalendar(1)}
              </div>

              {/* Selected range display */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">From</span>
                      <span className={`px-3 py-1.5 rounded-lg text-sm ${
                        customStartDate ? 'bg-bg-hover text-white' : 'bg-bg-hover/50 text-zinc-500'
                      }`}>
                        {customStartDate || 'Select date'}
                      </span>
                    </div>
                    <span className="text-zinc-600">→</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">To</span>
                      <span className={`px-3 py-1.5 rounded-lg text-sm ${
                        customEndDate ? 'bg-bg-hover text-white' : 'bg-bg-hover/50 text-zinc-500'
                      }`}>
                        {customEndDate || 'Select date'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onApply()
                      onClose()
                    }}
                    disabled={!customStartDate || !customEndDate}
                    className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function DatePickerButton({
  label,
  onClick,
  isOpen
}: {
  label: string
  onClick: () => void
  isOpen: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 bg-bg-card border rounded-lg text-sm transition-all ${
        isOpen
          ? 'border-accent text-accent'
          : 'border-border text-zinc-300 hover:border-zinc-600'
      }`}
    >
      <Calendar className="w-4 h-4" />
      <span className="truncate max-w-[120px] sm:max-w-none">{label}</span>
      <ChevronRight className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
    </button>
  )
}

export { DATE_PRESETS }
