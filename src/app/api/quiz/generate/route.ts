import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { apiError } from '@/server/http/responses'
import { QuizError, generateQuiz } from '@/server/learning/quiz'

export const maxDuration = 60

const bodySchema = z.object({
    skill_id: z.uuid(),
    num_questions: z.number().int().min(1).max(10),
})

export const POST = withUser(async (request, { user, supabase }) => {
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(400, 'BAD_REQUEST', 'A skill and a question count from 1 to 10 are required.')
    }

    try {
        const quiz = await generateQuiz(supabase, user, body.data.skill_id, body.data.num_questions)
        return NextResponse.json(quiz, { status: 201 })
    } catch (error) {
        if (error instanceof QuizError) {
            return apiError(error.status, error.status === 404 ? 'NOT_FOUND' : 'INTERNAL', error.message)
        }
        console.error('Quiz generation failed:', error)
        return apiError(500, 'INTERNAL', 'The quiz could not be generated. Please try again.')
    }
})
