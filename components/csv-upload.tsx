'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, Download, AlertCircle, CheckCircle } from 'lucide-react'
import { parseCSV, generateSampleCSV, CSVRow } from '@/lib/csv-parser'
import { cn } from '@/lib/utils'

type CSVUploadProps = {
  onUpload: (rows: CSVRow[]) => void
  isLoading?: boolean
}

export function CSVUpload({ onUpload, isLoading }: CSVUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setSuccess(false)

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && !file.name.endsWith('.txt')) {
      setError('Please upload a CSV or TSV file')
      return
    }

    try {
      const text = await file.text()
      const rows = parseCSV(text)

      if (rows.length === 0) {
        setError('No valid data found in file. Make sure it has the correct columns.')
        return
      }

      setSuccess(true)
      onUpload(rows)
    } catch (err) {
      setError('Failed to parse file. Please check the format.')
      console.error(err)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleDownloadSample = () => {
    const csv = generateSampleCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-meta-ads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
          dragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-border-light',
          isLoading && 'opacity-50 pointer-events-none'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          onChange={handleChange}
          className="hidden"
        />
        
        <Upload className="w-10 h-10 mx-auto mb-4 text-zinc-500" />
        <p className="text-sm text-zinc-400 mb-2">
          Drag and drop your Meta Ads CSV export here
        </p>
        <p className="text-xs text-zinc-600">
          or click to browse
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          File uploaded successfully!
        </div>
      )}

      <button
        onClick={handleDownloadSample}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <Download className="w-4 h-4" />
        Download sample CSV
      </button>

      <div className="text-xs text-zinc-600 space-y-1">
        <p className="font-medium text-zinc-500">Expected columns from Meta Ads export:</p>
        <p>Reporting starts, Reporting ends, Ad name, Campaign name, Ad set name, Impressions, Link clicks, Amount spent (USD), Direct website purchases, Direct website purchases conversion value</p>
      </div>
    </div>
  )
}
