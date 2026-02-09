import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { videoJobId, userId, adAccountId } = await request.json()

    if (!videoJobId || !userId || !adAccountId) {
      return NextResponse.json(
        { error: "Missing required fields: videoJobId, userId, adAccountId" },
        { status: 400 }
      )
    }

    // Verify the job exists, belongs to the user, and is complete
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

    // Strip act_ prefix for media_library consistency
    const cleanAccountId = adAccountId.replace(/^act_/, "")

    // Capitalize the video style for the display name
    const capitalizedStyle = job.video_style
      ? job.video_style.charAt(0).toUpperCase() + job.video_style.slice(1)
      : "Generated"

    const mediaHash = `ai_video_${job.id}`

    // Upsert into media_library (unique on user_id, ad_account_id, media_hash)
    const { data: media, error: insertError } = await supabaseAdmin
      .from("media_library")
      .upsert(
        {
          user_id: userId,
          ad_account_id: cleanAccountId,
          media_hash: mediaHash,
          media_type: "video",
          name: `AI Video - ${capitalizedStyle}`,
          storage_url: job.raw_video_url,
          url: job.raw_video_url,
          source_type: "ai_video",
          download_status: "complete",
          synced_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,ad_account_id,media_hash",
        }
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

    return NextResponse.json({
      success: true,
      mediaId: media.id,
    })
  } catch (err) {
    console.error("save-video-to-library error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
