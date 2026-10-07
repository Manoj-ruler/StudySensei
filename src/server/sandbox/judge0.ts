import type { CodeLanguage } from '@/lib/api/types'
import {
    clip,
    SandboxUnavailableError,
    type CodeExecutor,
    type ExecutionLimits,
    type ExecutionRequest,
    type ExecutionResult,
    type ExecutionStatus,
} from './types'

export interface Judge0Options {
    /** Base URL of a Judge0 instance, e.g. https://ce.judge0.com or a self-hosted one. */
    baseUrl: string
    /** Optional key: sent as X-Auth-Token, or as RapidAPI headers for *.rapidapi.com hosts. */
    apiKey?: string
    /** Pin language ids instead of picking the newest version the instance offers. */
    languageIds?: Partial<Record<CodeLanguage, number>>
    fetch?: typeof fetch
}

interface Judge0Language {
    id: number
    name: string
}

interface Judge0Submission {
    status?: { id: number; description?: string }
    stdout?: string | null
    stderr?: string | null
    compile_output?: string | null
    message?: string | null
    time?: string | null
    memory?: number | null
    exit_code?: number | null
}

const LANGUAGE_NAME: Record<CodeLanguage, RegExp> = {
    python: /^Python \(3\.(\d+)/,
    javascript: /^JavaScript \(Node\.js (\d+)/,
}

/** Judge0 accepts at most this many submissions per batch request by default. */
const BATCH_SIZE = 20
const POLL_INTERVAL_MS = 700
const FIELDS = 'status,stdout,stderr,compile_output,message,time,memory,exit_code'

const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64')
const decode = (text: string | null | undefined) =>
    text ? Buffer.from(text, 'base64').toString('utf8') : ''

/** Judge0 status ids: 1-2 queued/processing, 3 accepted, 5 TLE, 6 compile error, 7-12 runtime errors, 13-14 internal. */
function toStatus(submission: Judge0Submission, limits: ExecutionLimits): ExecutionStatus {
    const id = submission.status?.id ?? 13
    if (id === 3 || id === 4) return 'ok'
    if (id === 5) return 'time_limit'
    if (id === 6) return 'compile_error'
    if (id >= 7 && id <= 12) {
        // A process killed at the memory cap is reported as a generic runtime error.
        const hitMemoryCap =
            submission.exit_code === 137 || (submission.memory ?? 0) >= limits.memoryKb * 0.98
        return hitMemoryCap ? 'memory_limit' : 'runtime_error'
    }
    return 'sandbox_error'
}

export class Judge0Executor implements CodeExecutor {
    readonly name = 'judge0'

    private readonly baseUrl: string
    private readonly headers: Record<string, string>
    private readonly pinned: Partial<Record<CodeLanguage, number>>
    private readonly fetchImpl: typeof fetch
    private languages: Promise<Record<CodeLanguage, number>> | null = null

    constructor(options: Judge0Options) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '')
        this.pinned = options.languageIds ?? {}
        this.fetchImpl = options.fetch ?? fetch

        this.headers = { 'Content-Type': 'application/json' }
        if (options.apiKey) {
            const host = new URL(this.baseUrl).host
            if (host.endsWith('rapidapi.com')) {
                this.headers['X-RapidAPI-Key'] = options.apiKey
                this.headers['X-RapidAPI-Host'] = host
            } else {
                this.headers['X-Auth-Token'] = options.apiKey
            }
        }
    }

    private async request<T>(path: string, init?: RequestInit): Promise<T> {
        let response: Response
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                ...init,
                headers: this.headers,
                signal: AbortSignal.timeout(20_000),
            })
        } catch (error) {
            throw new SandboxUnavailableError('The code sandbox could not be reached.', { cause: error })
        }
        if (!response.ok) {
            throw new SandboxUnavailableError(`The code sandbox rejected the request (${response.status}).`)
        }
        return (await response.json()) as T
    }

    /** Resolves each language to the newest version this instance offers, once. */
    private languageIds(): Promise<Record<CodeLanguage, number>> {
        this.languages ??= (async () => {
            const available =
                this.pinned.python && this.pinned.javascript
                    ? []
                    : await this.request<Judge0Language[]>('/languages')

            const newest = (language: CodeLanguage) => {
                if (this.pinned[language]) return this.pinned[language]!
                const best = available
                    .map((entry) => ({ id: entry.id, version: LANGUAGE_NAME[language].exec(entry.name) }))
                    .filter((entry) => entry.version)
                    .sort((a, b) => Number(b.version![1]) - Number(a.version![1]))[0]
                if (!best) {
                    throw new SandboxUnavailableError(`The code sandbox does not offer ${language}.`)
                }
                return best.id
            }
            return { python: newest('python'), javascript: newest('javascript') }
        })().catch((error) => {
            this.languages = null // retry on the next call rather than caching the failure
            throw error
        })
        return this.languages
    }

    async run(requests: ExecutionRequest[], limits: ExecutionLimits): Promise<ExecutionResult[]> {
        if (requests.length === 0) return []
        const ids = await this.languageIds()

        const results: ExecutionResult[] = []
        for (let start = 0; start < requests.length; start += BATCH_SIZE) {
            results.push(...(await this.runBatch(requests.slice(start, start + BATCH_SIZE), limits, ids)))
        }
        return results
    }

    private async runBatch(
        requests: ExecutionRequest[],
        limits: ExecutionLimits,
        ids: Record<CodeLanguage, number>
    ): Promise<ExecutionResult[]> {
        const created = await this.request<{ token?: string }[]>('/submissions/batch?base64_encoded=true', {
            method: 'POST',
            body: JSON.stringify({
                submissions: requests.map((request) => ({
                    language_id: ids[request.language],
                    source_code: encode(request.source),
                    stdin: encode(request.stdin),
                    cpu_time_limit: limits.cpuTimeSeconds,
                    wall_time_limit: limits.wallTimeSeconds,
                    memory_limit: limits.memoryKb,
                    enable_network: false,
                })),
            }),
        })

        const tokens = created.map((entry) => entry.token)
        if (tokens.length !== requests.length || tokens.some((token) => !token)) {
            throw new SandboxUnavailableError('The code sandbox did not accept every submission.')
        }

        // Runs are queued; allow for each to use its full wall time plus queueing.
        const deadline = Date.now() + (limits.wallTimeSeconds * requests.length + 30) * 1000
        for (;;) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
            const { submissions } = await this.request<{ submissions: (Judge0Submission | null)[] }>(
                `/submissions/batch?base64_encoded=true&tokens=${tokens.join(',')}&fields=${FIELDS}`
            )
            const finished = submissions.every((submission) => (submission?.status?.id ?? 0) > 2)
            if (finished) {
                return submissions.map((submission) => {
                    const done = submission ?? {}
                    const status = toStatus(done, limits)
                    const seconds = done.time ? Number.parseFloat(done.time) : Number.NaN
                    return {
                        status,
                        stdout: clip(decode(done.stdout)),
                        stderr: clip(
                            decode(done.stderr) || decode(done.compile_output) || decode(done.message)
                        ),
                        exitCode: done.exit_code ?? null,
                        timeMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
                        memoryKb: done.memory ?? null,
                    }
                })
            }
            if (Date.now() > deadline) {
                throw new SandboxUnavailableError('The code sandbox took too long to respond.')
            }
        }
    }
}
