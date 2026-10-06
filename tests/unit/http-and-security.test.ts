import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, api, errorMessage } from '@/lib/api/client'
import type { MentorStreamEvent } from '@/lib/api/types'
import { documentState, isDocumentInProgress } from '@/lib/documents'
import { isCrossSiteRequest } from '@/server/auth/require-user'
import type { Database } from '@/server/db/database.types'
import { statusCode } from '@/server/http/responses'
import { RATE_LIMITS, rateLimit } from '@/server/security/rate-limit'
import { safeRedirectPath } from '@/utils/safe-redirect'

describe('safeRedirectPath', () => {
    it('accepts same-site paths', () => {
        expect(safeRedirectPath('/dashboard')).toBe('/dashboard')
        expect(safeRedirectPath('/skills/abc?mode=coach')).toBe('/skills/abc?mode=coach')
    })

    it.each(['@evil.com', '//evil.com', 'https://evil.com', '.evil.com', '/\\evil.com', '', null, undefined])(
        'falls back for %s',
        (target) => {
            expect(safeRedirectPath(target, '/home')).toBe('/home')
        }
    )
})

describe('isCrossSiteRequest', () => {
    const request = (method: string, headers: Record<string, string>) =>
        new Request('http://app.test/api/x', { method, headers: { host: 'app.test', ...headers } })

    it('allows same-origin and non-browser requests', () => {
        expect(isCrossSiteRequest(request('POST', { origin: 'http://app.test' }))).toBe(false)
        expect(isCrossSiteRequest(request('POST', {}))).toBe(false)
    })

    it('refuses state-changing requests from another origin', () => {
        expect(isCrossSiteRequest(request('POST', { origin: 'https://evil.example' }))).toBe(true)
        expect(isCrossSiteRequest(request('DELETE', { origin: 'https://evil.example' }))).toBe(true)
        expect(isCrossSiteRequest(request('POST', { origin: 'null' }))).toBe(true)
        expect(isCrossSiteRequest(request('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(true)
    })

    it('does not block read-only requests', () => {
        expect(isCrossSiteRequest(request('GET', { origin: 'https://evil.example' }))).toBe(false)
    })

    it('uses the forwarded host behind a proxy', () => {
        expect(isCrossSiteRequest(request('POST', { origin: 'https://app.example', 'x-forwarded-host': 'app.example' }))).toBe(false)
    })
})

describe('rateLimit', () => {
    const client = (results: ({ data: boolean } | { error: { message: string } })[]) => {
        const rpc = vi.fn(async () => results.shift() ?? { data: true })
        return { supabase: { rpc } as unknown as SupabaseClient<Database>, rpc }
    }

    it('checks every window for the action and allows when all pass', async () => {
        const { supabase, rpc } = client([{ data: true }, { data: true }])
        expect(await rateLimit(supabase, 'mentor_message')).toBeNull()
        expect(rpc).toHaveBeenCalledTimes(RATE_LIMITS.mentor_message.length)
        expect(rpc).toHaveBeenCalledWith('consume_rate_limit', { p_action: 'mentor_message', p_limit: 15, p_window_seconds: 60 })
    })

    it('returns 429 with a retry hint when over the per-minute allowance', async () => {
        const { supabase } = client([{ data: false }])
        const response = await rateLimit(supabase, 'code_submit')
        expect(response?.status).toBe(429)
        expect(response?.headers.get('Retry-After')).toBe('60')
        expect(await response?.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } })
    })

    it('gives a different message for the daily allowance', async () => {
        const { supabase } = client([{ data: true }, { data: false }])
        const body = await (await rateLimit(supabase, 'code_submit'))?.json()
        expect(body.error.message).toMatch(/today/i)
    })

    it('allows the request if the limiter itself is unavailable', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { supabase } = client([{ error: { message: 'function not found' } }])
        expect(await rateLimit(supabase, 'quiz_generate')).toBeNull()
        expect(log).toHaveBeenCalled()
        log.mockRestore()
    })
})

describe('small helpers', () => {
    it('maps statuses to error codes', () => {
        expect([400, 404, 429, 502, 503, 500].map(statusCode)).toEqual([
            'BAD_REQUEST', 'NOT_FOUND', 'RATE_LIMITED', 'UNAVAILABLE', 'UNAVAILABLE', 'INTERNAL',
        ])
    })

    it('maps document status to what the list shows', () => {
        const state = (status: string | null) => documentState({ status, processed: null })
        expect(['ready', 'processing', 'failed', 'pending', null, 'anything'].map(state)).toEqual([
            'ready', 'processing', 'failed', 'pending', 'pending', 'pending',
        ])
        expect(isDocumentInProgress({ status: 'processing', processed: null })).toBe(true)
        expect(isDocumentInProgress({ status: 'pending', processed: null })).toBe(false)
    })
})

describe('API client', () => {
    const streamOf = (parts: string[]) =>
        new ReadableStream<Uint8Array>({
            start(controller) {
                for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
                controller.close()
            },
        })
    const payload = { skill_id: 's', chat_id: null, message: 'hi', mode: 'explain' as const }

    it('parses streamed events even when a line is split across network chunks', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            streamOf(['{"type":"meta","chat_id":"c1"}\n{"type":"del', 'ta","text":"Hel"}\n', '{"type":"delta","text":"lo"}\n{"type":"done","sources":[]}']),
            { status: 200 }
        )))
        const events: MentorStreamEvent[] = []
        await api.mentor.streamMessage(payload, (event) => events.push(event))
        expect(events).toEqual([
            { type: 'meta', chat_id: 'c1' },
            { type: 'delta', text: 'Hel' },
            { type: 'delta', text: 'lo' },
            { type: 'done', sources: [] },
        ])
        vi.unstubAllGlobals()
    })

    it("turns the server's error body into an ApiError", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too fast.' } }), { status: 429 })))
        const error = await api.quiz.generate({ skill_id: 's', num_questions: 5 }).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', message: 'Too fast.' })
        expect(errorMessage(error)).toBe('Too fast.')
        vi.unstubAllGlobals()
    })

    it('reports a network failure without leaking internals', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed: ECONNREFUSED 10.0.0.1') }))
        const error = await api.analytics.skill('s').catch((caught: unknown) => caught)
        expect(error).toMatchObject({ code: 'NETWORK', status: 0 })
        expect(errorMessage(error)).not.toMatch(/ECONNREFUSED/)
        expect(errorMessage(new Error('boom'), 'Fallback.')).toBe('Fallback.')
        vi.unstubAllGlobals()
    })
})
