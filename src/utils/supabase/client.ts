import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/server/db/database.types'

export function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
        console.error('Supabase Env Vars Missing:', { url: !!url, key: !!key })
    }

    return createBrowserClient<Database>(url!, key!)
}
