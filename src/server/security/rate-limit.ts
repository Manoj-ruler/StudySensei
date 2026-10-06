import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/server/db/database.types'
import { apiError } from '@/server/http/responses'

const MINUTE = 60
const DAY = 86_400

interface Limit {
    limit: number
    windowSeconds: typeof MINUTE | typeof DAY
}

/**
 * Per-user allowances. The per-minute figure stops bursts; the per-day figure
 * caps what one account can cost in model and sandbox usage.
 * Action names must match the check constraint on public.rate_limits.
 */
export const RATE_LIMITS = {
    mentor_message: [{ limit: 15, windowSeconds: MINUTE }, { limit: 300, windowSeconds: DAY }],
    document_upload: [{ limit: 6, windowSeconds: MINUTE }, { limit: 60, windowSeconds: DAY }],
    document_process: [{ limit: 6, windowSeconds: MINUTE }, { limit: 60, windowSeconds: DAY }],
    document_search: [{ limit: 30, windowSeconds: MINUTE }],
    quiz_generate: [{ limit: 4, windowSeconds: MINUTE }, { limit: 60, windowSeconds: DAY }],
    quiz_answer: [{ limit: 60, windowSeconds: MINUTE }],
    roadmap_generate: [{ limit: 3, windowSeconds: MINUTE }, { limit: 30, windowSeconds: DAY }],
    challenge_generate: [{ limit: 3, windowSeconds: MINUTE }, { limit: 40, windowSeconds: DAY }],
    code_submit: [{ limit: 8, windowSeconds: MINUTE }, { limit: 300, windowSeconds: DAY }],
} as const satisfies Record<string, readonly Limit[]>

export type RateLimitedAction = keyof typeof RATE_LIMITS

/**
 * Counts one use of `action` by the signed-in user and returns a 429 response
 * if they are over an allowance, or null if the request may proceed.
 *
 * The counting is atomic in the database (consume_rate_limit), so parallel
 * requests cannot slip past it.
 *
 * If the limiter itself fails, the request is allowed and the failure is
 * logged: an outage of the counter should not take the product down with it.
 */
export async function rateLimit(
    supabase: SupabaseClient<Database>,
    action: RateLimitedAction
): Promise<Response | null> {
    for (const { limit, windowSeconds } of RATE_LIMITS[action]) {
        const { data: allowed, error } = await supabase.rpc('consume_rate_limit', {
            p_action: action,
            p_limit: limit,
            p_window_seconds: windowSeconds,
        })
        if (error) {
            console.error(`Rate limiter unavailable for ${action}:`, error.message)
            return null
        }
        if (allowed === false) {
            const response = apiError(
                429,
                'RATE_LIMITED',
                windowSeconds === MINUTE
                    ? 'You are doing that too quickly. Wait a minute and try again.'
                    : 'You have reached today\'s limit for this action. Try again tomorrow.'
            )
            response.headers.set('Retry-After', String(windowSeconds === MINUTE ? MINUTE : 3600))
            return response
        }
    }
    return null
}
