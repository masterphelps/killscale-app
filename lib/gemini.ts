import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import type { VideoAnalysis, ScriptSuggestion } from '@/components/creative-studio/types'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CREATIVE_STRATEGIST_PROMPT,
  buildAnalysisPrompt,
  buildPerformanceContext,
} from '@/lib/prompts/video-analysis'

// Re-export so existing consumers still work
export { CREATIVE_STRATEGIST_PROMPT, buildAnalysisPrompt, buildPerformanceContext }

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '')
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_GEMINI_API_KEY || '')

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

