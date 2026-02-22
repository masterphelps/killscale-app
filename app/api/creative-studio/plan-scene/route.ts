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
1. Determine duration (8, 15, 22, or 29 seconds)
2. Split their description into time segments — first 8 seconds as the main prompt, then 7-second extensions
3. Generate overlay text and a one-line scene/mood summary

CRITICAL RULE — PRESERVE THE USER'S WORDS:
Do NOT rewrite, embellish, or "improve" the user's prompt. Veo works best with direct, casual descriptions.
Your job is ONLY to split the prompt into time segments. Keep the user's exact words, tone, pacing, and style.

If the prompt fits in 8 seconds, pass it through UNCHANGED as the videoPrompt.
If it needs extensions, split it at natural breakpoints — each segment gets the portion of the user's description that belongs in that time chunk.

USER'S SCENE DESCRIPTION:
"${userPrompt.trim()}"

${hasSourceImage ? 'SOURCE IMAGE: A reference image will be provided as the starting frame. The first ~1 second shows the image as a still before motion begins.' : 'NO SOURCE IMAGE: The video will be generated from text only.'}

DURATION ESTIMATION:
- Single action or simple scene → 8 seconds
- Two-part scene (scene A + scene B, setup + payoff) → 15 seconds
- Three beats (setup + development + payoff) → 22 seconds
- Four+ beats or complex narrative → 29 seconds
Pick the SHORTEST duration. Respond with: 8, 15, 22, or 29.

SEGMENTATION RULES — THIS IS THE MOST IMPORTANT PART:
Veo generates each segment as a SEPARATE video clip. The extension API takes the previous clip and continues from its final frame. This means:
- Whatever is in videoPrompt gets rendered COMPLETELY in the first 8 seconds
- Whatever is in an extension prompt gets rendered COMPLETELY in that 7-second extension
- If you put too many actions in videoPrompt, they ALL happen in 8 seconds and the extension has nothing left to show

SO: Distribute the user's actions EVENLY across segments. Each segment should have enough action to fill its time — not too much crammed in, not too little leaving dead air.
- 8 seconds can fit 2-3 beats comfortably (e.g. "walks in + looks around + picks something up")
- 7-second extensions can also fit 2-3 beats
- Split at NATURAL SCENE BREAKS or transitions: "Scene A then Scene B" → A in videoPrompt, B in extension

- "videoPrompt" = the first 8 seconds of action${hasSourceImage ? ' (first ~1s is source image still)' : ''} — should feel complete and engaging on its own
- Extension prompts each continue the story for the NEXT 7 seconds — should also feel substantial
- Each extension MUST start with "Continue from previous shot." — this tells Veo to use the previous video as context
- Each extension MUST have enough content to fill 7 seconds — don't leave segments sparse
- Do NOT add cinematic flourishes, lighting descriptions, or camera directions the user didn't ask for
- Do NOT remove anything the user wrote
- Only addition: "Vertical 9:16 portrait format." at the end of videoPrompt if not mentioned

VEO LIMITATIONS (silently work around):
- Cannot render text/words in video — move to overlay.hook instead
- Cannot render logos
- Cause-and-effect in one segment fails — split across segments

DIALOGUE:
If the scene implies someone speaking, suggest short dialogue (1-3 sentences). If purely visual, set to "".

OUTPUT FORMAT (respond with ONLY this JSON):
{
  "videoPrompt": "The user's description for the first 8 seconds — their words, their style. Minimal edits.",
  "extensionPrompts": ["Continue from previous shot. [user's description for next 7s]"],
  "scene": "One-line setting summary",
  "mood": "One-line tone summary",
  "estimatedDuration": 8,
  "dialogue": "",
  "overlay": {
    "hook": "Short hook text (MAX 6 words) — pull from any text the user wanted on screen, or suggest one",
    "cta": "CTA button text — e.g. 'Shop Now'"
  }
}

EXAMPLE 1 (15s = 8s + 7s extension):
User writes: "Paper world with clouds on strings. A llama stands there blinking. Scissors cut the llama's head off. Camera zooms in. Cut to a new llama with head attached, zoom out to see a field of llamas."

GOOD segmentation:
- videoPrompt: "In a world made from paper with clouds hanging from strings, a llama stands there blinking innocently at the camera. A pair of scissors enters the frame and cuts the llama's head off. Camera zooms in on the headless llama. Vertical 9:16 portrait format."
- extensionPrompts: ["Continue from previous shot. Cut to a brand new llama standing with its head fully attached, looking at the camera. Camera slowly zooms out to reveal a whole field of paper llamas stretching into the distance."]
Why: First 8s has the setup AND the dramatic moment (scissors cutting). Extension has the reveal and payoff (new llama + field). Both segments feel full.

BAD — too much in videoPrompt:
- videoPrompt: "Paper world, llama blinking, scissors cut head off, zoom in, cut to new llama, zoom out to field of llamas."
Why: ALL 5 beats crammed into 8 seconds — everything rushes by. Extension has nothing to show.

BAD — too little in videoPrompt:
- videoPrompt: "In a world made from paper with clouds hanging from strings, a llama stands there blinking."
Why: Just a llama standing there for 8 seconds — boring. The scissors moment should be in the first segment.

EXAMPLE 2 (22s = 8s + 7s + 7s):
User writes: "A woman walks through a garden, picks a flower, smells it, then the garden starts to bloom around her in bright colors."

GOOD segmentation:
- videoPrompt: "A woman walks through a quiet garden with muted, desaturated colors. She looks around at the plants, then reaches down and picks a single flower. Vertical 9:16 portrait format."
- extensionPrompts: ["Continue from previous shot. She brings the flower up to her face and smells it deeply, closing her eyes. As she opens her eyes, a subtle warmth of color begins spreading from the flower outward.", "Continue from previous shot. The entire garden erupts into bright vivid colors blooming all around her. Flowers burst open, vines grow up the walls, everything comes alive with saturated color while she watches in awe."]
Why: Each segment has 2-3 beats and fills its time. The story builds across segments.

BAD (DO NOT DO THIS — over-polished):
- videoPrompt: "A graceful woman in flowing linen glides through an enchanted botanical paradise, dappled golden sunlight filtering through an ancient canopy of wisteria as butterflies dance around her silhouette..."
That kills the energy. Don't do it.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
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

    // Snap AI's estimated duration to Veo increments
    const rawDuration = typeof parsed.estimatedDuration === 'number' ? parsed.estimatedDuration : 8
    const targetDuration = snapToVeoDuration(rawDuration)
    const numExtensions = targetDuration > VEO_BASE_DURATION
      ? Math.round((targetDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)
      : 0

    // Validate extension prompts
    const extensionPrompts: string[] | undefined = numExtensions > 0 && Array.isArray(parsed.extensionPrompts)
      ? parsed.extensionPrompts.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
      : undefined

    console.log(`[PlanScene] AI estimated ${rawDuration}s → snapped to ${targetDuration}s, ${extensionPrompts?.length || 0} extension(s), videoPrompt: ${parsed.videoPrompt.length} chars`)

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
