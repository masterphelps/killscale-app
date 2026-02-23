import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { videoJobId, compositionId, userId, adAccountId, renderedVideoUrl } =
      await request.json()

    if (!userId || !adAccountId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, adAccountId" },
        { status: 400 }
      )
    }

    if (!videoJobId && !compositionId) {
      return NextResponse.json(
        { error: "Must provide either videoJobId or compositionId" },
        { status: 400 }
      )
    }

    const cleanAccountId = adAccountId.replace(/^act_/, "")

    // --- Save a composition (project) to library ---
    if (compositionId) {
      const { data: comp, error: compError } = await supabaseAdmin
        .from("video_compositions")
        .select("id, user_id, title, name, thumbnail_url, source_job_ids")
        .eq("id", compositionId)
        .single()

      if (compError || !comp) {
        return NextResponse.json(
          { error: "Composition not found" },
          { status: 404 }
        )
      }

      if (comp.user_id !== userId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        )
      }

      // For single-clip compositions, save the source video directly
      // For multi-clip, save as a project entry
      const isSingleClip =
        comp.source_job_ids?.length === 1 && !compositionId

      if (isSingleClip) {
        // Delegate to single-job save below
        // (won't actually reach here since compositionId is truthy)
      }

      // Use rendered video (with overlays baked in) if provided, else raw
      let videoUrl = renderedVideoUrl || comp.thumbnail_url
      if (!renderedVideoUrl && comp.source_job_ids?.length) {
        const { data: firstJob } = await supabaseAdmin
          .from("video_generation_jobs")
          .select("raw_video_url")
          .eq("id", comp.source_job_ids[0])
          .single()
        if (firstJob?.raw_video_url) {
          videoUrl = firstJob.raw_video_url
        }
      }

      const mediaHash = `ai_project_${comp.id}`
      const displayName = comp.name || comp.title || "AI Video Project"

      const { data: media, error: insertError } = await supabaseAdmin
        .from("media_library")
        .upsert(
          {
            user_id: userId,
            ad_account_id: cleanAccountId,
            media_hash: mediaHash,
            media_type: "video",
            name: displayName,
            storage_url: videoUrl,
            url: videoUrl,
            video_thumbnail_url: comp.thumbnail_url,
            source_type: "project",
            source_composition_id: comp.id,
            download_status: "complete",
            synced_at: new Date().toISOString(),
          },
          { onConflict: "user_id,ad_account_id,media_hash" }
        )
        .select("id")
        .single()

      if (insertError || !media) {
        console.error("Failed to save composition to library:", insertError)
        return NextResponse.json(
          { error: "Failed to save composition to media library" },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, mediaId: media.id })
    }

    // --- Save a single video job to library ---
    const { data: job, error: jobError } = await supabaseAdmin
      .from("video_generation_jobs")
      .select("id, user_id, status, raw_video_url, video_style")
      .eq("id", videoJobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Video job not found" },
        { status: 404 }
      )
    }

    if (job.user_id !== userId) {
      return NextResponse.json(
        { error: "Unauthorized: job does not belong to this user" },
        { status: 403 }
      )
    }

    if (job.status !== "complete") {
      return NextResponse.json(
        { error: `Video job is not complete (status: ${job.status})` },
        { status: 400 }
      )
    }

    if (!job.raw_video_url) {
      return NextResponse.json(
        { error: "Video job has no raw_video_url" },
        { status: 400 }
      )
    }

    const capitalizedStyle = job.video_style
      ? job.video_style.charAt(0).toUpperCase() + job.video_style.slice(1)
      : "Generated"

    // Use rendered video (with overlays) if provided, else raw
    const finalVideoUrl = renderedVideoUrl || job.raw_video_url
    const mediaHash = renderedVideoUrl
      ? `ai_video_rendered_${job.id}`
      : `ai_video_${job.id}`

    const { data: media, error: insertError } = await supabaseAdmin
      .from("media_library")
      .upsert(
        {
          user_id: userId,
          ad_account_id: cleanAccountId,
          media_hash: mediaHash,
          media_type: "video",
          name: `AI Video - ${capitalizedStyle}${renderedVideoUrl ? ' (Exported)' : ''}`,
          storage_url: finalVideoUrl,
          url: finalVideoUrl,
          source_type: "ai_video",
          source_job_id: job.id,
          download_status: "complete",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ad_account_id,media_hash" }
      )
      .select("id")
      .single()

    if (insertError || !media) {
      console.error("Failed to save video to media library:", insertError)
      return NextResponse.json(
        { error: "Failed to save video to media library" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, mediaId: media.id })
  } catch (err) {
    console.error("save-video-to-library error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
