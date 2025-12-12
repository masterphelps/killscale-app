import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string
    const adAccountId = formData.get('adAccountId') as string

    if (!file || !userId || !adAccountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Meta account not connected' }, { status: 401 })
    }

    // Check token expiry
    if (new Date(connection.token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired, please reconnect' }, { status: 401 })
    }

    const accessToken = connection.access_token

    // Strip 'act_' prefix if already present (avoid act_act_ issue)
    const cleanAdAccountId = adAccountId.replace(/^act_/, '')

    // Determine if it's an image or video
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')

    if (!isVideo && !isImage) {
      return NextResponse.json({ error: 'Invalid file type. Must be image or video.' }, { status: 400 })
    }

    if (isImage) {
      // Upload image to Meta
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const base64 = buffer.toString('base64')

      const uploadUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/adimages`

      const uploadFormData = new FormData()
      uploadFormData.append('access_token', accessToken)
      uploadFormData.append('bytes', base64)
      uploadFormData.append('name', file.name)

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: uploadFormData
      })

      const result = await response.json()

      if (result.error) {
        console.error('Meta API error:', result.error)
        return NextResponse.json({
          error: result.error.message || 'Failed to upload image'
        }, { status: 400 })
      }

      // Extract image hash from response
      // Response format: { images: { [filename]: { hash: "..." } } }
      const images = result.images
      const imageData = images ? Object.values(images)[0] as { hash: string } : null

      if (!imageData?.hash) {
        return NextResponse.json({ error: 'Failed to get image hash' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        type: 'image',
        imageHash: imageData.hash,
        fileName: file.name
      })

    } else {
      // Video upload - use chunked upload for larger files
      const MAX_VIDEO_SIZE = 1024 * 1024 * 1024 // 1GB max
      const CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks
      const SIMPLE_UPLOAD_THRESHOLD = 50 * 1024 * 1024 // Use simple upload for files under 50MB

      if (file.size > MAX_VIDEO_SIZE) {
        return NextResponse.json({
          error: 'Video too large. Please use videos under 1GB.'
        }, { status: 400 })
      }

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      const baseUrl = `https://graph.facebook.com/v18.0/act_${cleanAdAccountId}/advideos`
      let result

      if (file.size <= SIMPLE_UPLOAD_THRESHOLD) {
        // Simple upload for small videos
        const videoFormData = new FormData()
        videoFormData.append('access_token', accessToken)
        videoFormData.append('title', file.name)
        videoFormData.append('source', new Blob([buffer], { type: file.type }), file.name)

        const response = await fetch(baseUrl, {
          method: 'POST',
          body: videoFormData
        })

        const responseText = await response.text()

        try {
          result = JSON.parse(responseText)
        } catch {
          return NextResponse.json({
            error: `Meta API returned invalid response (status ${response.status})`
          }, { status: 500 })
        }
      } else {
        // Chunked upload for larger videos
        // Step 1: Start upload session
        const startParams = new URLSearchParams({
          access_token: accessToken,
          upload_phase: 'start',
          file_size: file.size.toString()
        })

        const startResponse = await fetch(`${baseUrl}?${startParams}`, { method: 'POST' })
        const startText = await startResponse.text()

        let startResult
        try {
          startResult = JSON.parse(startText)
        } catch {
          return NextResponse.json({
            error: `Failed to start video upload (status ${startResponse.status})`
          }, { status: 500 })
        }

        if (startResult.error) {
          console.error('Start upload error:', startResult.error)
          return NextResponse.json({
            error: startResult.error.message || 'Failed to start video upload'
          }, { status: 400 })
        }

        const uploadSessionId = startResult.upload_session_id
        const videoId = startResult.video_id  // Capture video ID from start response
        let startOffset = parseInt(startResult.start_offset)

        // Step 2: Transfer chunks
        while (startOffset < buffer.length) {
          const chunkEnd = Math.min(startOffset + CHUNK_SIZE, buffer.length)
          const chunk = buffer.slice(startOffset, chunkEnd)

          const chunkFormData = new FormData()
          chunkFormData.append('access_token', accessToken)
          chunkFormData.append('upload_phase', 'transfer')
          chunkFormData.append('upload_session_id', uploadSessionId)
          chunkFormData.append('start_offset', startOffset.toString())
          chunkFormData.append('video_file_chunk', new Blob([chunk], { type: file.type }), 'chunk')

          const chunkResponse = await fetch(baseUrl, {
            method: 'POST',
            body: chunkFormData
          })

          const chunkText = await chunkResponse.text()

          let chunkResult
          try {
            chunkResult = JSON.parse(chunkText)
          } catch {
            return NextResponse.json({
              error: `Failed to upload video chunk (status ${chunkResponse.status})`
            }, { status: 500 })
          }

          if (chunkResult.error) {
            console.error('Chunk upload error:', chunkResult.error)
            return NextResponse.json({
              error: chunkResult.error.message || 'Failed to upload video chunk'
            }, { status: 400 })
          }

          startOffset = parseInt(chunkResult.start_offset)
        }

        // Step 3: Finish upload
        const finishParams = new URLSearchParams({
          access_token: accessToken,
          upload_phase: 'finish',
          upload_session_id: uploadSessionId,
          title: file.name
        })

        const finishResponse = await fetch(`${baseUrl}?${finishParams}`, { method: 'POST' })
        const finishText = await finishResponse.text()

        try {
          result = JSON.parse(finishText)
          // For chunked uploads, add the video_id from the start response
          result.id = videoId
        } catch {
          return NextResponse.json({
            error: `Failed to finish video upload (status ${finishResponse.status})`
          }, { status: 500 })
        }
      }

      if (result.error) {
        console.error('Meta API error:', result.error)
        return NextResponse.json({
          error: result.error.message || 'Failed to upload video'
        }, { status: 400 })
      }

      if (!result.id) {
        return NextResponse.json({ error: 'Failed to get video ID' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        type: 'video',
        videoId: result.id,
        fileName: file.name
      })
    }

  } catch (err) {
    console.error('Upload creative error:', err)
    return NextResponse.json({ error: 'Failed to upload creative' }, { status: 500 })
  }
}

