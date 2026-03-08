import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Veo constraints
const VEO_BASE_DURATION = 8
const VEO_EXTENSION_STEP = 7

/** Snap a raw duration to the nearest valid Veo duration (8, 15, 22, 29, ...) */
function snapToVeoDuration(rawSeconds: number): number {
  if (rawSeconds <= VEO_BASE_DURATION) return VEO_BASE_DURATION
  const extensions = Math.round((rawSeconds - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
  return VEO_BASE_DURATION + extensions * VEO_EXTENSION_STEP
}

export async function POST(request: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const body = await request.json()
    const { prompt: userPrompt, hasSourceImage } = body as {
      prompt: string
      hasSourceImage: boolean
    }

    if (!userPrompt?.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 }
      )
    }

    const prompt = `You are a video segmentation assistant for Google Veo. The user wrote a scene description. Your job is to:
1. Break it into STRUCTURED FIELDS (scene, subject, action, mood, cameraDirection) that the user can edit independently
2. Determine duration (8 or 15 seconds)
3. If 15s, split action and dialogue across base + extension
4. Generate overlay text suggestions

CRITICAL RULE — PRESERVE THE USER'S WORDS:
Do NOT rewrite, embellish, or "improve" the user's prompt. Keep their exact words, tone, pacing, and style.
Your job is to ORGANIZE the prompt into structured fields, not rewrite it.

USER'S SCENE DESCRIPTION:
"${userPrompt.trim()}"

${hasSourceImage ? 'SOURCE IMAGE: A reference image will be provided as the starting frame. The first ~1 second shows the image as a still before motion begins.' : 'NO SOURCE IMAGE: The video will be generated from text only.'}

STRUCTURED FIELDS:
- "scene": The SETTING/LOCATION — where does this take place? (e.g. "A modern kitchen with marble countertops")
- "subject": WHO or WHAT is the main focus? (e.g. "A woman in her 30s wearing an apron")
- "action": WHAT HAPPENS — the sequence of events, using the user's words (e.g. "She picks up the oat milk, pours it into her coffee, takes a sip and smiles")
- "mood": The FEELING/TONE (e.g. "Warm, inviting, morning light")
- "cameraDirection": Any CAMERA WORK implied or stated (e.g. "Close-up on pour, then pull back to reveal full scene"). Empty string if none.

These fields will be COMBINED into the final Veo prompt by the client. Do NOT duplicate information across fields.

DURATION ESTIMATION — DEFAULT TO 8 SECONDS:
8 seconds is a LOT of time for video. Most prompts fit in 8 seconds.

ONLY use 15 seconds if:
- The prompt has TWO CLEARLY SEPARATE SCENES (different locations or subjects)
- OR the dialogue has more than 20 words (~8 seconds of speech at 2.5 words/sec)

Speech CANNOT be cut mid-sentence. If dialogue is long, the video MUST extend to 15s.

NEVER use 22 or 29 seconds. Max is 15.

SEGMENTATION RULES (only if 15s):
- "action" covers the first 8 seconds
- "extensionAction" covers the next 7 seconds — MUST start with "Continue from previous shot."
- Split at the most natural breakpoint
- If dialogue extends, split at a sentence boundary into "dialogue" and "extensionDialogue"

VEO LIMITATIONS (silently work around):
- Cannot render text/words in video — move text to overlay.hook instead
- Cannot render logos
- Cause-and-effect in one segment fails — split across segments

DIALOGUE:
If the scene includes someone speaking, preserve their COMPLETE dialogue — never truncate or summarize.
If purely visual, set dialogue to "".
If 15s, split dialogue at a sentence boundary into "dialogue" (first 8s) and "extensionDialogue" (next 7s).

OUTPUT FORMAT (respond with ONLY this JSON):
{
  "scene": "Setting/location",
  "subject": "Main subject",
  "action": "What happens — user's words",
  "mood": "Tone/feeling",
  "cameraDirection": "",
  "extensionAction": "",
  "estimatedDuration": 8,
  "dialogue": "",
  "extensionDialogue": "",
  "overlay": {
    "hook": "Short hook text (MAX 6 words)",
    "cta": "CTA button text"
  }
}

NOTE: extensionAction and extensionDialogue should be EMPTY STRINGS for 8-second videos.

EXAMPLE 1 — 8 seconds:
User: "A woman walks through a garden, picks a flower, smells it, then the garden blooms around her in bright colors."
{
  "scene": "A quiet garden",
  "subject": "A woman",
  "action": "She walks through the garden, picks a flower and smells it deeply. As she opens her eyes, the entire garden erupts into bright vivid colors — flowers burst open, vines grow, everything comes alive.",
  "mood": "Magical, whimsical, colorful",
  "cameraDirection": "",
  "extensionAction": "",
  "estimatedDuration": 8,
  "dialogue": "",
  "extensionDialogue": ""
}

EXAMPLE 2 — 15 seconds (dialogue forces extension):
User: "Woman holding oat milk says: Okay so only the best is good enough huh? I swapped my whole milk for this Full Fat Oatmilk and it's literally smoother than a velvet sofa. Look—no separating in my coffee."
{
  "scene": "A bright modern kitchen",
  "subject": "A woman holding a carton of Full Fat Oatmilk",
  "action": "She holds up the oat milk carton, speaking directly to camera with enthusiasm. She pours it into her coffee.",
  "mood": "Casual, authentic, persuasive",
  "cameraDirection": "Medium shot, then close-up on the coffee pour",
  "extensionAction": "Continue from previous shot. She stirs the coffee and holds the cup up to show no separation, looking satisfied.",
  "estimatedDuration": 15,
  "dialogue": "Okay—so only the best is good enough, huh? I swapped my whole milk for this Full Fat Oatmilk and it's literally smoother than a velvet sofa.",
  "extensionDialogue": "Look—no separating in my coffee.",
  "overlay": { "hook": "Smoother Than Velvet", "cta": "Try It Now" }
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        console.error('[PlanScene] Failed to parse response:', content)
        return NextResponse.json({ error: 'Failed to parse scene plan response' }, { status: 500 })
      }
    }

    // Require at least scene + action
    if (!parsed.scene && !parsed.action) {
      console.error('[PlanScene] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid scene plan — missing scene/action' }, { status: 500 })
    }

    // Snap AI's estimated duration to Veo increments — hard cap at 15s (1 extension max)
    const rawDuration = typeof parsed.estimatedDuration === 'number' ? parsed.estimatedDuration : 8
    const cappedDuration = Math.min(rawDuration, 15) // never exceed 15s
    const targetDuration = snapToVeoDuration(cappedDuration)
    const hasExtension = targetDuration > VEO_BASE_DURATION

    // Build videoPrompt from structured fields (client can override)
    const promptParts: string[] = []
    if (parsed.scene) promptParts.push(parsed.scene + '.')
    if (parsed.subject) promptParts.push(parsed.subject + '.')
    if (parsed.action) promptParts.push(parsed.action)
    if (parsed.cameraDirection) promptParts.push(parsed.cameraDirection + '.')
    if (parsed.dialogue) promptParts.push(`The person speaks: "${parsed.dialogue}"`)
    promptParts.push('Vertical 9:16 portrait format.')
    const videoPrompt = promptParts.join(' ')

    // Build extension prompt if needed
    let extensionPrompts: string[] | undefined
    if (hasExtension) {
      const extParts: string[] = []
      if (parsed.extensionAction) {
        extParts.push(parsed.extensionAction)
      }
      if (parsed.extensionDialogue) {
        extParts.push(`The person speaks: "${parsed.extensionDialogue}"`)
      }
      if (extParts.length > 0) {
        const extPrompt = extParts.join(' ')
        // Ensure "Continue from previous shot." prefix
        extensionPrompts = [extPrompt.startsWith('Continue from previous shot') ? extPrompt : `Continue from previous shot. ${extPrompt}`]
      }
    }

    console.log(`[PlanScene] AI estimated ${rawDuration}s → capped to ${targetDuration}s, ${extensionPrompts?.length || 0} extension(s), scene: "${parsed.scene}", action: ${(parsed.action || '').length} chars`)

    // Extract overlay
    const overlay = parsed.overlay && typeof parsed.overlay === 'object'
      ? {
          hook: typeof parsed.overlay.hook === 'string' ? parsed.overlay.hook : '',
          cta: typeof parsed.overlay.cta === 'string' ? parsed.overlay.cta : 'Learn More',
        }
      : undefined

    // Extract dialogue — empty string means purely visual scene
    const dialogue = typeof parsed.dialogue === 'string' && parsed.dialogue.trim()
      ? parsed.dialogue.trim()
      : undefined
    const extensionDialogue = typeof parsed.extensionDialogue === 'string' && parsed.extensionDialogue.trim()
      ? parsed.extensionDialogue.trim()
      : undefined

    return NextResponse.json({
      // Structured fields for Director's Review UI
      scene: typeof parsed.scene === 'string' ? parsed.scene : '',
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      action: typeof parsed.action === 'string' ? parsed.action : '',
      mood: typeof parsed.mood === 'string' ? parsed.mood : '',
      cameraDirection: typeof parsed.cameraDirection === 'string' ? parsed.cameraDirection : '',
      extensionAction: typeof parsed.extensionAction === 'string' ? parsed.extensionAction : '',
      // Composed prompts (built from fields, can be rebuilt by client)
      videoPrompt,
      extensionPrompts,
      // Metadata
      estimatedDuration: targetDuration,
      dialogue,
      extensionDialogue,
      overlay,
    })

  } catch (err) {
    console.error('[PlanScene] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scene planning failed' },
      { status: 500 }
    )
  }
}
