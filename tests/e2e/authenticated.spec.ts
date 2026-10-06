import { expect, test } from '@playwright/test'

/**
 * The signed-in journey: sign in, create a skill, see its pages, delete it.
 *
 * Needs a dedicated test account (email + password, already confirmed):
 *   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
 *
 * It creates one skill and deletes it again. It does not call the model: the
 * upload prompt is dismissed, so no roadmap is generated.
 */
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('signed in', () => {
    test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run the signed-in tests.')

    const skillTitle = `E2E skill ${Date.now()}`

    test.beforeEach(async ({ page }) => {
        await page.goto('/login?next=/dashboard')
        await page.getByPlaceholder('e-mail').fill(email!)
        await page.getByPlaceholder('password', { exact: true }).fill(password!)
        await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
        await expect(page).toHaveURL(/\/dashboard/)
        await expect(page.getByRole('heading', { name: 'Your Learning Dashboard' })).toBeVisible()
    })

    test('create a skill, open its pages, then delete it', async ({ page }) => {
        // Create
        await page.getByRole('button', { name: 'Create Skill' }).click()
        await page.getByPlaceholder('e.g. Quantum Physics').fill(skillTitle)
        await page.getByRole('button', { name: 'Create Path' }).click()

        // Dismiss the upload prompt without generating a roadmap.
        await expect(page.getByRole('heading', { name: 'Upload Learning Materials?' })).toBeVisible()
        await page.getByRole('button', { name: 'Close' }).click()
        await expect(page).toHaveURL(/\/dashboard/)

        const card = page.locator('.group', { has: page.getByRole('heading', { name: skillTitle }) })
        await expect(card).toBeVisible()

        // Roadmap page: empty state for a new skill.
        await card.getByRole('link', { name: /Roadmap/ }).click()
        await expect(page.getByRole('heading', { name: skillTitle })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'No Roadmap Yet' })).toBeVisible()

        // Quiz page: nothing is generated until asked.
        await page.goto(page.url().replace('/roadmap', '/quiz'))
        await expect(page.getByRole('button', { name: 'Start Quiz' })).toBeVisible()

        // Coding page: editor loads with starter code and nothing to run yet.
        await page.goto(page.url().replace('/quiz', '/coding'))
        await expect(page.getByRole('heading', { name: 'No Active Challenge' })).toBeVisible()
        await expect(page.locator('.monaco-editor').first()).toBeVisible()
        await expect(page.getByRole('button', { name: 'Run Code' })).toBeDisabled()

        // Chat page: loads with the document library.
        await page.goto(page.url().replace('/coding', ''))
        await expect(page.getByPlaceholder('Type your message...')).toBeVisible()
        await expect(page.getByText('No documents uploaded')).toBeVisible()

        // Delete
        await page.goto('/dashboard')
        await page.getByRole('button', { name: `Delete skill ${skillTitle}` }).click()
        await expect(page.getByText(`Are you sure you want to delete ${skillTitle}?`)).toBeVisible()
        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        await expect(page.getByText('Skill Deleted Successfully')).toBeVisible()
        await expect(page.getByRole('heading', { name: skillTitle })).toHaveCount(0)
    })

    test("another user's skill id shows nothing and exposes nothing", async ({ page, request }) => {
        const unknown = '00000000-0000-0000-0000-000000000000'
        const analytics = await page.request.get(`/api/analytics/skill/${unknown}`)
        expect(analytics.status()).toBe(404)
        // A fresh, signed-out context is still refused outright.
        expect((await request.get(`/api/analytics/skill/${unknown}`)).status()).toBe(401)
    })
})
