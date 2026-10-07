import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/server/http/responses'
import type { Database } from '@/server/db/database.types'

export interface AuthContext {
    user: User
    /** Supabase client acting as the signed-in user, so RLS applies. */
    supabase: SupabaseClient<Database>
}

type AuthedHandler<TRouteContext> = (
    request: Request,
    auth: AuthContext,
    routeContext: TRouteContext
) => Promise<Response> | Response

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * True when a state-changing request comes from another site.
 *
 * The session lives in a cookie, so a page on another origin could try to make
 * the browser call this API with it. Browsers send an Origin header on such
 * requests; it must match the host being called. (SameSite cookies already
 * block most of this; the check does not depend on that default.)
 */
export function isCrossSiteRequest(request: Request): boolean {
    if (SAFE_METHODS.has(request.method)) return false

    const origin = request.headers.get('origin')
    if (!origin) {
        // Non-browser clients send no Origin. A browser that omits it still
        // reports the request's site here.
        return request.headers.get('sec-fetch-site') === 'cross-site'
    }

    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    try {
        return new URL(origin).host !== host
    } catch {
        return true
    }
}

/**
 * Wraps a route handler so it only runs for a signed-in user.
 * The user comes from the verified session cookie, never from the request
 * body: handlers must not accept a client-supplied user id.
 */
export function withUser<TRouteContext = unknown>(handler: AuthedHandler<TRouteContext>) {
    return async (request: Request, routeContext: TRouteContext) => {
        if (isCrossSiteRequest(request)) {
            return apiError(403, 'FORBIDDEN', 'This request is not allowed from another site.')
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return apiError(401, 'UNAUTHENTICATED', 'You need to sign in to do that.')
        }
        return handler(request, { user, supabase }, routeContext)
    }
}
