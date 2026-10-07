import { expect, test } from '@playwright/test'

// What a visitor who is not signed in can see and do. Needs no account.

const SKILL = '00000000-0000-0000-0000-000000000000'

test('landing page presents the product', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('StudySensei')
    await expect(page.getByRole('heading', { name: /Learn Smarter/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Start Learning Now/ })).toBeVisible()
})

test('protected pages redirect to sign-in and remember where the visitor was going', async ({ page }) => {
    for (const path of ['/dashboard', `/skills/${SKILL}`, `/skills/${SKILL}/quiz`, `/skills/${SKILL}/coding`]) {
        await page.goto(path)
        await expect(page).toHaveURL(/\/login\?next=/)
        expect(new URL(page.url()).searchParams.get('next')).toBe(path)
    }
})

test('sign-in page has both forms and explains a failed sign-in', async ({ page }) => {
    await page.goto('/login?error=auth')
    await expect(page.getByText('Sign-in could not be completed')).toBeVisible()
    await expect(page.getByPlaceholder('e-mail')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    await page.getByRole('button', { name: 'Register new account' }).click()
    await expect(page.getByPlaceholder('Full name')).toBeVisible()
    await expect(page.getByPlaceholder('confirm password')).toBeVisible()
})

test('sign-up checks that the passwords match before contacting the server', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Register new account' }).click()
    await page.getByPlaceholder('Full name').fill('Test Person')
    await page.getByPlaceholder('e-mail').fill('nobody@example.com')
    await page.getByPlaceholder('password', { exact: true }).fill('first-password')
    await page.getByPlaceholder('confirm password').fill('different-password')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()
})

test('an auth callback cannot be used to redirect to another site', async ({ page }) => {
    await page.goto('/auth/callback?next=@evil.example')
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host)
    await expect(page).toHaveURL(/\/login\?error=auth/)
})

test('every API endpoint requires a signed-in user', async ({ request }) => {
    const calls = [
        request.post('/api/mentor/message', { data: {} }),
        request.post('/api/documents/upload', { data: {} }),
        request.post('/api/documents/search', { data: {} }),
        request.post(`/api/documents/${SKILL}/process`),
        request.delete(`/api/documents/${SKILL}`),
        request.post('/api/quiz/generate', { data: {} }),
        request.post('/api/quiz/answer', { data: {} }),
        request.get(`/api/quiz/history/${SKILL}`),
        request.post('/api/roadmap/generate', { data: {} }),
        request.post('/api/solver/generate-question', { data: {} }),
        request.post('/api/solver/submit', { data: {} }),
        request.get(`/api/analytics/skill/${SKILL}`),
    ]
    for (const response of await Promise.all(calls)) {
        expect(response.status(), response.url()).toBe(401)
        expect((await response.json()).error.code).toBe('UNAUTHENTICATED')
    }
})

test('the API refuses state-changing requests from another site', async ({ request }) => {
    const crossSite = await request.post('/api/quiz/answer', { data: {}, headers: { Origin: 'https://evil.example' } })
    expect(crossSite.status()).toBe(403)

    const readOnly = await request.get(`/api/analytics/skill/${SKILL}`, { headers: { Origin: 'https://evil.example' } })
    expect(readOnly.status()).toBe(401) // not blocked as cross-site; simply not signed in
})

test('responses carry the security headers', async ({ request }) => {
    const headers = (await request.get('/')).headers()
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-powered-by']).toBeUndefined()

    const csp = headers['content-security-policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("img-src 'self' data: blob:")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
})

test('the content security policy blocks remote images and scripts in the page', async ({ page }) => {
    await page.goto('/login')
    const blocked = await page.evaluate(async () => {
        const violations: string[] = []
        document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective))
        const image = new Image()
        image.src = 'https://example.com/pixel.png'
        const script = document.createElement('script')
        script.src = 'https://example.com/x.js'
        document.head.appendChild(script)
        await new Promise((resolve) => setTimeout(resolve, 1500))
        return violations
    })
    expect(blocked.some((directive) => directive.startsWith('img-src'))).toBe(true)
    expect(blocked.some((directive) => directive.startsWith('script-src'))).toBe(true)
})
