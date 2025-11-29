import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const META_APP_SECRET = process.env.META_APP_SECRET!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Verify the request came from Meta
function verifySignature(signature: string, payload: string): boolean {
  const expectedSig = crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(payload)
    .digest('hex')
  return signature === `sha256=${expectedSig}`
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-hub-signature-256') || ''
    const body = await request.text()
    
    // Verify request is from Meta
    if (!verifySignature(signature, body)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    
    const data = JSON.parse(body)
    const metaUserId = data.user_id
    
    if (!metaUserId) {
      return NextResponse.json({ error: 'No user_id provided' }, { status: 400 })
    }
    
    // Find and delete the user's Meta connection
    const { data: connection, error: findError } = await supabase
      .from('meta_connections')
      .select('id, user_id')
      .eq('meta_user_id', metaUserId)
      .single()
    
    if (connection) {
      // Delete Meta connection
      await supabase
        .from('meta_connections')
        .delete()
        .eq('meta_user_id', metaUserId)
      
      // Optionally delete their synced ad data too
      await supabase
        .from('ad_data')
        .delete()
        .eq('user_id', connection.user_id)
        .eq('source', 'meta_api')
    }
    
    // Generate confirmation code
    const confirmationCode = crypto.randomBytes(16).toString('hex')
    
    // Meta expects this response format
    return NextResponse.json({
      url: `https://killscale.com/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode
    })
    
  } catch (err) {
    console.error('Data deletion error:', err)
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 })
  }
}
