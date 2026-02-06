import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import type { VideoAnalysis, ScriptSuggestion } from '@/components/creative-studio/types'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '')
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_GEMINI_API_KEY || '')

const CREATIVE_STRATEGIST_PROMPT = `You are an expert video ad creative strategist. You analyze video ads to identify what makes them effective at each stage of the viewer journey.

YOUR EXPERTISE:
- Hook (0-3 seconds): Pattern interrupts, curiosity gaps, unexpected visuals, bold claims, thumb-stopping moments
- Hold (3-15+ seconds): Story structure, pacing, visual variety, audio design, emotional beats, information density
- Click (throughout): CTA placement and clarity, urgency triggers, benefit statements, social proof integration
- Convert (overall): Trust signals, objection handling, offer clarity, landing page alignment

ANALYSIS APPROACH:
1. First, transcribe the full audio/dialogue
2. Analyze the video through the lens of a viewer scrolling their feed
3. Identify specific TECHNIQUES used at each funnel stage
4. Reference exact timestamps and quote transcript sections
5. Consider the apparent target audience
6. Be specific and actionable - not vague praise or criticism

CREATIVE STYLES YOU IDENTIFY:
- UGC (user-generated content): Authentic, phone-shot, relatable
- Founder/CEO story: Personal brand, origin story, mission-driven
- Problem-Agitate-Solve: Classic direct response structure
- Testimonial/social proof: Customer voices and results
- Product demo: Feature showcase, how-it-works
- Lifestyle/aspirational: Emotional connection to outcomes
- Educational/value-first: Teaching before selling

SCORING (0-100):
- 90-100: Exceptional - would study this as a reference
- 75-89: Strong - clear wins with minor improvements possible
- 50-74: Average - functional but not optimized
- 25-49: Weak - significant issues holding it back
- 0-24: Poor - fundamental creative problems

RULES:
1. Be direct and honest - creators want real feedback, not validation
2. Reference specific timestamps ("at 0:04...") and quote the transcript
3. Every weakness MUST have an actionable fix
4. Consider the performance data if provided (high-converting ugly ads are still working)
5. Script suggestions should be immediately usable with specific copy

RESPONSE FORMAT:
Return valid JSON matching the schema. Include 2-3 script suggestions that take different creative approaches while keeping the core offer.`

function buildAnalysisPrompt(performanceContext?: string): string {
  let prompt = CREATIVE_STRATEGIST_PROMPT

  if (performanceContext) {
    prompt += `\n\nPERFORMANCE CONTEXT:\n${performanceContext}`
  }

  prompt += `\n\nRespond ONLY with valid JSON matching this exact structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence overview>",
  "transcript": "<full transcription>",
  "duration": <number in seconds>,
  "hook": {
    "score": <number 0-100>,
    "timestamp": "<e.g. 0:00-0:03>",
    "assessment": "<what's working/not working>",
    "elements": ["<technique1>", "<technique2>"],
    "improvement": "<specific actionable suggestion>"
  },
  "hold": {
    "score": <number 0-100>,
    "assessment": "<what's working/not working>",
    "elements": ["<technique1>", "<technique2>"],
    "improvement": "<specific actionable suggestion>"
  },
  "click": {
    "score": <number 0-100>,
    "assessment": "<what's working/not working>",
    "elements": ["<technique1>", "<technique2>"],
    "improvement": "<specific actionable suggestion>"
  },
  "convert": {
    "score": <number 0-100>,
    "assessment": "<what's working/not working>",
    "elements": ["<technique1>", "<technique2>"],
    "improvement": "<specific actionable suggestion>"
  },
  "speakerStyle": "<talking_head|voiceover|text_only|mixed|none>",
  "visualStyle": "<ugc|polished|product_demo|lifestyle|mixed>",
  "emotionalTone": "<e.g. urgent, aspirational, educational>",
  "keyMessages": ["<message1>", "<message2>"],
  "targetAudience": "<inferred target audience>",
  "topStrength": "<single biggest strength>",
  "topWeakness": "<single biggest weakness>",
  "quickWins": ["<easy improvement 1>", "<easy improvement 2>"],
  "scriptSuggestions": [
    {
      "title": "<e.g. Variation A: Problem-Agitate-Solve>",
      "approach": "<brief description of the angle>",
      "script": {
        "hook": "<first 3 seconds with visual direction>",
        "body": "<main content>",
        "cta": "<call to action>"
      },
      "estimatedDuration": "<e.g. 30 seconds>",
      "whyItWorks": "<explanation of the approach>"
    }
  ]
}`

  return prompt
}

export async function analyzeVideo(
  videoUrl: string,
  performanceContext?: string
): Promise<{ analysis: VideoAnalysis; scripts: ScriptSuggestion[] }> {
  // Use gemini-2.0-flash for video analysis (supports multimodal, fast, cost-effective)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const prompt = buildAnalysisPrompt(performanceContext)

  // Gemini requires files to be uploaded via File API, not external URLs
  // 1. Download video from Supabase
  console.log('[Gemini] Downloading video from:', videoUrl)
  const videoResponse = await fetch(videoUrl)
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.status}`)
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

  // 2. Save to temp file (Gemini SDK requires file path)
  const tempPath = join(tmpdir(), `video-analysis-${Date.now()}.mp4`)
  writeFileSync(tempPath, videoBuffer)
  console.log('[Gemini] Saved temp file:', tempPath, 'Size:', videoBuffer.length)

  try {
    // 3. Upload to Gemini File API
    console.log('[Gemini] Uploading to File API...')
    const uploadResult = await fileManager.uploadFile(tempPath, {
      mimeType: 'video/mp4',
      displayName: `video-${Date.now()}`,
    })
    console.log('[Gemini] Upload complete. File URI:', uploadResult.file.uri)

    // 4. Wait for file to be processed (videos need processing time)
    let file = uploadResult.file
    while (file.state === 'PROCESSING') {
      console.log('[Gemini] File processing... waiting 2s')
      await new Promise(resolve => setTimeout(resolve, 2000))
      const getResult = await fileManager.getFile(file.name)
      file = getResult
    }

    if (file.state === 'FAILED') {
      throw new Error('Gemini file processing failed')
    }
    console.log('[Gemini] File ready. State:', file.state)

    // 5. Run analysis with the uploaded file
    const result = await model.generateContent([
      prompt,
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: file.uri
        }
      }
    ])

    const responseText = result.response.text()
    console.log('[Gemini] Got response, length:', responseText.length)

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)

    // Separate scripts from analysis
    const scripts: ScriptSuggestion[] = parsed.scriptSuggestions || []
    delete parsed.scriptSuggestions

    // 6. Clean up: delete file from Gemini (optional, they auto-expire)
    try {
      await fileManager.deleteFile(file.name)
      console.log('[Gemini] Deleted file from Gemini')
    } catch (e) {
      // Ignore cleanup errors
    }

    return {
      analysis: parsed as VideoAnalysis,
      scripts
    }
  } finally {
    // Always clean up temp file
    try {
      unlinkSync(tempPath)
      console.log('[Gemini] Deleted temp file')
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

export function buildPerformanceContext(perfData: any[]): string {
  if (!perfData || perfData.length === 0) return ''

  const totals = perfData.reduce((acc, row) => ({
    spend: acc.spend + (parseFloat(row.spend) || 0),
    revenue: acc.revenue + (parseFloat(row.revenue) || 0),
    impressions: acc.impressions + (parseInt(row.impressions) || 0),
    clicks: acc.clicks + (parseInt(row.clicks) || 0),
    videoViews: acc.videoViews + (parseInt(row.video_views) || 0),
    videoThruplay: acc.videoThruplay + (parseInt(row.video_thruplay) || 0),
  }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, videoViews: 0, videoThruplay: 0 })

  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : '0'
  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0'
  const thumbstopRate = totals.impressions > 0 ? ((totals.videoViews / totals.impressions) * 100).toFixed(1) : '0'
  const holdRate = totals.videoViews > 0 ? ((totals.videoThruplay / totals.videoViews) * 100).toFixed(1) : '0'

  return `This video has been running in ads with the following performance:
- Total Spend: $${totals.spend.toFixed(2)}
- ROAS: ${roas}x
- CTR: ${ctr}%
- Thumbstop Rate: ${thumbstopRate}%
- Hold Rate (ThruPlay): ${holdRate}%

Consider this performance data when analyzing. A video with great metrics may have effective elements worth preserving, even if the creative quality seems rough.`
}
