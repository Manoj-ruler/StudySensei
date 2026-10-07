import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { PastQuiz, QuizHistoryResponse } from '@/lib/api/types'
import { withUser } from '@/server/auth/require-user'
import { apiError } from '@/server/http/responses'

interface RouteContext {
    params: Promise<{ skillId: string }>
}

/** The caller's completed quizzes for a skill, with answers for review. */
export const GET = withUser<RouteContext>(async (_request, { supabase }, { params }) => {
    const skillId = z.uuid().safeParse((await params).skillId)
    if (!skillId.success) return apiError(400, 'BAD_REQUEST', 'Invalid skill id.')

    const { data, error } = await supabase.rpc('get_quiz_history', { p_skill_id: skillId.data })
    if (error) {
        console.error('Quiz history failed:', error.message)
        return apiError(500, 'INTERNAL', 'Quiz history could not be loaded.')
    }

    const response: QuizHistoryResponse = { quizzes: (data ?? []) as unknown as PastQuiz[] }
    return NextResponse.json(response)
})
