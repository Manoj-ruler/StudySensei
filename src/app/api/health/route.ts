import { NextResponse } from 'next/server'
import { SANDBOX_PROVIDERS } from '@/server/sandbox'

// Always evaluated at request time: it reports the running server's configuration.
export const dynamic = 'force-dynamic'

/**
 * Liveness and configuration check for uptime monitors and deploy smoke tests.
 * Reports only whether each required setting is present, never its value, and
 * makes no calls to Supabase, Gemini or the sandbox.
 */
export function GET() {
    const sandbox = (process.env.SANDBOX_PROVIDER ?? 'judge0').toLowerCase()

    const checks = {
        supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        supabase_anon_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        gemini_api_key: Boolean(process.env.GOOGLE_API_KEY),
        sandbox_provider:
            (SANDBOX_PROVIDERS as readonly string[]).includes(sandbox) &&
            (sandbox !== 'piston' || Boolean(process.env.PISTON_URL)) &&
            (sandbox !== 'mock' || process.env.NODE_ENV !== 'production'),
    }
    const ok = Object.values(checks).every(Boolean)

    return NextResponse.json(
        { status: ok ? 'ok' : 'misconfigured', checks },
        { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
    )
}
