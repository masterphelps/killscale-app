import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List collections or get a specific one
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const adAccountId = searchParams.get("adAccountId")
    const collectionId = searchParams.get("collectionId")

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    // Get specific collection with item count
    if (collectionId) {
      const { data: collection, error } = await supabase
        .from("media_collections")
        .select("*, media_collection_items(count)")
        .eq("id", collectionId)
        .eq("user_id", userId)
        .single()

      if (error) {
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 }
        )
      }

      // Get items with media details
      const { data: items } = await supabase
        .from("media_collection_items")
        .select("*, media_library(*)")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: true })

      return NextResponse.json({
        collection: {
          ...collection,
          item_count:
            collection.media_collection_items?.[0]?.count ?? 0,
          items: items ?? [],
        },
      })
    }

    // List all collections for account
    if (!adAccountId) {
      return NextResponse.json(
        { error: "Missing adAccountId" },
        { status: 400 }
      )
    }

    const cleanAccountId = adAccountId.replace(/^act_/, "")

    const { data: collections, error } = await supabase
      .from("media_collections")
      .select("*, media_collection_items(count)")
      .eq("user_id", userId)
      .eq("ad_account_id", cleanAccountId)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[Collections] List error:", error)
      return NextResponse.json(
        { error: "Failed to list collections" },
        { status: 500 }
      )
    }

    // Flatten count and fetch cover images
    const result = (collections ?? []).map((c) => ({
      ...c,
      item_count: c.media_collection_items?.[0]?.count ?? 0,
      media_collection_items: undefined,
    }))

    return NextResponse.json({ collections: result })
  } catch (err) {
    console.error("[Collections] GET error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST - Create a new collection
export async function POST(request: NextRequest) {
  try {
    const { userId, adAccountId, name, description } = await request.json()

    if (!userId || !adAccountId || !name) {
      return NextResponse.json(
        { error: "Missing required fields: userId, adAccountId, name" },
        { status: 400 }
      )
    }

    const cleanAccountId = adAccountId.replace(/^act_/, "")

    const { data: collection, error } = await supabase
      .from("media_collections")
      .insert({
        user_id: userId,
        ad_account_id: cleanAccountId,
        name,
        description: description || null,
      })
      .select("*")
      .single()

    if (error) {
      console.error("[Collections] Create error:", error)
      return NextResponse.json(
        { error: "Failed to create collection" },
        { status: 500 }
      )
    }

    return NextResponse.json({ collection })
  } catch (err) {
    console.error("[Collections] POST error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PATCH - Update a collection (rename, description, cover image)
export async function PATCH(request: NextRequest) {
  try {
    const { userId, collectionId, name, description, coverImageUrl } =
      await request.json()

    if (!userId || !collectionId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, collectionId" },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (coverImageUrl !== undefined) updates.cover_image_url = coverImageUrl

    const { data: collection, error } = await supabase
      .from("media_collections")
      .update(updates)
      .eq("id", collectionId)
      .eq("user_id", userId)
      .select("*")
      .single()

    if (error) {
      console.error("[Collections] Update error:", error)
      return NextResponse.json(
        { error: "Failed to update collection" },
        { status: 500 }
      )
    }

    return NextResponse.json({ collection })
  } catch (err) {
    console.error("[Collections] PATCH error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a collection
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const collectionId = searchParams.get("collectionId")

    if (!userId || !collectionId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, collectionId" },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("media_collections")
      .delete()
      .eq("id", collectionId)
      .eq("user_id", userId)

    if (error) {
      console.error("[Collections] Delete error:", error)
      return NextResponse.json(
        { error: "Failed to delete collection" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Collections] DELETE error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
