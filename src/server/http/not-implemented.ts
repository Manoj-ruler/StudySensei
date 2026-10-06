import { withUser } from '@/server/auth/require-user'
import { apiError } from '@/server/http/responses'

/**
 * Placeholder for an endpoint whose implementation lands in a later phase.
 * It still enforces authentication, so the auth path is exercised end to end.
 */
export function notImplemented(feature: string) {
    return withUser(() =>
        apiError(501, 'NOT_IMPLEMENTED', `${feature} is not available yet.`)
    )
}
