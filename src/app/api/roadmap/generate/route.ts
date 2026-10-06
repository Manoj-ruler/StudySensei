import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError } from '@/server/http/responses'
import { RoadmapError, generateRoadmap } from '@/server/learning/roadmap'

export const maxDuration = 60

const bodySchema = z.object({
    skill_id: z.uuid(),
    document_ids: z.array(z.uuid()).max(50).default([]),
})

export const POST = withUser(async (request, { user, supabase }) => {
    const limited = await rateLimit(supabase, 'roadmap_generate')
    if (limited) return limited

    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(400, 'BAD_REQUEST', 'A skill is required.')
    }

    try {
        const roadmap = await generateRoadmap(
            supabase,
            user,
            body.data.skill_id,
            body.data.document_ids
        )
        return NextResponse.json(roadmap, { status: 201 })
    } catch (error) {
        if (error instanceof RoadmapError) {
            return apiError(error.status, error.status === 404 ? 'NOT_FOUND' : 'INTERNAL', error.message)
        }
        console.error('Roadmap generation failed:', error)
        return apiError(500, 'INTERNAL', 'The roadmap could not be generated. Please try again.')
    }
})
