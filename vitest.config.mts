import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
    resolve: {
        alias: {
            '@': path('./src'),
            // Next.js provides this marker module; outside Next it is a no-op.
            'server-only': path('./tests/support/server-only.ts'),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        // Browser tests run with Playwright (npm run test:e2e).
        exclude: ['tests/e2e/**', 'node_modules/**'],
        // Database tests start an embedded Postgres and replay every migration.
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
})
