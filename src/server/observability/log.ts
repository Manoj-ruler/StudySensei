/**
 * Structured logs: one JSON object per line, which log platforms (Vercel,
 * Datadog, CloudWatch, ...) index without extra configuration.
 *
 * Never pass secrets, tokens, document text or learner code as fields.
 */
type Fields = Record<string, string | number | boolean | null | undefined>

function write(level: 'info' | 'warn' | 'error', event: string, fields: Fields) {
    const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
}

export const log = {
    info: (event: string, fields: Fields = {}) => write('info', event, fields),
    warn: (event: string, fields: Fields = {}) => write('warn', event, fields),
    error: (event: string, fields: Fields = {}) => write('error', event, fields),
}

/** A short, safe description of a thrown value for logs. */
export function describeError(error: unknown): { message: string; name: string } {
    if (error instanceof Error) return { message: error.message.slice(0, 500), name: error.name }
    return { message: String(error).slice(0, 500), name: 'NonError' }
}
