import { SoundOverlayAdaptor } from '../types/overlay-adaptors';
import { StandardAudio } from '../types/media-adaptors';

// Default audio tracks - using the user's examples
const defaultAudioTracks: StandardAudio[] = [
  {
    id: "pixabay-1",
    title: "Upbeat Corporate",
    artist: "Pixabay",
    duration: 15, // duration in seconds
    file: "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-1.mp3?t=2024-11-04T03%3A52%3A06.297Z",
  },
  {
    id: "pixabay-2",
    title: "Inspiring Cinematic",
    artist: "Pixabay",
    duration: 15,
    file: "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-2.mp3?t=2024-11-04T03%3A52%3A27.497Z",
  },
  {
    id: "pixabay-3",
    title: "Another Lowfi",
    artist: "Pixabay",
    duration: 15,
    file: "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-3.mp3?t=2024-11-04T03%3A52%3A35.101Z",
  },
];

/**
 * Creates a static audio adaptor from a list of audio tracks
 * Useful for providing predefined audio collections
 */
export const createStaticAudioAdaptor = (audioList: StandardAudio[], displayName: string = 'Stock Audio'): SoundOverlayAdaptor => ({
  name: 'static-audio',
  displayName,
  description: 'Static collection of audio tracks',
  requiresAuth: false,
  
  search: async (params) => {
    // Filter the static list based on search query (if provided)
    let filtered = audioList;
    
    if (params.query && params.query.trim()) {
      const query = params.query.toLowerCase();
      filtered = audioList.filter(audio => 
        audio.title.toLowerCase().includes(query) ||
        audio.artist.toLowerCase().includes(query)
      );
    }
    
    // Handle pagination
    const page = params.page || 1;
    const perPage = params.perPage || 50;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);
    
    return {
      items: paginatedItems,
      totalCount: filtered.length,
      hasMore: endIndex < filtered.length
    };
  },
  
  getAudioUrl: (audio) => audio.file
});

/**
 * Default audio adaptor with stock audio tracks
 * Automatically included when no audio adaptors are configured
 */
export const defaultAudioAdaptor = createStaticAudioAdaptor(defaultAudioTracks, 'Default Audio');

/**
 * Helper function to get default audio adaptors
 * This provides a consistent way to include default audio content
 */
export const getDefaultAudioAdaptors = (): SoundOverlayAdaptor[] => {
  return [defaultAudioAdaptor];
}; 