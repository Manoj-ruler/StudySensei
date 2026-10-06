import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/server/db/database.types'

let cached: SupabaseClient<Database> | null = null

/**
 * Supabase client using the service-role key. It bypasses row level security,
 * so it is used only where the signed-in user must not have the access
 * themselves: reading hidden test cases for grading, and writing graded
 * results and progress records that clients may only read.
 *
 * Rules for callers:
 *   - check ownership with the user's own client first;
 *   - never return rows from this client to the browser unfiltered;
 *   - never import this from client components (the key is server-only).
 */
export function adminClient(): SupabaseClient<Database> {
    if (cached) return cached

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server-side only).')
    }

    cached = createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    return cached
}
