import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError, statusCode } from '@/server/http/responses'
import { generateChallenge } from '@/server/coding/generate'
import { CodingError } from '@/server/coding/submit'

export const maxDuration = 120

const bodySchema = z.object({
    skill_id: z.uuid(),
    topic: z.string().trim().min(1).max(200),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']),
})

export const POST = withUser(async (request, { user, supabase }) => {
    const limited = await rateLimit(supabase, 'challenge_generate')
    if (limited) return limited

    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(400, 'BAD_REQUEST', 'A skill, a topic and a difficulty are required.')
    }

    try {
        const question = await generateChallenge(supabase, user, {
            skillId: body.data.skill_id,
            topic: body.data.topic,
            difficulty: body.data.difficulty,
        })
        return NextResponse.json({ question }, { status: 201 })
    } catch (error) {
        if (error instanceof CodingError) {
            return apiError(error.status, statusCode(error.status), error.message)
        }
        console.error('Challenge generation failed:', error)
        return apiError(500, 'INTERNAL', 'The challenge could not be generated. Please try again.')
    }
})
