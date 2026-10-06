import { describe, expect, it } from 'vitest'
import { Judge0Executor } from '@/server/sandbox/judge0'
import { MockExecutor } from '@/server/sandbox/mock'
import { PistonExecutor } from '@/server/sandbox/piston'
import {
    isSandboxUnavailable,
    MAX_OUTPUT_CHARACTERS,
    type CodeExecutor,
    type ExecutionLimits,
    type ExecutionRequest,
} from '@/server/sandbox/types'

const limits: ExecutionLimits = { cpuTimeSeconds: 3, wallTimeSeconds: 6, memoryKb: 128_000 }
const program = (source: string, stdin = ''): ExecutionRequest => ({ language: 'python', source, stdin })
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** A scripted Judge0: lists languages, accepts a batch, reports "processing" once, then the given results. */
function fakeJudge0(results: Record<string, unknown>[]) {
    const calls: { url: string; headers: Record<string, string>; body?: { submissions: Record<string, unknown>[] } }[] = []
    let polls = 0
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
        const target = String(url)
        calls.push({
            url: target,
            headers: init?.headers as Record<string, string>,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        if (target.endsWith('/languages')) {
            return json([
                { id: 71, name: 'Python (3.8.1)' },
                { id: 113, name: 'Python (3.14.0)' },
                { id: 70, name: 'Python (2.7.17)' },
                { id: 63, name: 'JavaScript (Node.js 12.14.0)' },
                { id: 102, name: 'JavaScript (Node.js 22.08.0)' },
            ])
        }
        if (init?.method === 'POST') return json(results.map((_, i) => ({ token: `t${i}` })), 201)
        polls++
        return json({ submissions: polls === 1 ? results.map(() => ({ status: { id: 2 } })) : results })
    }) as typeof fetch
    return { fetchImpl, calls }
}

describe('Judge0Executor', () => {
    it('maps Judge0 statuses to execution results', async () => {
        const { fetchImpl } = fakeJudge0([
            { status: { id: 3 }, stdout: b64('6\n'), time: '0.021', memory: 9000, exit_code: 0 },
            { status: { id: 11 }, stderr: b64('ValueError: boom'), exit_code: 1, memory: 9000 },
            { status: { id: 5 }, message: b64('Time limit exceeded') },
            { status: { id: 11 }, exit_code: 137, memory: 128_000 },
            { status: { id: 6 }, compile_output: b64('SyntaxError') },
            { status: { id: 13 } },
        ])
        const results = await new Judge0Executor({ baseUrl: 'https://judge0.test', fetch: fetchImpl }).run(
            Array.from({ length: 6 }, () => program('x')),
            limits
        )
        expect(results.map((result) => result.status)).toEqual([
            'ok', 'runtime_error', 'time_limit', 'memory_limit', 'compile_error', 'sandbox_error',
        ])
        expect(results[0]).toMatchObject({ stdout: '6\n', timeMs: 21, memoryKb: 9000, exitCode: 0 })
        expect(results[1].stderr).toBe('ValueError: boom')
        expect(results[4].stderr).toBe('SyntaxError')
    })

    it('sends limits, base64 source and stdin, with networking off, using the newest language version', async () => {
        const { fetchImpl, calls } = fakeJudge0([{ status: { id: 3 }, stdout: b64('ok') }])
        await new Judge0Executor({ baseUrl: 'https://judge0.test/', fetch: fetchImpl }).run(
            [{ language: 'javascript', source: 'console.log(1)', stdin: 'in' }],
            limits
        )
        const submission = calls.find((call) => call.body)!.body!.submissions[0]
        expect(submission).toEqual({
            language_id: 102,
            source_code: b64('console.log(1)'),
            stdin: b64('in'),
            cpu_time_limit: 3,
            wall_time_limit: 6,
            memory_limit: 128_000,
            enable_network: false,
        })
    })

    it('honours pinned language ids without listing languages', async () => {
        const { fetchImpl, calls } = fakeJudge0([{ status: { id: 3 } }])
        await new Judge0Executor({
            baseUrl: 'https://judge0.test',
            fetch: fetchImpl,
            languageIds: { python: 71, javascript: 63 },
        }).run([program('x')], limits)
        expect(calls.some((call) => call.url.endsWith('/languages'))).toBe(false)
        expect(calls.find((call) => call.body)!.body!.submissions[0].language_id).toBe(71)
    })

    it('authenticates a self-hosted instance with X-Auth-Token and RapidAPI with its own headers', async () => {
        const own = fakeJudge0([{ status: { id: 3 } }])
        await new Judge0Executor({ baseUrl: 'https://judge0.test', apiKey: 'k1', fetch: own.fetchImpl }).run([program('x')], limits)
        expect(own.calls[0].headers['X-Auth-Token']).toBe('k1')

        const rapid = fakeJudge0([{ status: { id: 3 } }])
        await new Judge0Executor({ baseUrl: 'https://judge0-ce.p.rapidapi.com', apiKey: 'k2', fetch: rapid.fetchImpl }).run([program('x')], limits)
        expect(rapid.calls[0].headers).toMatchObject({ 'X-RapidAPI-Key': 'k2', 'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com' })
    })

    it('truncates very large output', async () => {
        const { fetchImpl } = fakeJudge0([{ status: { id: 3 }, stdout: b64('x'.repeat(50_000)) }])
        const [result] = await new Judge0Executor({ baseUrl: 'https://judge0.test', fetch: fetchImpl }).run([program('x')], limits)
        expect(result.stdout.length).toBeLessThan(MAX_OUTPUT_CHARACTERS + 100)
        expect(result.stdout).toMatch(/truncated/)
    })

    it('reports an unreachable or rejecting sandbox as unavailable', async () => {
        const offline = new Judge0Executor({
            baseUrl: 'https://judge0.test',
            fetch: (async () => { throw new TypeError('fetch failed') }) as typeof fetch,
        })
        const rejecting = new Judge0Executor({ baseUrl: 'https://judge0.test', fetch: (async () => json({}, 429)) as typeof fetch })
        for (const executor of [offline, rejecting]) {
            const error = await executor.run([program('x')], limits).catch((caught: unknown) => caught)
            expect(isSandboxUnavailable(error)).toBe(true)
        }
    })

    it('does nothing for an empty batch', async () => {
        const { fetchImpl, calls } = fakeJudge0([])
        expect(await new Judge0Executor({ baseUrl: 'https://judge0.test', fetch: fetchImpl }).run([], limits)).toEqual([])
        expect(calls).toHaveLength(0)
    })
})

describe('PistonExecutor', () => {
    const fakePiston = () => {
        const bodies: Record<string, unknown>[] = []
        const fetchImpl = (async (url: unknown, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body))
            bodies.push({ url: String(url), headers: init?.headers, ...body })
            const source: string = body.files[0].content
            const run = source.includes('loop')
                ? { stdout: '', stderr: '', code: null, signal: 'SIGKILL', status: 'TO', wall_time: 6000 }
                : source.includes('crash')
                  ? { stdout: '', stderr: 'ValueError: boom', code: 1, signal: null }
                  : source.includes('memory')
                    ? { stdout: '', stderr: '', code: null, signal: 'SIGKILL', memory: 128_000 * 1024 }
                    : { stdout: `${source}\n`, stderr: '', code: 0, signal: null, cpu_time: 12, memory: 9_000_000 }
            return json({ language: body.language, version: '3.12', run })
        }) as typeof fetch
        return { fetchImpl, bodies }
    }

    it('maps outcomes and keeps results in request order', async () => {
        const { fetchImpl } = fakePiston()
        const results = await new PistonExecutor({ baseUrl: 'http://piston.test/api/v2/', fetch: fetchImpl }).run(
            ['first', 'crash', 'loop', 'memory', 'fifth'].map((source) => program(source)),
            limits
        )
        expect(results.map((result) => result.status)).toEqual(['ok', 'runtime_error', 'time_limit', 'memory_limit', 'ok'])
        expect(results[0].stdout).toBe('first\n')
        expect(results[4].stdout).toBe('fifth\n')
        expect(results[1].stderr).toBe('ValueError: boom')
    })

    it('sends limits in the units Piston expects', async () => {
        const { fetchImpl, bodies } = fakePiston()
        await new PistonExecutor({ baseUrl: 'http://piston.test/api/v2', apiKey: 'pk', fetch: fetchImpl }).run([program('x', 'in')], limits)
        expect(bodies[0]).toMatchObject({
            url: 'http://piston.test/api/v2/execute',
            language: 'python',
            stdin: 'in',
            run_timeout: 6000,
            run_cpu_time: 3000,
            run_memory_limit: 128_000 * 1024,
        })
        expect((bodies[0].headers as Record<string, string>).Authorization).toBe('pk')
    })

    it('reports a rejecting server as unavailable', async () => {
        const executor = new PistonExecutor({ baseUrl: 'http://piston.test', fetch: (async () => json({ message: 'whitelist only' }, 401)) as typeof fetch })
        expect(isSandboxUnavailable(await executor.run([program('x')], limits).catch((caught: unknown) => caught))).toBe(true)
    })
})

describe('MockExecutor', () => {
    it('echoes stdin by default and records what it was asked to run', async () => {
        const mock = new MockExecutor()
        const [result] = await mock.run([program('print(1)', 'hello')], limits)
        expect(result).toMatchObject({ status: 'ok', stdout: 'hello' })
        expect(mock.calls).toEqual([program('print(1)', 'hello')])
    })

    it('can script any outcome', async () => {
        const mock = new MockExecutor((request) => (request.stdin === 'slow' ? { status: 'time_limit' } : { stdout: 'fine' }))
        const results = await mock.run([program('x', 'slow'), program('x', 'quick')], limits)
        expect(results.map((result) => result.status)).toEqual(['time_limit', 'ok'])
    })
})

it('every provider satisfies the same interface', () => {
    const providers: CodeExecutor[] = [
        new Judge0Executor({ baseUrl: 'https://judge0.test' }),
        new PistonExecutor({ baseUrl: 'http://piston.test' }),
        new MockExecutor(),
    ]
    expect(providers.map((provider) => provider.name)).toEqual(['judge0', 'piston', 'mock'])
})
