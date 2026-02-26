'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Play, Pause, Volume2 } from 'lucide-react'
import { AISection } from './ai-section'

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  previewUrl: string
  genre: string
}

interface AudioPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
  voices: { id: string; label: string }[]
  selectedVoice: string
  onSelectVoice: (voiceId: string) => void
  onGenerateVoiceover: () => Promise<void>
  isGeneratingVoiceover: boolean
  hasVoiceover: boolean
  onAddMusic: (trackUrl: string, title: string, duration: number) => void
}

const GENRE_FILTERS = ['All', 'Beats', 'Adventure', 'Upbeat', 'Rock', 'Cinematic', 'Lofi', 'Funk', 'Electronic', 'Corporate']

export function AudioPanel({
  onAIGenerate, isAIGenerating,
  voices, selectedVoice, onSelectVoice, onGenerateVoiceover, isGeneratingVoiceover, hasVoiceover,
  onAddMusic,
}: AudioPanelProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [isLoadingTracks, setIsLoadingTracks] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeGenre, setActiveGenre] = useState('All')
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    loadTracks()
  }, [activeGenre]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const loadTracks = async (query?: string) => {
    setIsLoadingTracks(true)
    try {
      const params = new URLSearchParams()
      if (query || searchQuery) params.set('q', query || searchQuery)
      if (activeGenre !== 'All') params.set('genre', activeGenre.toLowerCase())
      const res = await fetch(`/api/creative-studio/music-search?${params}`)
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch (e) {
      console.error('Failed to load music:', e)
    } finally {
      setIsLoadingTracks(false)
    }
  }

  const togglePlayPreview = (track: Track) => {
    if (playingTrackId === track.id) {
      audioRef.current?.pause()
      setPlayingTrackId(null)
    } else {
      if (audioRef.current) audioRef.current.pause()
      const audio = new Audio(track.previewUrl)
      audio.play()
      audio.onended = () => setPlayingTrackId(null)
      audioRef.current = audio
      setPlayingTrackId(track.id)
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="p-3 space-y-4 overflow-x-hidden">
      <AISection
        onGenerate={(instruction) => onAIGenerate(`Audio: ${instruction}`)}
        isGenerating={isAIGenerating}
        placeholder="Describe audio you want..."
      />

      {/* Voiceover Section */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-medium text-zinc-300">Voiceover</h3>
        <select
          value={selectedVoice}
          onChange={(e) => onSelectVoice(e.target.value)}
          className="w-full text-sm px-3 py-2.5 rounded-lg bg-bg-hover border border-border text-white focus:outline-none focus:border-purple-500/50"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <button
          onClick={onGenerateVoiceover}
          disabled={isGeneratingVoiceover}
          className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isGeneratingVoiceover ? <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> : <Volume2 className="w-5 h-5 inline mr-2" />}
          {hasVoiceover ? 'Regenerate Voiceover' : 'Generate Voiceover'}
        </button>
      </div>

      {/* Background Music Section */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-medium text-zinc-300">Background Music</h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadTracks()}
          placeholder="Search music..."
          className="w-full text-sm px-3 py-2.5 rounded-lg bg-bg-hover border border-border text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
        />
        <div className="flex flex-wrap gap-1.5">
          {GENRE_FILTERS.map((genre) => (
            <button
              key={genre}
              onClick={() => setActiveGenre(genre)}
              className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
                activeGenre === genre
                  ? 'bg-purple-600 text-white'
                  : 'bg-bg-hover text-zinc-400 hover:bg-bg-card'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {isLoadingTracks ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : tracks.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No tracks found</p>
          ) : (
            tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-bg-hover cursor-pointer group"
                onClick={() => onAddMusic(track.previewUrl, track.title, track.duration)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlayPreview(track) }}
                  className="w-9 h-9 rounded-full bg-bg-card flex items-center justify-center flex-shrink-0 group-hover:bg-purple-600/50 transition-colors"
                >
                  {playingTrackId === track.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{track.title}</p>
                  <p className="text-xs text-zinc-500">{track.artist}</p>
                </div>
                <span className="text-xs text-zinc-500 flex-shrink-0">{formatDuration(track.duration)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
