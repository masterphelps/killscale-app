import { createClient } from '@supabase/supabase-js'

// Singleton Supabase client for browser-side code
// All client components should import from here to avoid multiple GoTrueClient instances
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
