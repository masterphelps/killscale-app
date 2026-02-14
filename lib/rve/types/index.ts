// Define overlay types enum
export enum OverlayType {
  TEXT = "text",
  IMAGE = "image",
  SHAPE = "shape",
  VIDEO = "video",
  SOUND = "sound",
  CAPTION = "caption",
  LOCAL_DIR = "local-dir",
  STICKER = "sticker",
  TEMPLATE = "TEMPLATE",
  SETTINGS = "settings",
  AI = "ai",
}
// Base overlay properties
type BaseOverlay = {
  id: number;
  durationInFrames: number;
  from: number;
  height: number;
  row: number;
  left: number;
  top: number;
  width: number;
  isDragging: boolean;
  rotation: number;
  type: OverlayType;
};

// Base style properties
type BaseStyles = {
  opacity?: number;
  zIndex?: number;
  transform?: string;
};

// Base animation type
type AnimationConfig = {
  enter?: string;
  exit?: string;
};

// 3D layout configuration type
type Layout3DConfig = {
  layout?: string;
};

// Text overlay specific
export type TextOverlay = BaseOverlay & {
  type: OverlayType.TEXT;
  content: string;
  styles: BaseStyles & {
    fontSize: string;
    fontWeight: string;
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontStyle: string;
    textDecoration: string;
    lineHeight?: string;
    letterSpacing?: string;
    textAlign?: "left" | "center" | "right";
    textShadow?: string;
    padding?: string;
    paddingBackgroundColor?: string;
    borderRadius?: string;
    boxShadow?: string;
    background?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
    backdropFilter?: string;
    border?: string;
    animation?: AnimationConfig;
    fontSizeScale?: number; // Scale factor for font size (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
  };
};

// Shape overlay specific
export type ShapeOverlay = BaseOverlay & {
  type: OverlayType.SHAPE;
  content: string;
  styles: BaseStyles & {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    borderRadius?: string;
    boxShadow?: string;
    gradient?: string;
  };
};

// Template creator type
export type TemplateCreator = {
  name: string;
  avatar: string;
};

// Template overlay type
export interface TemplateOverlay {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: TemplateCreator;
  category: string;
  tags: string[];
  thumbnail?: string;
  duration: number;
  aspectRatio?: AspectRatio;
  overlays: Overlay[];
}

// Greenscreen removal configuration
export type GreenscreenConfig = {
  enabled: boolean;
  sensitivity?: number; // 0-255, higher = more aggressive removal (default: 100)
  threshold?: {
    red?: number; // Max red value to consider as green (default: 100)
    green?: number; // Min green value to consider as green (default: 100)
    blue?: number; // Max blue value to consider as green (default: 100)
  };
  smoothing?: number; // 0-10, edge smoothing amount (default: 0)
  spill?: number; // 0-1, green spill removal amount (default: 0)
};

export type OverlayMediaSegment = {
  startFrame: number; // ABSOLUTE source frame (inclusive)
  endFrame: number; // ABSOLUTE source frame (exclusive)
  speed?: number; // optional; default 1
};
// Clip overlay specific
export type ClipOverlay = BaseOverlay & {
  type: OverlayType.VIDEO;
  content: string;
  src: string;
  videoStartTime?: number;
  speed?: number;
  segments?: OverlayMediaSegment[]; // ordered list of source slices to play
  mediaSrcDuration?: number; // in seconds - total duration of the source media file
  greenscreen?: GreenscreenConfig; // Greenscreen removal configuration
  styles: BaseStyles & {
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
    objectPosition?: string;
    volume?: number;
    borderRadius?: string;
    filter?: string;
    boxShadow?: string;
    border?: string;
    padding?: string;
    paddingBackgroundColor?: string;
    animation?: AnimationConfig; // Using shared type
    // Crop properties
    cropEnabled?: boolean;
    cropX?: number; // Crop X position as percentage (0-100)
    cropY?: number; // Crop Y position as percentage (0-100)
    cropWidth?: number; // Crop width as percentage (0-100)
    cropHeight?: number; // Crop height as percentage (0-100)
    clipPath?: string; // Generated CSS clipPath
  };
};

// Sound overlay specific
export type SoundOverlay = BaseOverlay & {
  type: OverlayType.SOUND;
  content: string;
  src: string;
  startFromSound?: number;
  videoDurationInFrames?: number;
  mediaSrcDuration?: number; // in seconds - total duration of the source media file
  styles: BaseStyles & {
    volume?: number;
    fadeIn?: number; // Fade in duration in seconds
    fadeOut?: number; // Fade out duration in seconds
  };
};

export type StickerCategory =
  | "Shapes"
  | "Discounts"
  | "Emojis"
  | "Reviews"
  | "Default";

export type CaptionWord = {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
};

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  words: CaptionWord[];
};

// Update CaptionOverlay to include styling for highlighted words
export interface CaptionStyles {
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  textAlign: "left" | "center" | "right";
  color: string;
  backgroundColor?: string;
  background?: string;
  backdropFilter?: string;
  padding?: string;
  fontWeight?: number | string;
  letterSpacing?: string;
  textShadow?: string;
  borderRadius?: string;
  transition?: string;
  highlightStyle?: {
    backgroundColor?: string;
    color?: string;
    scale?: number;
    fontWeight?: number;
    textShadow?: string;
    padding?: string;
    borderRadius?: string;
    transition?: string;
    background?: string;
    border?: string;
    backdropFilter?: string;
  };
}

export interface CaptionOverlay extends BaseOverlay {
  type: OverlayType.CAPTION;
  captions: Caption[];
  styles?: CaptionStyles;
  template?: string;
}

// Sticker overlay specific
export type StickerOverlay = BaseOverlay & {
  type: OverlayType.STICKER;
  content: string;
  category: import("./sticker-templates").StickerCategory;
  styles: BaseStyles & {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    scale?: number;
    filter?: string;
    animation?: AnimationConfig;
  };
};

export type Overlay =
  | TextOverlay
  | ImageOverlay
  | ShapeOverlay
  | ClipOverlay
  | SoundOverlay
  | CaptionOverlay
  | StickerOverlay;

export type MainProps = {
  readonly overlays: Overlay[];
  readonly setSelectedOverlay: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  readonly selectedOverlay: number | null;
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
};

import { z } from "zod";

// Base interface for all timeline items
interface TimelineItem {
  id: string;
  start: number;
  duration: number;
  row: number;
}

// Clip specific properties
export interface Video extends TimelineItem {
  type: OverlayType.VIDEO;
  src: string;
  videoStartTime?: number;
}

// Sound specific properties
export interface Sound extends TimelineItem {
  type: OverlayType.SOUND;
  file: string;
  content: string;
  startFromSound: number;
}

// Base interface for layers
interface Layer extends TimelineItem {
  position: { x: number; y: number };
}

// Text layer specific properties
export interface TextLayer extends Layer {
  type: OverlayType.TEXT;
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  backgroundColor: string;
}

// Shape layer specific properties
export interface ShapeLayer extends Layer {
  type: OverlayType.SHAPE;
  shapeType: "rectangle" | "circle" | "triangle";
  color: string;
  size: { width: number; height: number };
}

// Image layer specific properties
export interface ImageLayer extends Layer {
  type: OverlayType.IMAGE;
  src: string;
  size: { width: number; height: number };
}

// Union type for all possible layers
export type LayerItem = TextLayer | ShapeLayer | ImageLayer;

// Union type for all timeline items
export type TimelineItemUnion = Video | Sound | LayerItem;

// Type for the selected item in the editor
export type SelectedItem = TimelineItemUnion | null;

// Zod schema for composition props

export const CompositionProps = z.object({
  overlays: z.array(z.any()), // Replace with your actual Overlay type
  durationInFrames: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  src: z.string(),
});

// Other types remain the same
export const RenderRequest = z.object({
  id: z.string(),
  inputProps: CompositionProps,
});

export const ProgressRequest = z.object({
  bucketName: z.string(),
  id: z.string(),
});

export type ProgressResponse =
  | { type: "error"; message: string }
  | { type: "progress"; progress: number }
  | { type: "done"; url: string; size: number };

// Additional types
export interface PexelsMedia {
  id: string;
  duration?: number;
  image?: string;
  video_files?: { link: string }[];
}

export interface PexelsAudio {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration: number;
}

export interface LocalSound {
  id: string;
  title: string;
  artist: string;
  file: string;
  duration: number;
}

export type LocalClip = {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  videoUrl: string;
};

export type AspectRatio = "16:9" | "1:1" | "4:5" | "9:16";

export interface TimelineRow {
  id: number;
  index: number;
}

export interface WaveformData {
  peaks: number[];
  length: number;
}

// Update EditorContextType
export interface EditorContextType {
  // ... existing context properties ...
  rows: TimelineRow[];
  addRow: () => void;
}

// Update ImageStyles interface to match ClipOverlay style pattern
/**
 * ImageStyles interface defining all the style properties available for image overlays
 *
 * @property filter - CSS filter string applying visual effects (can use presets or custom values)
 * @property borderRadius - Border radius for rounded corners
 * @property objectFit - How the image should be resized/positioned within its container
 * @property objectPosition - Positioning of the image within its container
 * @property boxShadow - CSS box-shadow property for drop shadows
 * @property border - CSS border property for image borders
 * @property animation - Enter/exit animation configuration
 * @property layout3D - 3D layout transformation configuration
 */
export interface ImageStyles extends BaseStyles {
  filter?: string;
  borderRadius?: string;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  objectPosition?: string;
  boxShadow?: string;
  border?: string;
  padding?: string;
  paddingBackgroundColor?: string;
  animation?: AnimationConfig;
  layout3D?: Layout3DConfig;
  // Crop properties
  cropEnabled?: boolean;
  cropX?: number; // Crop X position as percentage (0-100)
  cropY?: number; // Crop Y position as percentage (0-100)
  cropWidth?: number; // Crop width as percentage (0-100)
  cropHeight?: number; // Crop height as percentage (0-100)
  clipPath?: string; // Generated CSS clipPath
}

// Update ImageOverlay to match ClipOverlay pattern
export interface ImageOverlay extends BaseOverlay {
  type: OverlayType.IMAGE;
  src: string;
  content?: string; // Optional thumbnail/preview
  greenscreen?: GreenscreenConfig; // Greenscreen removal configuration
  styles: ImageStyles;
}

// Local media file interface
export interface LocalMediaFile {
  id: string;
  name: string;
  type: "video" | "image" | "audio";
  path: string;
  size: number;
  lastModified: number;
  thumbnail?: string;
  duration?: number;
}
