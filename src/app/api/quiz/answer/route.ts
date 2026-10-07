import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { QuizAnswerResponse } from '@/lib/api/types'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError } from '@/server/http/responses'

const bodySchema = z.object({
    question_id: z.uuid(),
    answer: z.number().int().min(0).max(9),
})

/**
 * Grades one answer. The grading itself happens in the database function
 * answer_quiz_question(), which holds the answer key the browser cannot read.
 */
export const POST = withUser(async (request, { supabase }) => {
    const limited = await rateLimit(supabase, 'quiz_answer')
    if (limited) return limited

    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(400, 'BAD_REQUEST', 'A question and an answer are required.')
    }

    const { data, error } = await supabase.rpc('answer_quiz_question', {
        p_question_id: body.data.question_id,
        p_answer: body.data.answer,
    })

    if (error) {
        // P0002: not found or not the caller's question. 22023: answer out of range.
        if (error.code === 'P0002') return apiError(404, 'NOT_FOUND', 'Question not found.')
        if (error.code === '22023') return apiError(400, 'BAD_REQUEST', 'That is not one of the options.')
        console.error('Quiz grading failed:', error.message)
        return apiError(500, 'INTERNAL', 'Your answer could not be checked. Please try again.')
    }

    const result = data?.[0]
    if (!result) return apiError(404, 'NOT_FOUND', 'Question not found.')

    return NextResponse.json(result satisfies QuizAnswerResponse)
})
