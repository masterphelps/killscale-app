import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VOICEOVER_CREDIT_COST = 5

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
type Voice = typeof VALID_VOICES[number]

export async function POST(request: NextRequest) {
  try {
    const { jobId, userId, voice, scriptText } = await request.json()

    if (!jobId || !userId) {
      return NextResponse.json({ error: 'jobId and userId required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const selectedVoice: Voice = VALID_VOICES.includes(voice) ? voice : 'onyx'

    // Fetch job for metadata (ad_account_id for storage path)
    const { data: job, error: jobError } = await supabase
      .from('video_generation_jobs')
      .select('id, user_id, ad_account_id, overlay_config')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Use client-provided scriptText (live editor captions) if available,
    // otherwise fall back to DB overlay_config captions
    let narrationText = ''

    if (scriptText && typeof scriptText === 'string' && scriptText.trim()) {
      narrationText = scriptText.trim()
    } else {
      const overlayConfig = job.overlay_config || {}
      if (overlayConfig.captions && overlayConfig.captions.length > 0) {
        narrationText = overlayConfig.captions.map((c: { text: string }) => c.text).join('. ')
      }
      // Fallback: try hook text if no captions
      if (!narrationText.trim() && overlayConfig.hook) {
        const hook = overlayConfig.hook
        narrationText = hook.line2 ? `${hook.line1}. ${hook.line2}` : hook.line1
      }
    }

    if (!narrationText.trim()) {
      return NextResponse.json({ error: 'No script text found for voiceover' }, { status: 400 })
    }

    // Deduct credits
    await supabase.from('ai_generation_usage').insert({
      user_id: userId,
      generation_type: 'voiceover',
      credit_cost: VOICEOVER_CREDIT_COST,
      generation_label: 'TTS Voiceover',
    })

    // Generate TTS audio via OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: selectedVoice,
      input: narrationText,
      response_format: 'mp3',
    })

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer())

    // Upload to Supabase Storage
    const cleanAccountId = job.ad_account_id.replace(/^act_/, '')
    const storagePath = `${userId}/${cleanAccountId}/voiceovers/${jobId}.mp3`

    const { error: uploadError } = await supabase
      .storage
      .from('media')
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      })

    if (uploadError) {
      console.error('[GenerateVoiceover] Upload error:', uploadError)
      // Refund credits on failure
      await supabase.from('ai_generation_usage').insert({
        user_id: userId,
        generation_type: 'voiceover',
        credit_cost: -VOICEOVER_CREDIT_COST,
        generation_label: 'Refund: Voiceover upload failed',
      })
      return NextResponse.json({ error: 'Failed to upload voiceover' }, { status: 500 })
    }

    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath)
    const voiceoverUrl = publicUrlData?.publicUrl || null

    if (!voiceoverUrl) {
      return NextResponse.json({ error: 'Failed to get voiceover URL' }, { status: 500 })
    }

    // Update job's overlay_config with voiceoverUrl
    const existingConfig = job.overlay_config || { style: 'clean' }
    const updatedConfig = { ...existingConfig, voiceoverUrl }

    await supabase
      .from('video_generation_jobs')
      .update({
        overlay_config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    console.log(`[GenerateVoiceover] Voiceover generated for job ${jobId}: ${voiceoverUrl}`)

    return NextResponse.json({ voiceoverUrl, voice: selectedVoice })
  } catch (err) {
    console.error('[GenerateVoiceover] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
