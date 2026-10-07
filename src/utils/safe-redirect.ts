/**
 * Returns `target` only if it is a same-origin relative path, otherwise `fallback`.
 * Rejects absolute URLs, protocol-relative URLs (`//host`) and anything that
 * would change the host when appended to an origin (e.g. `@evil.com`).
 */
export function safeRedirectPath(target: string | null | undefined, fallback = '/'): string {
    if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
        return fallback
    }
    return target
}
