import { z } from 'zod'
import { MENTOR_MODES, type MentorStreamEvent } from '@/lib/api/types'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError } from '@/server/http/responses'
import { mentorConfig } from '@/server/ai/config'
import { MentorError, prepareMentorTurn } from '@/server/mentor/service'

export const maxDuration = 120

const bodySchema = z.object({
    skill_id: z.uuid(),
    chat_id: z.uuid().nullable(),
    message: z.string().trim().min(1).max(mentorConfig.maxMessageCharacters),
    mode: z.enum(MENTOR_MODES),
})

/**
 * Streams the mentor's answer as newline-delimited JSON events:
 *   {"type":"meta","chat_id":...}   once, before any text
 *   {"type":"delta","text":...}     repeatedly, as the answer is generated
 *   {"type":"done","sources":[...]} once, with the sources the answer cited
 *   {"type":"error","message":...}  instead of "done" if generation fails
 */
export const POST = withUser(async (request, { user, supabase }) => {
    const limited = await rateLimit(supabase, 'mentor_message')
    if (limited) return limited

    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(
            400,
            'BAD_REQUEST',
            `A message of 1 to ${mentorConfig.maxMessageCharacters} characters is required.`
        )
    }

    let turn
    try {
        turn = await prepareMentorTurn({
            supabase,
            user,
            skillId: body.data.skill_id,
            chatId: body.data.chat_id,
            message: body.data.message,
            mode: body.data.mode,
        })
    } catch (error) {
        if (error instanceof MentorError) {
            return apiError(error.status, error.status === 404 ? 'NOT_FOUND' : 'INTERNAL', error.message)
        }
        console.error('Mentor turn could not be prepared:', error)
        return apiError(500, 'INTERNAL', 'The mentor is unavailable right now. Please try again.')
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (event: MentorStreamEvent) =>
                controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

            let answer = ''
            try {
                send({ type: 'meta', chat_id: turn.chatId })
                for await (const text of turn.stream(request.signal)) {
                    answer += text
                    send({ type: 'delta', text })
                }
                if (!answer.trim()) throw new Error('The model returned an empty answer.')
                send({ type: 'done', sources: await turn.finish(answer) })
            } catch (error) {
                // Keep whatever was generated before the failure or disconnect.
                if (answer.trim()) await turn.finish(answer)
                if (!request.signal.aborted) {
                    console.error('Mentor generation failed:', error)
                    send({
                        type: 'error',
                        message: 'The mentor could not finish this answer. Please try again.',
                    })
                }
            } finally {
                try {
                    controller.close()
                } catch {
                    // Already closed by a client disconnect.
                }
            }
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        },
    })
})
