'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

type DeleteAccountModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: (email: string) => void
  userEmail: string
  isLoading?: boolean
}

export function DeleteAccountModal({
  isOpen,
  onClose,
  onConfirm,
  userEmail,
  isLoading = false
}: DeleteAccountModalProps) {
  const [confirmEmail, setConfirmEmail] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (confirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
      setError('Email does not match your account email')
      return
    }

    onConfirm(confirmEmail)
  }

  const handleClose = () => {
    setConfirmEmail('')
    setError('')
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-sidebar border border-red-500/30 rounded-xl p-6 z-50 shadow-xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold mb-2 text-red-400">Delete Account</h2>
        <p className="text-zinc-400 text-sm mb-4">
          This action is permanent and cannot be undone. All your data, including:
        </p>
        <ul className="text-zinc-500 text-sm mb-4 list-disc list-inside space-y-1">
          <li>Ad performance data and history</li>
          <li>Custom rules and alert settings</li>
          <li>Connected Meta ad accounts</li>
          <li>Your subscription (if any)</li>
        </ul>
        <p className="text-zinc-400 text-sm mb-6">
          To confirm, please type your email: <span className="text-white font-mono">{userEmail}</span>
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="Enter your email to confirm"
            className="w-full px-4 py-3 bg-bg-dark border border-border rounded-lg text-white focus:outline-none focus:border-red-500 mb-4"
            disabled={isLoading}
            autoComplete="off"
          />

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-bg-card border border-border rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !confirmEmail}
              className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? 'Deleting...' : 'Delete My Account'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
