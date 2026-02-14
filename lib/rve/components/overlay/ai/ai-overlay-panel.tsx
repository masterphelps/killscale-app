"use client"

import React, { useState, useCallback } from "react"
import { Sparkles, Loader2, Wand2 } from "lucide-react"
import { Button } from "../../ui/button"

interface AIOverlayPanelProps {
  onGenerate: (prompt: string) => Promise<void>
  isGenerating: boolean
  hasTranscript: boolean
}

/**
 * AI generation sidebar panel for KillScale video editor.
 * Sends a prompt to Claude/Whisper to generate overlays.
 */
export const AIOverlayPanel: React.FC<AIOverlayPanelProps> = ({
  onGenerate,
  isGenerating,
  hasTranscript,
}) => {
  const [prompt, setPrompt] = useState("")

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return
    await onGenerate(prompt.trim())
  }, [prompt, isGenerating, onGenerate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleGenerate()
      }
    },
    [handleGenerate]
  )

  const quickPrompts = [
    { label: "Add captions", prompt: "Add captions with word-level highlighting" },
    { label: "Hook + CTA", prompt: "Add an attention-grabbing hook at the start and a CTA at the end" },
    { label: "Bold captions", prompt: "Add bold, large captions with highlight on key words" },
    { label: "Minimal text", prompt: "Add minimal, clean text overlays - just a hook and subtle captions" },
  ]

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <span>Describe what overlays to add</span>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="e.g., Add captions with word highlighting and a bold hook at the start..."
        className="min-h-[100px] w-full resize-none rounded-md border border-border bg-surface-elevated p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={isGenerating}
      />

      <Button
        onClick={handleGenerate}
        disabled={!prompt.trim() || isGenerating}
        className="w-full gap-2"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" />
            Generate Overlays
          </>
        )}
      </Button>

      {hasTranscript && (
        <p className="text-xs text-emerald-400">
          Transcript available — captions will use word-level timing
        </p>
      )}

      <div className="mt-2 border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Quick prompts</p>
        <div className="flex flex-col gap-1.5">
          {quickPrompts.map((qp) => (
            <button
              key={qp.label}
              onClick={() => setPrompt(qp.prompt)}
              className="rounded-md border border-border px-3 py-2 text-left text-xs text-foreground hover:bg-surface-overlay transition-colors"
              disabled={isGenerating}
            >
              {qp.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1">
        Cmd+Enter to generate. Uses Whisper for transcription + Claude for overlay layout.
      </p>
    </div>
  )
}
