/**
 * Simple media filter preset interface
 * Replaces the complex external filter preset system
 */
export interface MediaFilterPreset {
  id: string;
  name: string;
  filter: string;
  description?: string;
}

/**
 * Default media filter presets
 * Users can override these or provide their own
 */
export const defaultMediaFilterPresets: MediaFilterPreset[] = [
  {
    id: 'none',
    name: 'None',
    filter: 'none',
    description: 'No filter applied'
  },
  {
    id: 'vintage',
    name: 'Vintage',
    filter: 'sepia(0.8) contrast(1.2) brightness(1.1) saturate(0.8)',
    description: 'Warm vintage look'
  },
  {
    id: 'noir',
    name: 'Film Noir',
    filter: 'grayscale(1) contrast(1.3) brightness(0.9)',
    description: 'Classic black and white'
  },
  {
    id: 'retro',
    name: 'Retro',
    filter: 'contrast(1.4) saturate(1.8) hue-rotate(10deg) brightness(1.1)',
    description: 'Bold retro colors'
  },
  {
    id: 'cool',
    name: 'Cool',
    filter: 'hue-rotate(180deg) saturate(1.2) brightness(1.05)',
    description: 'Cool blue tones'
  },
  {
    id: 'warm',
    name: 'Warm',
    filter: 'hue-rotate(30deg) saturate(1.3) brightness(1.1) contrast(1.1)',
    description: 'Warm orange tones'
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    filter: 'contrast(1.5) brightness(0.9) saturate(1.4) drop-shadow(2px 2px 4px rgba(0,0,0,0.3))',
    description: 'High contrast dramatic look'
  },
  {
    id: 'soft',
    name: 'Soft',
    filter: 'brightness(1.1) contrast(0.9) saturate(0.9) blur(0.5px)',
    description: 'Soft dreamy effect'
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    filter: 'saturate(1.6) contrast(1.2) brightness(1.05)',
    description: 'Enhanced colors'
  },
  {
    id: 'faded',
    name: 'Faded',
    filter: 'brightness(1.2) contrast(0.8) saturate(0.7) opacity(0.9)',
    description: 'Faded film look'
  }
];

/**
 * Props interface for media filter components
 */
export interface MediaFilterProps {
  presets?: MediaFilterPreset[];
  selectedPreset?: string;
  onPresetSelect?: (presetId: string) => void;
  customFilter?: string;
  onCustomFilterChange?: (filter: string) => void;
} 