'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function Select({ value, onChange, options, placeholder = 'Select...', className, disabled }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Find selected option label
  const selectedOption = options.find(opt => opt.value === value)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-left",
          "flex items-center justify-between gap-2",
          "transition-colors duration-150",
          "focus:outline-none focus:border-accent",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-zinc-600 cursor-pointer",
          isOpen && "border-accent"
        )}
      >
        <span className={selectedOption ? "text-white" : "text-zinc-500"}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-zinc-500 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      <div
        className={cn(
          "absolute z-50 w-full mt-1 bg-bg-card border border-border rounded-lg shadow-xl overflow-hidden",
          "transition-all duration-200 origin-top",
          isOpen
            ? "opacity-100 scale-y-100 translate-y-0"
            : "opacity-0 scale-y-95 -translate-y-1 pointer-events-none"
        )}
      >
        <div className="max-h-60 overflow-y-auto py-1">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={cn(
                "w-full px-4 py-2.5 text-left flex items-center justify-between",
                "transition-colors duration-100",
                option.value === value
                  ? "bg-accent/20 text-white"
                  : "text-zinc-300 hover:bg-bg-hover hover:text-white"
              )}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <Check className="w-4 h-4 text-accent" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
