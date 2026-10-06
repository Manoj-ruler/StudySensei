import 'server-only'
import { Judge0Executor } from './judge0'
import { MockExecutor } from './mock'
import { PistonExecutor } from './piston'
import { SandboxUnavailableError, type CodeExecutor, type ExecutionLimits } from './types'

export const SANDBOX_PROVIDERS = ['judge0', 'piston', 'mock'] as const
export type SandboxProvider = (typeof SANDBOX_PROVIDERS)[number]

/** Limits applied to every learner submission. */
export const SUBMISSION_LIMITS: ExecutionLimits = {
    // Interpreter start-up alone takes over a second on shared sandboxes.
    cpuTimeSeconds: 5,
    wallTimeSeconds: 10,
    memoryKb: 128_000,
}

function numberFromEnv(name: string): number | undefined {
    const value = Number(process.env[name])
    return Number.isInteger(value) && value > 0 ? value : undefined
}

let cached: CodeExecutor | null = null

/**
 * The configured sandbox. Selected entirely by environment variables:
 *
 *   SANDBOX_PROVIDER   judge0 (default) | piston | mock
 *   JUDGE0_URL         default https://ce.judge0.com (the public Community Edition instance)
 *   JUDGE0_API_KEY     optional; for self-hosted (X-Auth-Token) or RapidAPI-hosted instances
 *   JUDGE0_PYTHON_LANGUAGE_ID / JUDGE0_JAVASCRIPT_LANGUAGE_ID   optional pins
 *   PISTON_URL         required for piston, e.g. http://localhost:2000/api/v2
 *   PISTON_API_KEY     optional
 */
export function getExecutor(): CodeExecutor {
    if (cached) return cached

    const provider = (process.env.SANDBOX_PROVIDER ?? 'judge0').toLowerCase()
    switch (provider) {
        case 'judge0':
            cached = new Judge0Executor({
                baseUrl: process.env.JUDGE0_URL ?? 'https://ce.judge0.com',
                apiKey: process.env.JUDGE0_API_KEY,
                languageIds: {
                    python: numberFromEnv('JUDGE0_PYTHON_LANGUAGE_ID'),
                    javascript: numberFromEnv('JUDGE0_JAVASCRIPT_LANGUAGE_ID'),
                },
            })
            break
        case 'piston':
            if (!process.env.PISTON_URL) {
                throw new SandboxUnavailableError('PISTON_URL is required when SANDBOX_PROVIDER=piston.')
            }
            cached = new PistonExecutor({
                baseUrl: process.env.PISTON_URL,
                apiKey: process.env.PISTON_API_KEY,
            })
            break
        case 'mock':
            if (process.env.NODE_ENV === 'production') {
                throw new SandboxUnavailableError('The mock sandbox cannot be used in production.')
            }
            cached = new MockExecutor()
            break
        default:
            throw new SandboxUnavailableError(
                `Unknown SANDBOX_PROVIDER "${provider}". Use one of: ${SANDBOX_PROVIDERS.join(', ')}.`
            )
    }
    return cached
}
