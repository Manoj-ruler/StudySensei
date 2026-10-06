import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Pages that require a signed-in user. API routes authenticate themselves
// (see src/server/auth/require-user.ts) and answer 401 instead of redirecting.
const PROTECTED_PREFIXES = ['/dashboard', '/skills']

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Verifies the JWT and refreshes the session cookies when needed.
    // Do not run code between createServerClient and this call.
    const { data } = await supabase.auth.getClaims()
    const isSignedIn = Boolean(data?.claims)

    const { pathname, search } = request.nextUrl
    const isProtected = PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )

    if (!isSignedIn && isProtected) {
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.search = ''
        loginUrl.searchParams.set('next', `${pathname}${search}`)
        const redirect = NextResponse.redirect(loginUrl)
        // Keep any refreshed/cleared session cookies on the redirect.
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
        return redirect
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
