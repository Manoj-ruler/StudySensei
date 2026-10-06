import { NextResponse } from 'next/server'

export type ApiErrorCode =
    | 'UNAUTHENTICATED'
    | 'NOT_IMPLEMENTED'
    | 'BAD_REQUEST'
    | 'NOT_FOUND'
    | 'INTERNAL'

/** Every API error has the same shape so the client can handle them uniformly. */
export function apiError(status: number, code: ApiErrorCode, message: string) {
    return NextResponse.json({ error: { code, message } }, { status })
}
