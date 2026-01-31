// Direct-to-Meta upload utilities
// Uploads files directly to Meta's Graph API, bypassing our server

import { META_GRAPH_URL } from '@/lib/meta-api'

export interface UploadResult {
  success: boolean
  type: 'image' | 'video'
  imageHash?: string
  videoId?: string
  thumbnailUrl?: string  // Auto-generated thumbnail for videos
  thumbnailHash?: string  // Uploaded thumbnail image hash (more reliable)
  error?: string
}

const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks for video uploads
const SIMPLE_UPLOAD_THRESHOLD = 50 * 1024 * 1024 // Use simple upload for videos under 50MB

/**
 * Upload an image directly to Meta's Ad Account
 */
export async function uploadImageToMeta(
  file: File,
  accessToken: string,
  adAccountId: string
): Promise<UploadResult> {
  try {
    // Convert file to base64
    const base64 = await fileToBase64(file)

    const uploadUrl = `${META_GRAPH_URL}/act_${adAccountId}/adimages`

    const formData = new FormData()
    formData.append('access_token', accessToken)
    formData.append('bytes', base64)
    formData.append('name', file.name)

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    })

    const result = await response.json()

    if (result.error) {
      console.error('Meta image upload error:', result.error)
      return {
        success: false,
        type: 'image',
        error: result.error.message || 'Failed to upload image'
      }
    }

    // Extract image hash from response
    // Response format: { images: { [filename]: { hash: "..." } } }
    const images = result.images
    const imageData = images ? Object.values(images)[0] as { hash: string } : null

    if (!imageData?.hash) {
      return {
        success: false,
        type: 'image',
        error: 'Failed to get image hash from Meta'
      }
    }

    return {
      success: true,
      type: 'image',
      imageHash: imageData.hash
    }
  } catch (err) {
    console.error('Image upload error:', err)
    return {
      success: false,
      type: 'image',
      error: err instanceof Error ? err.message : 'Upload failed'
    }
  }
}

/**
 * Generate a thumbnail from a video file by extracting a frame
 * Returns a Blob that can be uploaded as an image
 */
async function generateVideoThumbnail(videoFile: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const videoUrl = URL.createObjectURL(videoFile)
    let resolved = false

    const cleanup = () => {
      if (!resolved) {
        resolved = true
        URL.revokeObjectURL(videoUrl)
      }
    }

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      console.warn('Thumbnail generation timed out for:', videoFile.name)
      cleanup()
      resolve(null)
    }, 10000)

    video.muted = true
    video.playsInline = true
    video.preload = 'auto' // Load more than just metadata
    video.crossOrigin = 'anonymous'

    const captureFrame = () => {
      // Ensure video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('Video has no dimensions yet')
        cleanup()
        clearTimeout(timeout)
        resolve(null)
        return
      }

      // Set canvas size (max 1280px wide)
      const scale = Math.min(1, 1280 / video.videoWidth)
      canvas.width = video.videoWidth * scale
      canvas.height = video.videoHeight * scale

      console.log(`Capturing frame for ${videoFile.name}: ${canvas.width}x${canvas.height}`)

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Check if canvas is not all black by sampling some pixels
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        let nonBlackPixels = 0
        for (let i = 0; i < data.length; i += 40) { // Sample every 10th pixel
          if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) {
            nonBlackPixels++
          }
        }

        if (nonBlackPixels < 100) {
          console.warn('Frame appears mostly black, but using anyway')
        }

        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout)
            cleanup()
            console.log(`Thumbnail generated for ${videoFile.name}: ${blob?.size} bytes`)
            resolve(blob)
          },
          'image/jpeg',
          0.85
        )
      } else {
        clearTimeout(timeout)
        cleanup()
        resolve(null)
      }
    }

    video.onloadeddata = () => {
      // Video has enough data to show current frame
      // Seek to 2 seconds or 25% of video, whichever is smaller
      const seekTime = Math.min(2, video.duration * 0.25)
      console.log(`Video loaded for ${videoFile.name}, seeking to ${seekTime}s`)
      video.currentTime = seekTime
    }

    video.onseeked = () => {
      // Wait a brief moment for the frame to fully render
      setTimeout(captureFrame, 100)
    }

    video.onerror = (e) => {
      console.error('Failed to load video for thumbnail:', videoFile.name, e)
      clearTimeout(timeout)
      cleanup()
      resolve(null)
    }

    // Load the video
    video.src = videoUrl
    video.load() // Explicitly trigger load
  })
}

/**
 * Upload a thumbnail image and return its hash
 */
async function uploadThumbnailToMeta(
  thumbnailBlob: Blob,
  accessToken: string,
  adAccountId: string,
  videoFileName: string
): Promise<string | undefined> {
  try {
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(thumbnailBlob)
    })

    const uploadUrl = `${META_GRAPH_URL}/act_${adAccountId}/adimages`

    const formData = new FormData()
    formData.append('access_token', accessToken)
    formData.append('bytes', base64)
    formData.append('name', `${videoFileName}_thumbnail.jpg`)

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    })

    const result = await response.json()

    if (result.error) {
      console.error('Thumbnail upload error:', result.error)
      return undefined
    }

    // Extract image hash from response
    const images = result.images
    const imageData = images ? Object.values(images)[0] as { hash: string } : null

    if (imageData?.hash) {
      console.log('Thumbnail uploaded with hash:', imageData.hash)
      return imageData.hash
    }

    return undefined
  } catch (err) {
    console.error('Thumbnail upload failed:', err)
    return undefined
  }
}

/**
 * Fetch video thumbnail from Meta after upload
 * Retries with delay since thumbnails may not be immediately available
 */
async function fetchVideoThumbnail(
  videoId: string,
  accessToken: string,
  maxRetries = 3,
  delayMs = 2000
): Promise<string | undefined> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait before each attempt (thumbnails need processing time)
      if (attempt > 1) {
        console.log(`Thumbnail fetch attempt ${attempt}/${maxRetries}, waiting ${delayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }

      const response = await fetch(
        `${META_GRAPH_URL}/${videoId}?fields=thumbnails&access_token=${accessToken}`
      )
      const result = await response.json()

      console.log(`Thumbnail fetch attempt ${attempt} result:`, JSON.stringify(result, null, 2))

      if (result.error) {
        console.error('Thumbnail fetch error:', result.error)
        continue
      }

      if (result.thumbnails?.data?.length > 0) {
        // Get the largest thumbnail
        const thumbnails = result.thumbnails.data.sort(
          (a: { width: number }, b: { width: number }) => (b.width || 0) - (a.width || 0)
        )
        const thumbnailUrl = thumbnails[0].uri
        console.log('Got thumbnail URL:', thumbnailUrl)
        return thumbnailUrl
      }

      console.log('No thumbnails available yet, retrying...')
    } catch (err) {
      console.error(`Thumbnail fetch attempt ${attempt} failed:`, err)
    }
  }

  console.warn('Failed to fetch thumbnail after all retries')
  return undefined
}

/**
 * Upload a video directly to Meta's Ad Account
 * Uses simple upload for small videos, chunked upload for large ones
 * Also generates and uploads a thumbnail for reliable ad creation
 */
export async function uploadVideoToMeta(
  file: File,
  accessToken: string,
  adAccountId: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  try {
    const baseUrl = `${META_GRAPH_URL}/act_${adAccountId}/advideos`

    // Step 1: Generate thumbnail from video (5% of progress)
    onProgress?.(2)
    console.log('Generating thumbnail from video...')
    const thumbnailBlob = await generateVideoThumbnail(file)

    // Step 2: Upload thumbnail if generated (10% of progress)
    let thumbnailHash: string | undefined
    if (thumbnailBlob) {
      onProgress?.(5)
      console.log('Uploading thumbnail image...')
      thumbnailHash = await uploadThumbnailToMeta(thumbnailBlob, accessToken, adAccountId, file.name)
      if (thumbnailHash) {
        console.log('Thumbnail uploaded successfully:', thumbnailHash)
      }
    } else {
      console.warn('Could not generate thumbnail from video')
    }

    onProgress?.(10)

    // Step 3: Upload video (10-95% of progress)
    let result: UploadResult

    // Adjust progress callback to account for thumbnail phase
    const videoProgress = (progress: number) => {
      // Map 0-100 to 10-95
      onProgress?.(10 + Math.round(progress * 0.85))
    }

    if (file.size <= SIMPLE_UPLOAD_THRESHOLD) {
      // Simple upload for small videos
      result = await simpleVideoUpload(file, accessToken, baseUrl, videoProgress)
    } else {
      // Chunked upload for large videos
      result = await chunkedVideoUpload(file, accessToken, baseUrl, videoProgress)
    }

    // Add thumbnail hash to result
    if (result.success && thumbnailHash) {
      result.thumbnailHash = thumbnailHash
      console.log('Video upload complete with thumbnail hash:', thumbnailHash)
    }

    // Also try to get Meta's thumbnail URL as fallback
    if (result.success && result.videoId && !thumbnailHash) {
      console.log('No custom thumbnail, trying Meta auto-generated...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      const thumbnailUrl = await fetchVideoThumbnail(result.videoId, accessToken, 2, 1500)
      if (thumbnailUrl) {
        result.thumbnailUrl = thumbnailUrl
      }
    }

    onProgress?.(100)
    return result
  } catch (err) {
    console.error('Video upload error:', err)
    return {
      success: false,
      type: 'video',
      error: err instanceof Error ? err.message : 'Upload failed'
    }
  }
}

/**
 * Convert a File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Simple video upload for files under 50MB
 */
async function simpleVideoUpload(
  file: File,
  accessToken: string,
  baseUrl: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  onProgress?.(10) // Starting upload

  const formData = new FormData()
  formData.append('access_token', accessToken)
  formData.append('title', file.name)
  formData.append('source', file, file.name)

  onProgress?.(30) // Uploading

  const response = await fetch(baseUrl, {
    method: 'POST',
    body: formData
  })

  onProgress?.(90) // Processing

  const result = await response.json()

  if (result.error) {
    console.error('Meta video upload error:', result.error)
    return {
      success: false,
      type: 'video',
      error: result.error.message || 'Failed to upload video'
    }
  }

  if (!result.id) {
    return {
      success: false,
      type: 'video',
      error: 'Failed to get video ID from Meta'
    }
  }

  onProgress?.(100)

  return {
    success: true,
    type: 'video',
    videoId: result.id
  }
}

/**
 * Chunked video upload for files over 50MB
 * Uses Meta's resumable upload protocol
 */
async function chunkedVideoUpload(
  file: File,
  accessToken: string,
  baseUrl: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  // Step 1: Start upload session
  onProgress?.(2)

  const startParams = new URLSearchParams({
    access_token: accessToken,
    upload_phase: 'start',
    file_size: file.size.toString()
  })

  const startResponse = await fetch(`${baseUrl}?${startParams}`, { method: 'POST' })
  const startResult = await startResponse.json()

  if (startResult.error) {
    console.error('Start upload error:', startResult.error)
    return {
      success: false,
      type: 'video',
      error: startResult.error.message || 'Failed to start video upload'
    }
  }

  const uploadSessionId = startResult.upload_session_id
  const videoId = startResult.video_id
  let startOffset = parseInt(startResult.start_offset)

  onProgress?.(5)

  // Step 2: Transfer chunks
  const totalSize = file.size
  let uploadedBytes = 0

  while (startOffset < totalSize) {
    const chunkEnd = Math.min(startOffset + CHUNK_SIZE, totalSize)
    const chunk = file.slice(startOffset, chunkEnd)

    const chunkFormData = new FormData()
    chunkFormData.append('access_token', accessToken)
    chunkFormData.append('upload_phase', 'transfer')
    chunkFormData.append('upload_session_id', uploadSessionId)
    chunkFormData.append('start_offset', startOffset.toString())
    chunkFormData.append('video_file_chunk', chunk, 'chunk')

    const chunkResponse = await fetch(baseUrl, {
      method: 'POST',
      body: chunkFormData
    })

    const chunkResult = await chunkResponse.json()

    if (chunkResult.error) {
      console.error('Chunk upload error:', chunkResult.error)
      return {
        success: false,
        type: 'video',
        error: chunkResult.error.message || 'Failed to upload video chunk'
      }
    }

    uploadedBytes = chunkEnd
    startOffset = parseInt(chunkResult.start_offset)

    // Update progress (reserve 5% for start and 5% for finish)
    const uploadProgress = 5 + Math.round((uploadedBytes / totalSize) * 90)
    onProgress?.(uploadProgress)
  }

  // Step 3: Finish upload
  onProgress?.(95)

  const finishParams = new URLSearchParams({
    access_token: accessToken,
    upload_phase: 'finish',
    upload_session_id: uploadSessionId,
    title: file.name
  })

  const finishResponse = await fetch(`${baseUrl}?${finishParams}`, { method: 'POST' })
  const finishResult = await finishResponse.json()

  if (finishResult.error) {
    console.error('Finish upload error:', finishResult.error)
    return {
      success: false,
      type: 'video',
      error: finishResult.error.message || 'Failed to finish video upload'
    }
  }

  onProgress?.(100)

  return {
    success: true,
    type: 'video',
    videoId: videoId
  }
}
