import type { CodeLanguage } from '@/lib/api/types'

/**
 * The execution layer. The application only ever talks to a CodeExecutor, so
 * the sandbox behind it (Judge0, Piston, or anything else that can run a
 * program with stdin under limits) can be swapped by configuration alone.
 *
 * Untrusted code is never run inside the application process: every
 * implementation sends it to an isolated sandbox service.
 */
export interface CodeExecutor {
    /** Provider name, for logs and diagnostics. */
    readonly name: string
    /**
     * Runs each program once with its stdin and returns results in the same
     * order. Individual failures (timeouts, crashes) are reported per result;
     * the promise rejects with SandboxUnavailableError only when the sandbox
     * itself cannot be used.
     */
    run(requests: ExecutionRequest[], limits: ExecutionLimits): Promise<ExecutionResult[]>
}

export interface ExecutionRequest {
    language: CodeLanguage
    source: string
    stdin: string
}

export interface ExecutionLimits {
    cpuTimeSeconds: number
    wallTimeSeconds: number
    memoryKb: number
}

export type ExecutionStatus =
    | 'ok'
    | 'runtime_error'
    | 'compile_error'
    | 'time_limit'
    | 'memory_limit'
    /** The sandbox failed to run the program for reasons unrelated to the program. */
    | 'sandbox_error'

export interface ExecutionResult {
    status: ExecutionStatus
    stdout: string
    stderr: string
    exitCode: number | null
    timeMs: number | null
    memoryKb: number | null
}

/** The sandbox is misconfigured, unreachable or rejecting requests. */
export class SandboxUnavailableError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'SandboxUnavailableError'
    }
}

/** Keeps a runaway program's output from flooding responses and the database. */
export const MAX_OUTPUT_CHARACTERS = 8000

export function clip(text: string | null | undefined): string {
    if (!text) return ''
    return text.length > MAX_OUTPUT_CHARACTERS
        ? `${text.slice(0, MAX_OUTPUT_CHARACTERS)}\n... (output truncated)`
        : text
}

/** Name-based check, so it holds even if the module is loaded more than once. */
export function isSandboxUnavailable(error: unknown): error is SandboxUnavailableError {
    return error instanceof Error && error.name === 'SandboxUnavailableError'
}
