import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { apiError, statusCode } from '@/server/http/responses'
import { CodingError, evaluateSubmission } from '@/server/coding/submit'

export const maxDuration = 120

/** Larger than any reasonable solution; keeps sandbox requests small. */
const MAX_CODE_CHARACTERS = 20_000

const bodySchema = z.object({
    question_id: z.uuid(),
    code: z.string().min(1).max(MAX_CODE_CHARACTERS),
    language: z.enum(['python', 'javascript']),
})

/** Runs the submitted code against the challenge's test cases in the sandbox and grades it. */
export const POST = withUser(async (request, { user, supabase }) => {
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(
            400,
            'BAD_REQUEST',
            `Code (up to ${MAX_CODE_CHARACTERS.toLocaleString('en-US')} characters) and a supported language are required.`
        )
    }

    try {
        const outcome = await evaluateSubmission(supabase, user, {
            questionId: body.data.question_id,
            code: body.data.code,
            language: body.data.language,
        })
        return NextResponse.json(outcome)
    } catch (error) {
        if (error instanceof CodingError) {
            return apiError(error.status, statusCode(error.status), error.message)
        }
        console.error('Submission evaluation failed:', error)
        return apiError(500, 'INTERNAL', 'Your code could not be evaluated. Please try again.')
    }
})
