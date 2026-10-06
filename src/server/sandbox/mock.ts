import type { CodeExecutor, ExecutionLimits, ExecutionRequest, ExecutionResult } from './types'

export type MockHandler = (request: ExecutionRequest, limits: ExecutionLimits) => Partial<ExecutionResult>

/**
 * In-memory executor for tests and for developing the UI without a sandbox.
 * It never runs code: by default it echoes stdin back as stdout, and a test
 * can pass a handler to script any outcome (timeouts, wrong output, crashes).
 */
export class MockExecutor implements CodeExecutor {
    readonly name = 'mock'
    /** Every request received, for assertions in tests. */
    readonly calls: ExecutionRequest[] = []

    constructor(private readonly handler: MockHandler = (request) => ({ stdout: request.stdin })) {}

    async run(requests: ExecutionRequest[], limits: ExecutionLimits): Promise<ExecutionResult[]> {
        this.calls.push(...requests)
        return requests.map((request) => ({
            status: 'ok',
            stdout: '',
            stderr: '',
            exitCode: 0,
            timeMs: 1,
            memoryKb: 1024,
            ...this.handler(request, limits),
        }))
    }
}
