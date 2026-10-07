import type { Instrumentation } from 'next'
import { describeError, log } from '@/server/observability/log'

/**
 * Called by Next.js for every error the server captures: in route handlers,
 * Server Components, and the proxy. This is the single place to forward
 * errors to a monitoring service (Sentry, Datadog, ...): add the call below.
 *
 * Only the path and method are recorded, never headers, cookies or bodies.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
    const digest =
        typeof error === 'object' && error !== null && 'digest' in error
            ? String(error.digest)
            : undefined

    log.error('request_error', {
        ...describeError(error),
        digest,
        method: request.method,
        path: request.path.split('?')[0],
        route: context.routePath,
        kind: context.routeType,
    })
}
