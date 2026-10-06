import {
    clip,
    SandboxUnavailableError,
    type CodeExecutor,
    type ExecutionLimits,
    type ExecutionRequest,
    type ExecutionResult,
    type ExecutionStatus,
} from './types'

export interface PistonOptions {
    /** Base URL of the Piston API, e.g. http://localhost:2000/api/v2 for a self-hosted instance. */
    baseUrl: string
    apiKey?: string
    fetch?: typeof fetch
}

interface PistonStage {
    stdout?: string
    stderr?: string
    code?: number | null
    signal?: string | null
    /** Newer Piston versions: "TO" timeout, "RE" runtime error, "SG" signal, "OL"/"EL" output limit, "XX" internal. */
    status?: string | null
    message?: string | null
    cpu_time?: number | null
    wall_time?: number | null
    memory?: number | null
}

interface PistonResponse {
    compile?: PistonStage
    run?: PistonStage
    message?: string
}

/** Piston has no batch endpoint; a few runs at a time keeps a long test suite quick without flooding it. */
const CONCURRENCY = 3

function toStatus(response: PistonResponse, limits: ExecutionLimits): ExecutionStatus {
    if (response.compile && response.compile.code !== 0 && response.compile.code != null) {
        return 'compile_error'
    }
    const run = response.run
    if (!run) return 'sandbox_error'
    if (run.status === 'TO') return 'time_limit'
    if (run.status === 'XX') return 'sandbox_error'
    if (run.memory != null && run.memory >= limits.memoryKb * 1024 * 0.98) return 'memory_limit'
    if (run.signal === 'SIGKILL') {
        // Older versions report only the signal: a kill at the wall clock is a timeout.
        return (run.wall_time ?? 0) >= limits.wallTimeSeconds * 1000 * 0.95 ? 'time_limit' : 'memory_limit'
    }
    if (run.code === 0) return 'ok'
    return 'runtime_error'
}

/**
 * Executor for a Piston instance (https://github.com/engineer-man/piston).
 * The public Piston API is whitelist-only, so this is intended for a
 * self-hosted instance.
 */
export class PistonExecutor implements CodeExecutor {
    readonly name = 'piston'

    private readonly baseUrl: string
    private readonly headers: Record<string, string>
    private readonly fetchImpl: typeof fetch

    constructor(options: PistonOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '')
        this.fetchImpl = options.fetch ?? fetch
        this.headers = { 'Content-Type': 'application/json' }
        if (options.apiKey) this.headers.Authorization = options.apiKey
    }

    async run(requests: ExecutionRequest[], limits: ExecutionLimits): Promise<ExecutionResult[]> {
        const results = new Array<ExecutionResult>(requests.length)
        let next = 0
        const worker = async () => {
            while (next < requests.length) {
                const index = next++
                results[index] = await this.runOne(requests[index], limits)
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, requests.length) }, worker))
        return results
    }

    private async runOne(request: ExecutionRequest, limits: ExecutionLimits): Promise<ExecutionResult> {
        let response: Response
        try {
            response = await this.fetchImpl(`${this.baseUrl}/execute`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({
                    language: request.language,
                    version: '*',
                    files: [{ content: request.source }],
                    stdin: request.stdin,
                    run_timeout: limits.wallTimeSeconds * 1000,
                    run_cpu_time: limits.cpuTimeSeconds * 1000,
                    run_memory_limit: limits.memoryKb * 1024,
                }),
                signal: AbortSignal.timeout((limits.wallTimeSeconds + 20) * 1000),
            })
        } catch (error) {
            throw new SandboxUnavailableError('The code sandbox could not be reached.', { cause: error })
        }
        if (!response.ok) {
            throw new SandboxUnavailableError(`The code sandbox rejected the request (${response.status}).`)
        }

        const body = (await response.json()) as PistonResponse
        const status = toStatus(body, limits)
        const stage = status === 'compile_error' ? body.compile : body.run
        return {
            status,
            stdout: clip(body.run?.stdout),
            stderr: clip(stage?.stderr || stage?.message || body.message),
            exitCode: body.run?.code ?? null,
            timeMs: body.run?.cpu_time ?? body.run?.wall_time ?? null,
            memoryKb: body.run?.memory != null ? Math.round(body.run.memory / 1024) : null,
        }
    }
}
