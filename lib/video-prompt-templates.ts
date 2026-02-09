import type { PromptSections, VideoStyle } from '@/remotion/types'

// Prompt templates for each video style
// Each template generates structured sections the user can edit
export function generatePromptSections(
  style: VideoStyle,
  productName?: string,
  productDescription?: string,
): PromptSections {
  const product = productName || 'the product'
  const desc = productDescription || ''

  const templates: Record<VideoStyle, PromptSections> = {
    talking_head: {
      scene: 'Modern bathroom with soft natural lighting, slightly blurred background, clean aesthetic',
      subject: 'Attractive, confident person in their late 20s, making direct eye contact with camera, natural makeup, casual but put-together outfit',
      action: `Person picks up ${product}, examines it with genuine interest, begins explaining with animated hand gestures and authentic enthusiasm`,
      product: `${product} held at chest height, visible branding${desc ? `. ${desc}` : ''}. Camera close enough to see product details`,
      mood: 'Warm, inviting, authentic UGC energy. Natural daylight feel, conversational and trustworthy',
    },
    lifestyle: {
      scene: 'Beautiful outdoor setting, golden hour sunlight filtering through, natural environment that feels aspirational but attainable',
      subject: 'Person naturally integrated into the environment, relaxed body language, genuine smile, lifestyle that represents the target audience',
      action: `Casually using ${product} as part of their routine, natural movements, no posed feeling. Show the product seamlessly fitting into their life`,
      product: `${product} prominently featured during natural use${desc ? `. ${desc}` : ''}. Product catches the warm light beautifully`,
      mood: 'Warm golden tones, cinematic but natural. Feeling of "this could be my life." Aspirational comfort',
    },
    product_showcase: {
      scene: 'Clean, minimal studio environment, single dramatic light source, dark or gradient background that makes the product pop',
      subject: '',
      action: `Slow, deliberate reveal of ${product}. Rotating 360° hero shot, then extreme close-ups showing texture and detail. Light catches the surface dramatically`,
      product: `${product} as the absolute star${desc ? `. ${desc}` : ''}. Every detail visible — texture, color, form. Premium presentation`,
      mood: 'Dramatic, premium, high-end commercial feel. Strong contrast, sharp focus. The kind of shot that makes you stop scrolling',
    },
    interview: {
      scene: 'Comfortable indoor setting, slightly out of focus background with warm bokeh, two-camera angle setup feel',
      subject: 'Real person, relatable, sitting comfortably, natural gestures, genuine facial expressions, speaking with conviction',
      action: `Person describes their experience with ${product}, nodding, looking slightly off-camera as if answering interview questions, then turns to camera for key points`,
      product: `${product} visible on table or in hands during key moments${desc ? `. ${desc}` : ''}. Not forced — naturally present`,
      mood: 'Documentary feel, authentic and trustworthy. Subtle background music. Natural speech patterns, genuine reactions',
    },
    unboxing: {
      scene: 'Clean desk or table surface, warm overhead lighting, slightly top-down camera angle, aesthetically pleasing background',
      subject: 'Hands visible, manicured, moving with anticipation and care. Occasional reaction shots showing excitement',
      action: `Opening the ${product} packaging carefully, building anticipation. Reveal moment with pause for impact. Examining each detail with appreciation`,
      product: `${product} in premium packaging${desc ? `. ${desc}` : ''}. The reveal is the hero moment — product emerging from box catches the light`,
      mood: 'ASMR-adjacent, satisfying, premium feel. Tactile sounds, crisp movements. Building excitement to the reveal',
    },
    before_after: {
      scene: 'Same location shown in two states — dull/problematic first, then bright/improved after. Split-screen or dramatic transition',
      subject: 'Same person in both states — subtle but noticeable improvement in confidence, skin, energy, or environment',
      action: `Before: showing the problem ${product} solves. Quick transition effect. After: dramatic improvement visible, person genuinely happy with results`,
      product: `${product} is the catalyst for the transformation${desc ? `. ${desc}` : ''}. Brief product shot during the transition moment`,
      mood: 'Dramatic contrast. Before feels slightly desaturated and flat. After feels vibrant, warm, and alive. The transformation is immediately obvious',
    },
    testimonial: {
      scene: 'Casual, real-world setting — kitchen, living room, or outdoor patio. Natural, unpolished background that feels authentic',
      subject: 'Real customer type, relatable, speaking naturally with genuine emotion. Not perfect — that is the appeal',
      action: `Person shares their honest experience with ${product}. Holds it up to show. Gets slightly emotional or excited at the key benefit moment`,
      product: `${product} shown casually — on counter, in hand, being used${desc ? `. ${desc}` : ''}. Not perfectly lit — authentic presentation`,
      mood: 'Raw, genuine, unfiltered UGC energy. Phone-quality feel. The authenticity IS the production value',
    },
    b_roll: {
      scene: 'Cinematic environment related to the product use case. Beautiful establishing shots, close-up detail shots, atmospheric elements',
      subject: '',
      action: `Slow, cinematic movements. Close-up details of ${product}, macro textures, ingredients/materials. Wide establishing shots. Smooth camera movements`,
      product: `${product} shown in context${desc ? `. ${desc}` : ''}. Artistic angles, beautiful composition. Product as part of a larger aesthetic`,
      mood: 'Cinematic, slow-motion moments, rich color grading. Magazine-quality visuals. Background music driven — no dialogue needed',
    },
  }

  return templates[style] || templates.lifestyle
}

// Combine sections into a single Sora-ready prompt
export function buildSoraPrompt(sections: PromptSections): string {
  const parts: string[] = []

  if (sections.scene) parts.push(`Setting: ${sections.scene}`)
  if (sections.subject) parts.push(`Subject: ${sections.subject}`)
  if (sections.action) parts.push(`Action: ${sections.action}`)
  if (sections.product) parts.push(`Product focus: ${sections.product}`)
  if (sections.mood) parts.push(`Mood and style: ${sections.mood}`)

  return parts.join('. ') + '. Vertical 9:16 portrait format, professional ad quality, cinematic lighting.'
}
