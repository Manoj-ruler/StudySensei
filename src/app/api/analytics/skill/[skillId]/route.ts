import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { apiError } from '@/server/http/responses'
import { skillAnalytics } from '@/server/learning/analytics'

interface RouteContext {
    params: Promise<{ skillId: string }>
}

export const GET = withUser<RouteContext>(async (_request, { supabase }, { params }) => {
    const skillId = z.uuid().safeParse((await params).skillId)
    if (!skillId.success) return apiError(400, 'BAD_REQUEST', 'Invalid skill id.')

    const analytics = await skillAnalytics(supabase, skillId.data)
    if (!analytics) return apiError(404, 'NOT_FOUND', 'Skill not found.')

    return NextResponse.json(analytics)
})
