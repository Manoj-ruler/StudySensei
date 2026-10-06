import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/server/http/responses'

export interface AuthContext {
    user: User
    /** Supabase client acting as the signed-in user, so RLS applies. */
    supabase: SupabaseClient
}

type AuthedHandler<TRouteContext> = (
    request: Request,
    auth: AuthContext,
    routeContext: TRouteContext
) => Promise<Response> | Response

/**
 * Wraps a route handler so it only runs for a signed-in user.
 * The user comes from the verified session cookie, never from the request
 * body: handlers must not accept a client-supplied user id.
 */
export function withUser<TRouteContext = unknown>(handler: AuthedHandler<TRouteContext>) {
    return async (request: Request, routeContext: TRouteContext) => {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return apiError(401, 'UNAUTHENTICATED', 'You need to sign in to do that.')
        }
        return handler(request, { user, supabase }, routeContext)
    }
}
