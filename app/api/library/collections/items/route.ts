import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Add item(s) to a collection
export async function POST(request: NextRequest) {
  try {
    const { userId, collectionId, mediaLibraryIds } = await request.json()

    if (!userId || !collectionId || !mediaLibraryIds?.length) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: userId, collectionId, mediaLibraryIds",
        },
        { status: 400 }
      )
    }

    // Verify ownership of collection
    const { data: collection, error: collError } = await supabase
      .from("media_collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .single()

    if (collError || !collection) {
      return NextResponse.json(
        { error: "Collection not found or unauthorized" },
        { status: 404 }
      )
    }

    // Get current max sort_order
    const { data: maxItem } = await supabase
      .from("media_collection_items")
      .select("sort_order")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()

    let nextOrder = (maxItem?.sort_order ?? -1) + 1

    // Build insert rows
    const rows = (mediaLibraryIds as number[]).map((mediaId) => ({
      collection_id: collectionId,
      media_library_id: mediaId,
      sort_order: nextOrder++,
    }))

    // Upsert (ignore duplicates via ON CONFLICT)
    const { data: items, error } = await supabase
      .from("media_collection_items")
      .upsert(rows, { onConflict: "collection_id,media_library_id" })
      .select("*")

    if (error) {
      console.error("[CollectionItems] Insert error:", error)
      return NextResponse.json(
        { error: "Failed to add items to collection" },
        { status: 500 }
      )
    }

    // Update collection's updated_at and cover image if needed
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    // Set cover image from first added item if collection has no cover
    const { data: coll } = await supabase
      .from("media_collections")
      .select("cover_image_url")
      .eq("id", collectionId)
      .single()

    if (!coll?.cover_image_url) {
      const { data: firstMedia } = await supabase
        .from("media_library")
        .select("storage_url, video_thumbnail_url, url")
        .eq("id", mediaLibraryIds[0])
        .single()

      if (firstMedia) {
        updatePayload.cover_image_url =
          firstMedia.video_thumbnail_url ||
          firstMedia.storage_url ||
          firstMedia.url
      }
    }

    await supabase
      .from("media_collections")
      .update(updatePayload)
      .eq("id", collectionId)

    return NextResponse.json({ items: items ?? [], added: rows.length })
  } catch (err) {
    console.error("[CollectionItems] POST error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE - Remove item(s) from a collection
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const collectionId = searchParams.get("collectionId")
    const mediaLibraryId = searchParams.get("mediaLibraryId")

    if (!userId || !collectionId || !mediaLibraryId) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: userId, collectionId, mediaLibraryId",
        },
        { status: 400 }
      )
    }

    // Verify ownership of collection
    const { data: collection, error: collError } = await supabase
      .from("media_collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .single()

    if (collError || !collection) {
      return NextResponse.json(
        { error: "Collection not found or unauthorized" },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from("media_collection_items")
      .delete()
      .eq("collection_id", collectionId)
      .eq("media_library_id", Number(mediaLibraryId))

    if (error) {
      console.error("[CollectionItems] Delete error:", error)
      return NextResponse.json(
        { error: "Failed to remove item from collection" },
        { status: 500 }
      )
    }

    // Update collection timestamp
    await supabase
      .from("media_collections")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", collectionId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[CollectionItems] DELETE error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
