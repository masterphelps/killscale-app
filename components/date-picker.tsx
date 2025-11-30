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

    const daysInMonth = getDaysInMonth(month, year)
    const firstDay = getFirstDayOfMonth(month, year)
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    const today = new Date()
    const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate())

    return (
      <div className="flex-1">
        <div className="flex items-center justify-between mb-3 px-1">
          {monthOffset === 0 ? (
            <button onClick={prevMonth} className="p-1 hover:bg-bg-hover rounded-md transition-colors">
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
          ) : <div className="w-6" />}
          <span className="text-sm font-medium text-white">
            {MONTHS[month]} {year}
          </span>
          {monthOffset === 1 ? (
            <button onClick={nextMonth} className="p-1 hover:bg-bg-hover rounded-md transition-colors">
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          ) : <div className="w-6" />}
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
            const inRange = isInRange(dateStr)
            const isStart = isRangeStart(dateStr)
            const isEnd = isRangeEnd(dateStr)
            
            return (
              <button
                key={dateStr}
                onClick={() => handleDateClick(dateStr)}
                onMouseEnter={() => !customEndDate && customStartDate && setHoverDate(dateStr)}
                onMouseLeave={() => setHoverDate(null)}
                className={`
                  h-8 text-sm rounded-md transition-all relative
                  ${isStart || isEnd 
                    ? 'bg-accent text-white font-medium' 
                    : inRange 
                      ? 'bg-accent/20 text-accent' 
                      : 'text-zinc-300 hover:bg-bg-hover'
                  }
                  ${isToday && !isStart && !isEnd && !inRange ? 'ring-1 ring-accent/50' : ''}
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
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
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
      <span>{label}</span>
      <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
    </button>
  )
}

export { DATE_PRESETS }
