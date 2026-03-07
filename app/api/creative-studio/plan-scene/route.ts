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

    const prompt = `You are a video segmentation assistant for Google Veo. The user wrote a casual scene description. Your ONLY job is:
1. Determine duration (8 or 15 seconds — almost always 8)
2. If 15s, split into first 8 seconds + one 7-second extension
3. Generate overlay text and a one-line scene/mood summary

CRITICAL RULE — PRESERVE THE USER'S WORDS:
Do NOT rewrite, embellish, or "improve" the user's prompt. Veo works best with direct, casual descriptions.
Your job is ONLY to split the prompt into time segments. Keep the user's exact words, tone, pacing, and style.

If the prompt fits in 8 seconds, pass it through UNCHANGED as the videoPrompt.
If it truly needs an extension, split at the most natural breakpoint.

USER'S SCENE DESCRIPTION:
"${userPrompt.trim()}"

${hasSourceImage ? 'SOURCE IMAGE: A reference image will be provided as the starting frame. The first ~1 second shows the image as a still before motion begins.' : 'NO SOURCE IMAGE: The video will be generated from text only.'}

DURATION ESTIMATION — DEFAULT TO 8 SECONDS:
8 seconds is a LOT of time for video. You can fit 4-5 distinct actions in 8 seconds. Most prompts fit in 8 seconds.

ONLY use 15 seconds if the prompt has TWO CLEARLY SEPARATE SCENES that cannot happen simultaneously (e.g. "Scene A in location X, THEN cut to Scene B in location Y"). A single continuous scene with multiple actions is NOT a reason to extend — pack it into 8 seconds.

NEVER use 22 or 29 seconds. Max is 15.

How much fits in 8 seconds — more than you think:
- "A woman walks into a café, orders coffee, sits down, opens her laptop, and starts typing" → 8 seconds. All one continuous scene.
- "A dog runs across a field, catches a frisbee, brings it back, and gets a treat" → 8 seconds. Continuous action.
- "Aerial shot of a city at dawn, camera descends through clouds, flies between buildings, and lands on a rooftop" → 8 seconds. One camera move.
- "A chef slices vegetables, tosses them in a pan, flames shoot up, plates the dish beautifully" → 8 seconds. Continuous action.

When to use 15 seconds (RARE — requires a genuine scene change):
- "A woman walks through a rainy street... CUT TO: she's now sitting inside a warm café" → 15s. Two different locations.
- "Paper llama gets its head cut off by scissors, camera zooms in. CUT TO: a new llama stands in a field of llamas" → 15s. Two distinct scenes.

SEGMENTATION RULES (only if 15s):
- "videoPrompt" = the first 8 seconds${hasSourceImage ? ' (first ~1s is source image still)' : ''} — should be DENSE with action, no dead air
- Extension prompt continues the story for the NEXT 7 seconds — also dense
- Each extension MUST start with "Continue from previous shot."
- Do NOT pad segments with slow establishing shots or lingering moments
- Do NOT add cinematic flourishes, lighting descriptions, or camera directions the user didn't ask for
- Do NOT remove anything the user wrote
- Only addition: "Vertical 9:16 portrait format." at the end of videoPrompt if not mentioned

VEO LIMITATIONS (silently work around):
- Cannot render text/words in video — move to overlay.hook instead
- Cannot render logos
- Cause-and-effect in one segment fails — split across segments

DIALOGUE:
If the scene includes someone speaking, preserve their COMPLETE dialogue — never truncate or summarize.
If purely visual, set dialogue to "".
CRITICAL: Estimate speaking time at ~2.5 words per second. If the dialogue has more than 20 words, the video MUST be 15 seconds — speech CANNOT be cut mid-sentence by the 8-second boundary. Split the dialogue naturally across videoPrompt (first 8s) and extensionPrompt (next 7s) at a sentence boundary.

OUTPUT FORMAT (respond with ONLY this JSON):
{
  "videoPrompt": "The user's description — their words, their style. Pack ALL action into this.",
  "extensionPrompts": [],
  "scene": "One-line setting summary",
  "mood": "One-line tone summary",
  "estimatedDuration": 8,
  "dialogue": "",
  "overlay": {
    "hook": "Short hook text (MAX 6 words) — pull from any text the user wanted on screen, or suggest one",
    "cta": "CTA button text — e.g. 'Shop Now'"
  }
}

NOTE: extensionPrompts should be an EMPTY ARRAY [] for 8-second videos. Only populate it for 15-second videos.

EXAMPLE 1 — 8 seconds (most prompts):
User writes: "A woman walks through a garden, picks a flower, smells it, then the garden starts to bloom around her in bright colors."
- estimatedDuration: 8
- videoPrompt: "A woman walks through a quiet garden. She picks a flower and smells it deeply. As she opens her eyes, the entire garden erupts into bright vivid colors — flowers burst open, vines grow, everything comes alive with saturated color. Vertical 9:16 portrait format."
- extensionPrompts: []
Why: This is one continuous scene. All the action fits in 8 seconds easily.

EXAMPLE 2 — 15 seconds (rare, requires scene change):
User writes: "Paper world with clouds on strings. A llama stands there blinking. Scissors cut the llama's head off. Camera zooms in. Cut to a new llama with head attached, zoom out to see a field of llamas."
- estimatedDuration: 15
- videoPrompt: "In a world made from paper with clouds hanging from strings, a llama stands there blinking. A pair of scissors enters the frame and cuts the llama's head off. Camera zooms in on the headless llama. Vertical 9:16 portrait format."
- extensionPrompts: ["Continue from previous shot. Cut to a brand new llama standing with its head fully attached. Camera zooms out to reveal a whole field of paper llamas stretching into the distance."]
Why: "Cut to" signals a genuine scene change — new subject, new framing. That justifies an extension.

BAD — extending when 8s is enough:
User writes: "A chef prepares a beautiful pasta dish"
- estimatedDuration: 15 ← WRONG
- videoPrompt: "A chef stands in a kitchen, reaches for ingredients..."
- extensionPrompts: ["Continue from previous shot. The chef plates the pasta beautifully..."]
Why this is wrong: This is one continuous scene. Pack it all into 8 seconds. No extension needed.`

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

    if (!parsed.videoPrompt) {
      console.error('[PlanScene] Invalid response structure:', parsed)
      return NextResponse.json({ error: 'Invalid scene plan — missing videoPrompt' }, { status: 500 })
    }

    // Snap AI's estimated duration to Veo increments — hard cap at 15s (1 extension max)
    const rawDuration = typeof parsed.estimatedDuration === 'number' ? parsed.estimatedDuration : 8
    const cappedDuration = Math.min(rawDuration, 15) // never exceed 15s
    const targetDuration = snapToVeoDuration(cappedDuration)
    const numExtensions = targetDuration > VEO_BASE_DURATION ? 1 : 0 // max 1 extension

    // Validate extension prompts — only take the first one
    const extensionPrompts: string[] | undefined = numExtensions > 0 && Array.isArray(parsed.extensionPrompts) && parsed.extensionPrompts.length > 0
      ? [parsed.extensionPrompts.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)[0]].filter(Boolean)
      : undefined

    console.log(`[PlanScene] AI estimated ${rawDuration}s → capped to ${targetDuration}s, ${extensionPrompts?.length || 0} extension(s), videoPrompt: ${parsed.videoPrompt.length} chars`)

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

    return NextResponse.json({
      videoPrompt: parsed.videoPrompt,
      extensionPrompts,
      scene: typeof parsed.scene === 'string' ? parsed.scene : '',
      mood: typeof parsed.mood === 'string' ? parsed.mood : '',
      estimatedDuration: targetDuration,
      dialogue,
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
