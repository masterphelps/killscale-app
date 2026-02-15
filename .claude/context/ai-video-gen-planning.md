# AI Video Generation — Planning & Competitive Research

## Date: February 8, 2026

---

## Table of Contents
1. [Proof of Concept Results](#proof-of-concept-results)
2. [Competitive Landscape](#competitive-landscape)
3. [Current Platform Architecture (The Old Way)](#current-platform-architecture-the-old-way)
4. [What Users Complain About](#what-users-complain-about)
5. [Platform-by-Platform Breakdown](#platform-by-platform-breakdown)
6. [What Sora 2 Pro Changes (Paradigm Shift)](#what-sora-2-pro-changes)
7. [Gap Analysis: Pure Generators vs Ad Tools](#gap-analysis)
8. [The KillScale Opportunity](#the-killscale-opportunity)
9. [Ideal Interface Design](#ideal-interface-design)
10. [Technical Implementation Notes](#technical-implementation-notes)
11. [Pricing & Unit Economics](#pricing--unit-economics)
12. [Market Data](#market-data)

---

## Proof of Concept Results

### Test 1: Veo 3.1 (Google) — Beard Wash
- **Model:** `veo-3.1-generate-preview`
- **Input:** Product photo (Doctor Nick's Hair Shampoo) + text prompt
- **Config:** 9:16, 8 seconds, `personGeneration: 'allow_adult'`
- **Result:** 4.9MB MP4, 720x1280, 24fps, H.264 + AAC stereo
- **Render time:** ~60 seconds
- **Encoder tag:** "Google" (confirmed real Veo output)
- **Quality:** Video generated but no talking — prompt needed dialogue in quotes. First attempt hit safety filter without `personGeneration` flag.
- **Key learning:** Must include `personGeneration: 'allow_adult'` for image-to-video with people. Avoid racial descriptors in person descriptions.

### Test 2: Veo 3.1 — Beard Oil (Improved Prompt)
- **Input:** Beard oil product photo + UGC talking head prompt with explicit dialogue
- **Config:** Same as above + `personGeneration: 'allow_adult'`
- **Result:** 4.9MB, 720x1280, 8 seconds with audio
- **Render time:** ~60 seconds
- **Post-processing:** ffmpeg text overlays (hook at 0-3s, CTA at 5.5-8s)
- **Quality:** Decent but not incredible

### Test 3: Sora 2 Pro (OpenAI) — Beard Oil
- **Model:** `sora-2-pro`
- **Input:** Same beard oil photo (resized to 1024x1792 to match output resolution) + detailed UGC prompt
- **Config:** 1024x1792 portrait, 12 seconds
- **Result:** 12.2MB MP4, 1024x1792, 12 seconds
- **Render time:** ~13 minutes (50 polls × 15s)
- **Quality:** INCREDIBLE. User reaction: "Wow. That video is incredible."
- **Key learning:** Sora requires input image dimensions to exactly match output resolution. Used `ffmpeg` to pad/resize square product photo to 1024x1792.

### Prompt That Worked (Sora 2 Pro)

```
UGC selfie-style vertical video ad for a men's beard oil product. Authentic, relatable, shot on a phone.

TALENT: A man in his 40s with a thick, well-groomed dark beard. Rugged but approachable. He films himself in selfie mode in a clean modern bathroom — warm overhead lighting, marble or tile background, slightly steamy.

PERFORMANCE — he speaks directly into the camera with natural energy and conviction:

"Alright fellas — this beard oil? The real deal."
(He holds the beard oil bottle up near his face so the label is visible to camera)
"Lime zest, citrus, pine — smells absolutely incredible."
(He tilts the bottle slightly, showing off the glass dropper bottle)
"And it's a hundred percent all natural. Hand crafted, small batch."
(He runs his free hand along his beard confidently)
"Your beard is gonna thank you for this one."
(He points at camera with a knowing nod)

CAMERA: Vertical 9:16 portrait, selfie POV. Slightly above eye level. Subtle handheld sway — authentic, not stabilized. Shallow depth of field on the background. The man fills most of the frame from chest up.

LIGHTING: Warm bathroom vanity lighting from above. Soft shadows. Slightly golden/amber tone. NOT clinical or studio — feels like morning light in a nice bathroom.

PACING: Conversational and natural. Not rushed, not slow. Each beat lands with a brief pause. Total delivery fits comfortably in 12 seconds.

AUDIO: His natural speaking voice — warm baritone, genuine enthusiasm, slight smile in his voice. Natural bathroom reverb. No background music. No sound effects. Just his voice and ambient room tone.

CRITICAL REQUIREMENTS:
- The man MUST be speaking with visible, synchronized lip movements for the ENTIRE video
- The beard oil bottle (glass dropper bottle with cream/white label reading "Doctor Nick's Amazing Man Stuff - Beard Oil") must be clearly visible when held up
- Direct eye contact with camera lens throughout — he's talking to the viewer
- This is a talking-head testimonial, NOT a product demo or montage
```

### Veo vs Sora Comparison

| | Veo 3.1 | Sora 2 Pro |
|---|---|---|
| Max duration | 8 seconds | 12 seconds |
| Max resolution | 720p (1080p/4K for 8s only) | 1024x1792 |
| Render time | ~60 seconds | ~13 minutes |
| Native audio | Yes (natively generated) | Yes (natively generated) |
| Image input | Base64 in request | Multipart form (must match output dims) |
| Person generation | Requires `personGeneration: 'allow_adult'` | Works by default |
| Cost (API) | ~$0.75/second | ~$0.10-0.50/second |
| Quality | Good | Excellent |
| SDK | `@google/genai` (already in project) | Raw REST API (no SDK installed) |

---

## Competitive Landscape

### Market Categories

**Category A: AI Avatar / UGC-Style Platforms (Talking Head Focus)**

| Platform | Founded | Focus | Pricing |
|----------|---------|-------|---------|
| **Arcads** | 2023 | UGC-style AI actors with lip sync | $110/mo (10 videos), $220/mo (20) |
| **HeyGen** | 2020 | AI avatars + multilingual dubbing | $29/mo (Creator), $39/seat (Business) |
| **Synthesia** | 2017 | Enterprise AI presenters | Free (10 min), $29/mo, Custom |
| **Creatify** | 2023 | URL-to-video ad generation | Free (10 credits), $33/mo, $49/mo |
| **MakeUGC** | 2024 | UGC with product-in-hand | $39/mo, $59/mo, $99/mo |
| **Captions AI** | 2021 | Talking-head editing + avatars | Free, $10/mo, $57/mo |
| **Argil AI** | 2023 | AI clone/influencer videos | ~$39/mo+ |

**Category B: Template/Stock-Based Ad Builders**

| Platform | Focus | Pricing |
|----------|-------|---------|
| **Creatopy (The Brief)** | Enterprise creative automation | Custom enterprise |
| **Pencil (Brandtech)** | AI ad variation generation | Enterprise (acquired 2023) |
| **AdCreative.ai** | Conversion-optimized creatives | $39/mo - $249/mo |
| **Predis.ai** | Social media video templates | $19-$212/mo |
| **InVideo** | Template library + AI writing | Free (watermarked), $28/mo |
| **Waymark** | TV/CTV commercial generation | Custom |

**Category C: Video Editing / Repurposing Tools**

| Platform | Focus | Pricing |
|----------|-------|---------|
| **Descript** | Text-based video editing | $16/mo - $65/mo |
| **Opus Clip** | Long-to-short clip extraction | Free, ~$15/mo, ~$29/mo |
| **Pictory** | Text/blog to video | $19/mo, custom |

**Category D: Foundation Models (Pure Generators)**

| Platform | Focus | Pricing |
|----------|-------|---------|
| **OpenAI Sora 2 Pro** | Photorealistic generative video | API: $0.10-$0.50/sec |
| **Google Veo 3.1** | YouTube/Google Ads optimized | $0.75/sec |
| **Runway Gen-4.5** | Stylized + realistic generation | $12/mo+ |
| **Kling AI 3.0** | Native 4K, multi-shot storyboard | Tiered |
| **Pika Labs 2.5** | Scene Ingredients composition | Tiered |
| **Adobe Firefly Video** | Creative Cloud integration | Bundled |

**Category E: Emerging Specialized Players**

| Platform | Focus |
|----------|-------|
| **Higgsfield** | Cinematic motion templates ($1.3B valuation, $200M ARR) |
| **LTX Studio** | Full production pipeline with Elements |
| **Topview** | Style cloning from reference videos |
| **Mootion** | One-pass script + visual + voiceover |
| **Bandy AI** | E-commerce creative agent |
| **MNTN Vibe** | Connected TV ad optimization |

### Big Tech Threat

**Meta** is the biggest threat: 4M+ advertisers already using AI ad tools, 15M+ AI-enhanced ads monthly. Their 2026 roadmap: advertisers submit product image + budget → Meta autonomously generates ads, targets, and optimizes. Building "Video Generation 2.0" that turns up to 20 product photos into multi-scene video ads.

**Google Veo 3** has "Direct-to-Ads" integration generating 15 optimized versions for YouTube. 22% CPA decrease reported for Performance Max campaigns.

---

## Current Platform Architecture (The Old Way)

Every avatar/UGC platform uses the same broken pipeline:

```
Real actor filmed in studio → Pre-recorded footage stored → User writes script
→ User selects avatar from library → TTS engine reads script
→ Lip-sync AI maps audio onto pre-recorded face → Download raw clip
→ User finishes in CapCut/Premiere (text, music, B-roll, CTAs)
```

### The 5 Structural Problems

1. **Can't hold your product** — Actor was filmed with nothing in their hands. MakeUGC "composites" a product image into the hand — looks fake and flat. No real physics (lighting, shadows, grip).

2. **Uncanny valley lip sync** — Mouth movements algorithmically mapped, not generated with the speech. Jaw opens too wide on certain vowels, eyes stay frozen while mouth moves, blinking at mechanical intervals, micro-expressions absent or wrong.

3. **Same faces everywhere** — 300-1,500 avatars shared across thousands of brands. Your competitor's spokesperson might be the same avatar. Kills "authentic UGC" illusion.

4. **Generic backgrounds only** — Studio green screen with stock overlays. Can't place someone in a real bathroom, gym, kitchen, or any authentic environment.

5. **Robotic voices** — TTS improved but still flat on emotional beats. Sarcasm, excitement, laughter all break. Users report "fidgeting with commas and question marks" to achieve natural inflection.

---

## What Users Complain About

### Quality Issues (Reddit, Trustpilot, G2)
- "90% of AI-generated content looks fake. Fake-looking content kills conversions"
- "Videos look NOTHING like their ads — glitchy, unclear lip-sync that appears clearly AI and freaky"
- "Models look like NPCs from a 2010 video game — instant scroll past"
- "There's a weirdness, an almost-there-but-not-quite feel that makes people uncomfortable"
- "Complex movements occasionally lead to uncanny valley moments"

### Billing/Cancellation (Industry-Wide Pain Point)
- Arcads: "impossible to cancel subscription," charges continuing after cancellation, ignored refund requests
- Creatify: Founding members downgraded without notification, credits wasted on rendering errors with no refund
- MakeUGC: "avoid this service at all costs," "ugly UGC ads and bad customer service"
- Common pattern: Opaque credit systems, aggressive annual upsells, difficult cancellation

### Hidden Labor
- "If you're investing this much time editing AI UGC, the ROI that got you interested is starting to slip away"
- Required skills: 3D modeling, animation, prompt engineering, post-processing
- Most platforms output raw talking-head clips requiring significant post-production
- No platform is a complete end-to-end solution

---

## Platform-by-Platform Breakdown

### Arcads (Most Direct Competitor for UGC)
**Flow:** Create Project → Script (manual, no AI writer) → Select from 300+ avatars → Audio preview → Generate (~2 min) → Download raw clip (no editor)
**Product interaction:** Can upload product photo as reference but actors CANNOT hold, unbox, or interact with product physically
**Special modes:** Unboxing POV (simulated overlay), Show Your App (screen recording)
**Pricing:** $110/mo for 10 videos (~$11/video), $220/mo for 20
**Key complaints:** No free trial, credits don't roll over, billing issues, "essentially a front-end wrapper for existing AI video tools at 20x the price"

### Creatify (URL-to-Video)
**Flow:** Paste product URL → AI scrapes product info → Generates 5-10 script variations → Select from 1,500+ avatars → Voice selection (170+ voices, 29 languages) → Generate → Built-in editor for overlays/CTAs → Batch mode (50 variations)
**Differentiator:** URL-to-video flow is closest parallel to KillScale's analyze-product-url pattern
**Pricing:** Free (10 credits), $39/mo (Starter), $49/mo (Pro with batch mode)
**Key complaints:** Poor lip syncing, rendering timeouts that waste credits, credit system opaque

### HeyGen (Best Lip Sync)
**Flow:** Reference video or library avatar → Script text → 175+ languages → Lip-sync adjustment
**Differentiator:** "Digital Twin" cloning. Best-in-class lip sync and multilingual dubbing. Product Placement feature (June 2025) — Avatar IV generates variations of avatars "holding, wearing, interacting" with products via AI compositing
**Pricing:** $29/mo (Creator), $39/seat (Business), $1,000/year for premium custom avatar
**Key complaints:** Custom avatars expensive, still pre-recorded at base, product placement is compositing not real interaction

### Synthesia (Enterprise/Corporate)
**Flow:** Script → 240+ avatars → "Express-2" adds hand gestures/body movement → Professional presenter-style output
**Positioning:** Training/explainer videos, NOT UGC authenticity. Looks polished and corporate — opposite of raw UGC feel.
**Pricing:** Free (10 min), $29/mo, Custom enterprise
**Key complaints:** Not suitable for social ad UGC style, custom avatar requires $1,000/year add-on

### MakeUGC (Product-in-Hand Claims)
**Flow:** Upload product photo → Script → Avatar selection → Claims avatar can "hold, showcase, and consume" product
**Reality:** AI compositing, not genuine interaction. Product appears flat and unnaturally positioned. Cannot show genuine manipulation (opening, applying, demonstrating). Reviews say results are inconsistent and uncanny.
**Pricing:** $39/mo (Startup), $59/mo (Growth), $99/mo (Pro)
**Key complaints:** "Avoid at all costs," "product doesn't deliver anything it promises," ugly output

---

## What Sora 2 Pro Changes

### The Paradigm Shift
Old approach: **Puppet pre-recorded footage** with lip-sync overlay
New approach: **Generate everything from scratch** — person, product, environment, speech, sound effects, camera movement — as one coherent output

### Specific Capabilities No Avatar Platform Can Match

1. **True product-in-scene generation** — Upload product photo, describe scene, Sora generates person actually holding/using it with correct physics, lighting, shadows. No compositing.

2. **Genuine environment variety** — Each video in a completely different real-world setting (gym, beach, office, bathroom) because environment is generated, not selected from 10 stock backgrounds.

3. **Synchronized native audio** — Speech matches lip movement because both generated together. Eliminates uncanny valley of lip-sync overlay.

4. **Physics-aware product interaction** — Product can be picked up, rotated, set down, poured, sprayed, applied. Lighting and shadows adjust naturally.

5. **Scene composition and camera movement** — Dolly shots, close-ups, wide shots, camera tracking. Cinematographic, not static face-talking.

6. **Unlimited "actors" without a library** — Model generates person matching description. Any age, style, clothing, setting. No licensing pre-recorded actors. No shared faces across brands.

7. **Image-to-video product animation** — Static product photo → animated in lifestyle environment. E-commerce reports 30-45% conversion rate increases with animated product videos.

### Current Limitations

- **Max 12-20 seconds per clip** (sufficient for most social ad formats)
- **Close-ups of faces/hands** may have artifacts (fingers, teeth, small text on labels)
- **Rendering time** — 13 minutes for Sora Pro vs seconds for avatar lip-sync
- **Cost at scale** — $3-6 per 12s video. Testing 50 variations = $150-300
- **Consistency across campaign** — 10 ads that feel cohesive requires careful prompting
- **No real-time interactivity** — generates fixed video, not dynamic

---

## Gap Analysis

### What's Missing from Pure AI Generators for Ad Use

| Feature | Sora 2 | Veo 3.1 | Runway Gen-4 | Needed for Ads? |
|---|---|---|---|---|
| Text overlay / caption tools | No | No | No | **CRITICAL** |
| CTA button placement | No | No | No | **CRITICAL** |
| Brand kit (logo, colors, fonts) | No | No | No | **CRITICAL** |
| A/B hook variant generation | No | No | No | **CRITICAL** |
| Direct Meta/TikTok upload | No | No | No | **CRITICAL** |
| Ad copy pairing | No | No | No | **CRITICAL** |
| Platform safe zone guides | No | No | No | Important |
| Multi-aspect-ratio export | Partial | No (no 1:1) | Best | Important |
| Licensed music library | No | Native audio | No | Important |
| Caption/subtitle auto-gen | No | Partial | Lip sync tool | Important |
| Product image input | Yes (multipart) | Yes (3 refs) | Yes (1 ref) | CRITICAL |
| Character consistency | No | Yes (refs) | Yes (fixed seed) | Important |
| Native 4K | No (1080p) | No (1080p) | Yes (upscale) | Nice-to-have |
| Native audio | YES | YES | NO | Nice-to-have |

### The Six Critical Gaps (Opportunity)

1. **No text overlay / CTA tooling** — Every ad needs text on screen. No generator produces it.
2. **No brand consistency enforcement** — Can't upload brand kit and have it respected.
3. **No A/B variant generation** — "Generate 5 hooks, same product, same CTA" requires 5 manual prompts.
4. **No platform-aware export** — Nobody outputs 9:16, 4:5, 1:1, 16:9 simultaneously with safe zones.
5. **No direct ad platform upload** — Every tool outputs MP4 to download. Nobody connects to Meta Marketing API.
6. **No ad copy pairing** — Video generators treat video as the entire deliverable. Ads need primary text + headline + description.

---

## The KillScale Opportunity

### Existing Pieces We Already Have

| Capability | Current Implementation | Status |
|---|---|---|
| Product image extraction | `analyze-product-url/route.ts` — Claude extracts product info + downloads image | ✅ Done |
| Competitor ad research | ScrapeCreators integration in Ad Studio | ✅ Done |
| AI copy generation | Claude generates scripts/angles/ad copy | ✅ Done |
| Performance data feedback loop | Full Meta API sync, Creative Studio scores | ✅ Done |
| Direct Meta upload | `meta-upload.ts` — images to 30MB, videos to 1GB | ✅ Done |
| Gemini image generation | `generate-image/route.ts` — dual-image with product + reference | ✅ Done |
| Google GenAI SDK | `@google/genai` already installed and configured | ✅ Done |
| Ad creation wizard | Launch Wizard with creative preloading | ✅ Done |
| ffmpeg available | On user's machine for post-processing | ✅ Available |

### What We'd Need to Build

| Capability | Effort | Notes |
|---|---|---|
| Sora 2 Pro API integration | Medium | REST API, no SDK needed. Multipart form + polling. |
| Veo 3.1 video generation | Low | Already have SDK. Just add `generateVideos` path. |
| Video text overlay system | Medium | ffmpeg server-side OR client-side canvas compositor |
| Script generation from performance data | Low | Claude already generates copy. Add video script format. |
| Video-specific prompt builder | Medium | Translate user inputs (product, style, scene, script) into optimal prompts |
| Image resize for Sora | Low | Auto-pad/resize product images to match output resolution |
| Async generation with status polling | Medium | Background job with progress indicator |
| Video preview player | Low | Already have video playback in Creative Studio |
| Multi-model selection (Veo vs Sora) | Low | User picks quality/speed tradeoff |

### Proposed User Flow

```
1. User picks product (URL or existing from library)
   → Claude extracts product info + image (EXISTING)

2. User picks creative direction:
   - Style: UGC testimonial, product demo, lifestyle, problem-solution
   - Scene: bathroom, kitchen, gym, outdoor, studio
   - Talent: age range, gender, vibe description
   - OR: "Use as Inspiration" from competitor ad (EXISTING)

3. Claude writes the script
   → Based on winning angles from their REAL performance data
   → Fits within duration (8s Veo / 12s Sora)
   → Includes dialogue, action beats, camera directions

4. User reviews/edits script + selects options:
   - Model: Veo 3.1 (fast, $6/video) vs Sora 2 Pro (best, $3-6/video)
   - Duration: 8s or 12s
   - Aspect ratio: 9:16 (Reels), 16:9 (YouTube), 1:1 (Feed)

5. Generate video (background job with progress bar)
   → Veo: ~60 seconds
   → Sora: ~13 minutes

6. Post-processing layer:
   - Hook text overlay (first 2-3 seconds)
   - CTA text (last 2-3 seconds)
   - Logo watermark
   - Auto-captions from audio
   → All applied server-side via ffmpeg

7. Preview + iterate
   - "Regenerate" with adjusted prompt
   - "Adjust" specific elements (change hook text, CTA, etc.)
   - Generate variants (different hooks, same body)

8. Save + Create Ad
   - Save to Supabase Storage (EXISTING pattern)
   - Upload to Meta via Marketing API (EXISTING)
   - Pair with generated ad copy (EXISTING)
   - Create as PAUSED ad for review (EXISTING)
```

---

## Ideal Interface Design

### Step 1: Brand Kit & Product Input
- Upload brand guidelines (logo, colors, fonts, tone)
- Upload product images/videos as reference
- Paste product URL for auto-extraction (existing)
- These persist as "Elements" across all generations

### Step 2: Creative Direction
- Choose angle: UGC testimonial, product demo, lifestyle, problem-solution, comparison
- Optional: upload competitor ad as style reference (existing)
- AI generates storyboard with 3-5 shots: description, camera, duration, text placement
- User can edit, reorder, regenerate individual shots

### Step 3: Platform-Aware Generation
- Select targets: Meta Feed (4:5), Reels (9:16), YouTube Shorts (9:16), Pre-roll (16:9)
- Generate ALL aspect ratios simultaneously
- Platform safe zones shown as overlays (top 14%, bottom 35% for Meta/TikTok UI)
- Duration presets: :06 bumper, :08 standard, :12 extended

### Step 4: Ad Layer Composition
- Text overlay editor with brand fonts/colors
- CTA button placement with animation
- Logo watermark positioning
- Caption/subtitle auto-generation (12% higher view time with captions)
- Music from licensed library (avoid copyright issues)

### Step 5: Variant Generation & Testing
- Generate 3-5 hook variants (different opening 3 seconds)
- Generate 2-3 CTA variants
- A/B naming for tracking
- Performance prediction based on historical data

### Step 6: Export & Upload
- Direct upload to Meta Ads Manager (existing)
- Proper format compliance (H.264 MP4, Meta <4GB, TikTok <500MB)
- Thumbnail selection from frames
- Ad copy pairing (primary text, headline, description)

---

## Technical Implementation Notes

### Veo 3.1 API Pattern
```javascript
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY })

let operation = await ai.models.generateVideos({
  model: 'veo-3.1-generate-preview',
  prompt: prompt,
  image: {
    imageBytes: base64ImageData,
    mimeType: 'image/png',
  },
  config: {
    aspectRatio: '9:16',
    durationSeconds: 8,
    personGeneration: 'allow_adult',
  },
})

// Poll for completion
while (!operation.done) {
  await new Promise(resolve => setTimeout(resolve, 10000))
  operation = await ai.operations.getVideosOperation({ operation })
}

// Download
await ai.files.download({
  file: operation.response.generatedVideos[0].video,
  downloadPath: outputPath,
})
```

### Sora 2 Pro API Pattern
```javascript
// No SDK — raw REST API with FormData
const formData = new FormData()
formData.append('model', 'sora-2-pro')
formData.append('prompt', prompt)
formData.append('size', '1024x1792')  // Must match image dims
formData.append('seconds', '12')
formData.append('input_reference', new Blob([imageBuffer], { type: 'image/png' }), 'product.png')

const createRes = await fetch('https://api.openai.com/v1/videos', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  body: formData,
})
const { id, status } = await createRes.json()

// Poll for completion
while (status === 'queued' || status === 'in_progress') {
  await new Promise(resolve => setTimeout(resolve, 15000))
  const res = await fetch(`https://api.openai.com/v1/videos/${id}`, {
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  })
  const data = await res.json()
  status = data.status
}

// Download
const downloadRes = await fetch(`https://api.openai.com/v1/videos/${id}/content`, {
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
})
const videoBuffer = Buffer.from(await downloadRes.arrayBuffer())
```

### Sora Image Requirements
- Input image dimensions MUST exactly match the output `size` parameter
- Portrait: 1024x1792
- Landscape: 1792x1024
- Square product photos need to be padded/resized before submission:
```bash
ffmpeg -y -i input.png -vf "scale=1024:-1,pad=1024:1792:(ow-iw)/2:(oh-ih)/2:white" output.png
```

### ffmpeg Text Overlay Pattern
```bash
ffmpeg -y -i raw_video.mp4 -vf \
  "drawtext=text='Hook headline here':fontsize=42:fontcolor=white:borderw=3:bordercolor=black@0.8:x=(w-text_w)/2:y=100:enable='between(t\,0.2\,3)', \
   drawtext=text='CTA text here':fontsize=32:fontcolor=white:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=h-160:enable='between(t\,5.5\,8)'" \
  -codec:a copy output_with_text.mp4
```

### Vercel Considerations
- `maxDuration = 60` already set on generate-image route
- Sora polling takes up to 13 minutes — CANNOT run in a single Vercel function
- Options:
  1. Client-side polling (submit job, return video ID, client polls status)
  2. Vercel Cron job for long-running generations
  3. Background function with webhook callback
- Veo at ~60s fits within `maxDuration = 60` (tight but possible)

---

## Pricing & Unit Economics

### Per-Video Cost Comparison

| Approach | Cost per Video | Quality | Speed |
|---|---|---|---|
| Arcads (avatar lip sync) | ~$11 | Low-Medium | ~2 min |
| Creatify (avatar + editor) | ~$3-5 | Low-Medium | ~2 min |
| HeyGen (best avatar) | ~$2-3 | Medium | ~1 min |
| Real UGC creator | $80-200 | High | Days |
| **Veo 3.1 (8s)** | **~$6** | **Medium-High** | **~60s** |
| **Sora 2 Pro (12s)** | **~$3-6** | **Very High** | **~13 min** |

### KillScale Pricing Model Options
- Include N video generations per tier (e.g., 5 for Launch, 20 for Scale, unlimited for Pro)
- OR: credit system where 1 video = X credits
- OR: add-on at $X/mo for video generation access
- Key insight: At $3-6/video API cost, even a $29/mo plan with 5 videos/mo is profitable

---

## Market Data

- **78% of marketers** say UGC is important to their social strategy
- **Nearly 40% of video ads** will use generative AI by 2026 (up from 22% in 2024)
- **86% of ad buyers** are using or planning to use AI for creative
- **82% of ad execs** think consumers feel positive about AI ads, but **only 45% of consumers** actually do
- **80/20 rule**: Most successful AI ads in 2026 are "80% AI-generated, 20% human-refined"
- AI UGC works best for **volume testing and cold traffic** but real UGC still dominates for **trust and final conversion** (28% higher engagement, 161% higher conversion for real UGC)
- Higgsfield: $1.3B valuation, $200M ARR — proves the market is massive
- Meta AI ad tools: 4M+ advertisers, 15M+ AI-enhanced ads monthly

### The Strategic Positioning
Nobody in the market connects:
1. **Generative video** (Sora/Veo quality) +
2. **Real ad performance data** (what's actually converting) +
3. **Direct platform upload** (one-click to Meta)

Current workflow everywhere else:
Create ad in one tool → Download → Upload to Meta → Wait for results → Go back to step 1 with NO data connection

---

## Sources

- [The 7 Best AI Tools for Video Ads in 2026 - NextGen Tools](https://www.nxgntools.com/blog/top-ai-video-ad-tools-2026)
- [AI UGC Video Generators: We're Not There Yet - Hustler Marketing](https://www.hustlermarketing.com/blog/ai-ugc-video-generators-ecommerce/)
- [Arcads AI Review - Eesel](https://www.eesel.ai/blog/arcads-ai)
- [Arcads Trustpilot Reviews](https://www.trustpilot.com/review/arcads.ai)
- [Creatify Pricing](https://creatify.ai/pricing)
- [Creatify G2 Reviews](https://www.g2.com/products/creatify-labs-inc-creatify-ai/reviews)
- [HeyGen Product Placement](https://www.heygen.com/blog/ai-product-placement)
- [HeyGen vs Synthesia 2026 - WaveSpeedAI](https://wavespeed.ai/blog/posts/heygen-vs-synthesia-comparison-2026/)
- [MakeUGC Trustpilot](https://www.trustpilot.com/review/makeugc.ai)
- [Synthesia Pricing](https://www.synthesia.io/pricing)
- [Sora 2 Complete Guide 2026 - WaveSpeedAI](https://wavespeed.ai/blog/posts/openai-sora-2-complete-guide-2026/)
- [Sora 2 Pro API Review - Evolink](https://evolink.ai/blog/sora-2-pro-api-review-developer-guide)
- [Veo 3.1 Gemini API - Google Developers](https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/)
- [Veo 3 on Vertex AI - Google Cloud](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Runway Gen-4 - Runway Research](https://runwayml.com/research/introducing-runway-gen-4)
- [Kling 3.0 Launch - PRNewswire](https://www.prnewswire.com/news-releases/kling-ai-launches-3-0-model-302679944.html)
- [Pika Labs 2.0 Guide - FireXCore](https://firexcore.com/blog/pika-labs-2-0-guide/)
- [Higgsfield $1.3B Valuation - TechCrunch](https://techcrunch.com/2026/01/15/ai-video-startup-higgsfield-founded-by-ex-snap-exec-lands-1-3b-valuation/)
- [Meta AI Advertising Automation 2026 - WildNet](https://www.wildnettechnologies.com/blogs/meta-ai-advertising-automation-2026)
- [Meta AI Ad Tools - Social Media Today](https://www.socialmediatoday.com/news/meta-announces-ai-ad-tools-video-generation-business-ais/750984/)
- [IAB: AI Ad Gap Widens](https://www.iab.com/insights/the-ai-gap-widens/)
- [Nearly 40% of Video Ads Use GenAI - eMarketer](https://www.emarketer.com/content/nearly-40--of-video-ads-will-use-genai-by-2026--says-iab)
- [AI vs Traditional UGC - SuperScale](https://superscale.ai/learn/ai-vs-traditional-ugc-complete-comparison/)
- [How to Build Ad Production 2026 - Motion](https://motionapp.com/blog/how-to-build-a-high-volume-ad-production-system-for-meta-and-tiktok-in-2026)
- [Veo 3 vs Sora vs Runway Comparison - Spectrum AI Lab](https://spectrumailab.com/blog/veo-3-vs-sora-vs-runway-best-ai-video-generator-2026)
- [Consumers Call AI Ads Annoying - Marketing Dive](https://www.marketingdive.com/news/consumer-perceptions-generative-ai-in-marketing-openai-sora/735761/)
