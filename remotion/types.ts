// Overlay config types shared between editor UI and Remotion compositions

export interface HookOverlay {
  line1: string
  line2?: string
  line2Color?: string
  startSec: number
  endSec: number
  animation: 'pop' | 'fade' | 'slide'
  fontSize?: number              // default 52
  fontWeight?: number            // default 800
  position?: 'top' | 'center' | 'bottom'  // default 'top'
}

export interface CaptionOverlay {
  text: string
  startSec: number
  endSec: number
  highlight?: boolean
  highlightWord?: string
  fontSize?: number              // default 36
  fontWeight?: number            // default 600
  position?: 'top' | 'center' | 'bottom'  // default 'bottom'
}

export interface CTAOverlay {
  buttonText: string
  brandName?: string
  url?: string
  buttonColor?: string
  startSec: number
  animation: 'pop' | 'fade' | 'slide'
  fontSize?: number              // default 32
}

export interface GraphicOverlay {
  type: 'logo' | 'badge' | 'watermark' | 'lower_third'
  imageUrl?: string
  text?: string
  position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center'
  startSec: number
  endSec: number
  opacity?: number
}

export interface EndCardOverlay {
  durationSec: number        // e.g. 3
  backgroundColor: string    // e.g. '#000000'
  text?: string             // e.g. 'Shop Now at example.com'
  textColor?: string        // default '#FFFFFF'
  fontSize?: number         // default 48
}

export type OverlayStyle = 'capcut' | 'minimal' | 'bold' | 'clean'

export interface AppendedClip {
  videoUrl: string
  durationSeconds: number
  fromFrame: number
  overlayConfig?: OverlayConfig  // sibling's hook/captions/CTA for round-trip
}

/** Persisted state of a video clip on the timeline (captures cuts/trims/splits) */
export interface VideoClipEdit {
  videoUrl: string
  fromFrame: number           // timeline position
  durationFrames: number      // timeline duration (may differ from source)
  videoStartTime?: number     // source trim offset (seconds into source video)
  speed?: number
  segments?: Array<{ startFrame: number; endFrame: number; speed?: number }>
  mediaSrcDuration?: number   // total source file duration in seconds
  volume?: number
}

export interface OverlayConfig {
  hook?: HookOverlay
  captions?: CaptionOverlay[]
  cta?: CTAOverlay
  graphics?: GraphicOverlay[]
  endCard?: EndCardOverlay
  style: OverlayStyle
  brandColor?: string
  accentColor?: string
  voiceoverUrl?: string
  appendedClips?: AppendedClip[]
  videoClips?: VideoClipEdit[]  // persisted video clip edits (cuts/trims/splits)
}

// Full props passed to the Remotion composition
export interface AdOverlayProps {
  videoUrl: string
  durationInSeconds: number
  overlayConfig: OverlayConfig
  trimStartSec?: number
  trimEndSec?: number
}

// Video composition (multi-clip timeline)
export interface VideoComposition {
  id: string
  canvasId: string
  sourceJobIds: string[]
  overlayConfig: OverlayConfig
  title: string
  thumbnailUrl?: string
  durationSeconds: number
  createdAt: string
}

// Video styles for the prompt builder
export const VIDEO_STYLES = [
  { id: 'talking_head', label: 'Talking Head', description: 'Person speaking to camera about the product', icon: '🎤' },
  { id: 'lifestyle', label: 'Lifestyle', description: 'Product in natural use, warm authentic moments', icon: '🌅' },
  { id: 'product_showcase', label: 'Product Showcase', description: 'Hero shots, close-ups, dramatic lighting', icon: '✨' },
  { id: 'interview', label: 'Interview', description: 'Testimonial feel, two-angle setup', icon: '🎙️' },
  { id: 'unboxing', label: 'Unboxing', description: 'Opening package, first impressions reveal', icon: '📦' },
  { id: 'before_after', label: 'Before/After', description: 'Transformation reveal, dramatic difference', icon: '🔄' },
  { id: 'testimonial', label: 'Testimonial', description: 'Customer endorsement, casual authentic delivery', icon: '💬' },
  { id: 'b_roll', label: 'B-Roll', description: 'Cinematic atmospheric footage, mood-setting', icon: '🎬' },
] as const

export type VideoStyle = typeof VIDEO_STYLES[number]['id']

// Prompt sections for the guided prompt builder
export interface PromptSections {
  scene: string
  subject: string
  action: string
  product: string
  mood: string
}

// Video generation job (matches DB schema)
export interface VideoJob {
  id: string
  user_id: string
  ad_account_id: string
  session_id?: string
  prompt: string
  video_style: string
  duration_seconds: number
  status: 'queued' | 'generating' | 'extending' | 'rendering' | 'complete' | 'failed'
  progress_pct: number
  error_message?: string
  raw_video_url?: string
  final_video_url?: string
  thumbnail_url?: string
  ad_index?: number
  credit_cost: number
  overlay_config?: OverlayConfig
  provider?: string
  target_duration_seconds?: number
  extension_step?: number
  extension_total?: number
  created_at: string
  updated_at: string
}
