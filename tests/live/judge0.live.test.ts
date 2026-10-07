import { describe, expect, it } from 'vitest'
import { Judge0Executor } from '@/server/sandbox/judge0'

/**
 * Runs real programs on a real Judge0 instance. Skipped by default because it
 * needs network access and uses shared sandbox capacity:
 *
 *   RUN_LIVE_TESTS=1 npm test
 *
 * Uses JUDGE0_URL / JUDGE0_API_KEY if set, otherwise the public instance.
 */
describe.skipIf(!process.env.RUN_LIVE_TESTS)('Judge0, live', () => {
    const sandbox = new Judge0Executor({
        baseUrl: process.env.JUDGE0_URL ?? 'https://ce.judge0.com',
        apiKey: process.env.JUDGE0_API_KEY,
    })
    const limits = { cpuTimeSeconds: 3, wallTimeSeconds: 6, memoryKb: 128_000 }

    it('runs code and enforces time, memory and network limits', async () => {
        const [python, javascript, crash, loop, memory, network] = await sandbox.run(
            [
                { language: 'python', source: 'import sys\nprint(sum(int(x) for x in sys.stdin.read().split()))', stdin: '1 2 3' },
                { language: 'javascript', source: 'console.log(require("fs").readFileSync(0,"utf8").trim().split(" ").map(Number).reduce((a,b)=>a+b,0))', stdin: '4 5 6' },
                { language: 'python', source: 'raise ValueError("boom")', stdin: '' },
                { language: 'python', source: 'while True: pass', stdin: '' },
                { language: 'python', source: 'x = [0] * (10 ** 9)\nprint(len(x))', stdin: '' },
                { language: 'python', source: 'import urllib.request\nprint(urllib.request.urlopen("https://example.com", timeout=3).status)', stdin: '' },
            ],
            limits
        )
        expect(python).toMatchObject({ status: 'ok' })
        expect(python.stdout.trim()).toBe('6')
        expect(javascript.stdout.trim()).toBe('15')
        expect(crash.status).toBe('runtime_error')
        expect(crash.stderr).toMatch(/ValueError: boom/)
        expect(loop.status).toBe('time_limit')
        expect(memory.status).toBe('memory_limit')
        expect(network.status).toBe('runtime_error')
    }, 120_000)
})
