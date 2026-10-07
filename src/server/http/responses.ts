import { NextResponse } from 'next/server'

export type ApiErrorCode =
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_IMPLEMENTED'
    | 'BAD_REQUEST'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'UNAVAILABLE'
    | 'INTERNAL'

/** Error code for an HTTP status, for handlers that map a service error straight through. */
export function statusCode(status: number): ApiErrorCode {
    if (status === 400) return 'BAD_REQUEST'
    if (status === 404) return 'NOT_FOUND'
    if (status === 429) return 'RATE_LIMITED'
    if (status === 502 || status === 503) return 'UNAVAILABLE'
    return 'INTERNAL'
}

/** Every API error has the same shape so the client can handle them uniformly. */
export function apiError(status: number, code: ApiErrorCode, message: string) {
    return NextResponse.json({ error: { code, message } }, { status })
}
