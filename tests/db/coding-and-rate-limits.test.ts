import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, failure, SKILL_A, USER_A, USER_B, type TestDatabase } from '../support/database'

const QUESTION = 'a0000000-0000-0000-0000-0000000000e1'

let db: TestDatabase
const count = (sql: string) => db.one<{ n: number }>(sql).then((row) => row.n)
const asOwner = (sql: string) => failure(() => db.as(USER_A, () => db.exec(sql)))

beforeAll(async () => {
    db = await createTestDatabase({ through: '0005' })
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      -- a title that already exceeds the limit added in 0006
      insert into public.skills (id, user_id, title) values ('${SKILL_A}', '${USER_A}', repeat('x', 500));
    `)
    await db.asService(() => db.exec(`
      insert into public.coding_questions (id, skill_id, title, description, difficulty) values ('${QUESTION}', '${SKILL_A}', 'q', 'd', 'Easy');
      insert into public.test_cases (question_id, input, expected_output, is_hidden, "position") values
        ('${QUESTION}', '1', '1', false, 1), ('${QUESTION}', '2', '2', true, 2);
      insert into public.code_submissions (user_id, question_id, code, language, status) values ('${USER_A}', '${QUESTION}', 'x', 'python', 'failed');
    `))
    await db.migrate('0006')
})

afterAll(() => db.close())

describe('coding challenge integrity', () => {
    it('lets the owner read their question, visible test cases and submissions', async () => {
        const seen = await db.as(USER_A, async () => ({
            questions: await count(`select count(*)::int n from public.coding_questions`),
            testCases: await count(`select count(*)::int n from public.test_cases`),
            submissions: await count(`select count(*)::int n from public.code_submissions`),
        }))
        expect(seen).toEqual({ questions: 1, testCases: 1, submissions: 1 })
    })

    it('lets the server read hidden test cases', async () => {
        expect(await db.asService(() => count(`select count(*)::int n from public.test_cases where is_hidden`))).toBe(1)
    })

    it.each([
        ['forging a passed submission', `insert into public.code_submissions (user_id, question_id, code, language, status) values ('${USER_A}', '${QUESTION}', 'x', 'python', 'passed')`],
        ['editing a submission', `update public.code_submissions set status = 'passed'`],
        ['creating a question directly', `insert into public.coding_questions (skill_id, title, description) values ('${SKILL_A}', 't', 'd')`],
        ['adding a test case', `insert into public.test_cases (question_id, input, expected_output) values ('${QUESTION}', '9', '9')`],
        ['unhiding test cases', `update public.test_cases set is_hidden = false`],
    ])('refuses the owner %s', async (_name, sql) => {
        expect(await asOwner(sql)).toMatch(/permission denied/i)
    })

    it('shows another user nothing', async () => {
        const seen = await db.as(USER_B, async () =>
            (await count(`select count(*)::int n from public.coding_questions`)) +
            (await count(`select count(*)::int n from public.test_cases`)) +
            (await count(`select count(*)::int n from public.code_submissions`)))
        expect(seen).toBe(0)
    })

    it('rejects an unsupported language on new submissions', async () => {
        const error = await failure(() => db.asService(() => db.exec(
            `insert into public.code_submissions (user_id, question_id, code, language) values ('${USER_A}', '${QUESTION}', 'x', 'ruby')`)))
        expect(error).toMatch(/code_submissions_language_check/)
    })
})

describe('consume_rate_limit', () => {
    const consume = (user: string, action: string, limit: number, windowSeconds = 60) =>
        db.as(user, () => db.one<{ ok: boolean }>(
            `select public.consume_rate_limit('${action}', ${limit}, ${windowSeconds}) ok`)).then((row) => row.ok)

    it('allows up to the limit and then refuses', async () => {
        const outcomes = []
        for (let i = 0; i < 5; i++) outcomes.push(await consume(USER_A, 'code_submit', 3))
        expect(outcomes).toEqual([true, true, true, false, false])
    })

    it('keeps separate allowances per action, per user and per window', async () => {
        expect(await consume(USER_A, 'mentor_message', 3)).toBe(true)
        expect(await consume(USER_B, 'code_submit', 3)).toBe(true)
        expect(await consume(USER_A, 'code_submit', 100, 86_400)).toBe(true)
    })

    it('counts every call in a burst exactly once', async () => {
        const burst = await db.as(USER_B, () =>
            Promise.all(Array.from({ length: 20 }, () => db.one<{ ok: boolean }>(`select public.consume_rate_limit('quiz_answer', 8, 60) ok`))))
        expect(burst.filter((row) => row.ok)).toHaveLength(8)
    })

    it.each([
        ['an unknown action', () => consume(USER_A, 'made_up_action', 3), /rate_limits_action_check/],
        ['an unsupported window', () => consume(USER_A, 'code_submit', 3, 7), /rate_limits_window_check/],
        ['a non-positive limit', () => consume(USER_A, 'code_submit', 0), /Invalid limit/],
    ])('rejects %s', async (_name, call, expected) => {
        expect(await failure(call)).toMatch(expected)
    })

    it('cannot be called signed out, and the counters cannot be read or reset', async () => {
        expect(await failure(() => db.asAnon(() => db.one(`select public.consume_rate_limit('code_submit', 3, 60)`)))).toMatch(/permission denied/i)
        expect(await asOwner(`select count(*) from public.rate_limits`)).toMatch(/permission denied/i)
        expect(await asOwner(`delete from public.rate_limits`)).toMatch(/permission denied/i)
    })
})

describe('length limits', () => {
    it('applied without failing on an existing over-long row, which stays readable', async () => {
        expect(await db.as(USER_A, () => count(`select count(*)::int n from public.skills where char_length(title) = 500`))).toBe(1)
    })

    it.each([
        ['a 201-character title', `insert into public.skills (user_id, title) values ('${USER_A}', repeat('y', 201))`, /skills_title_length/],
        ['an empty title', `insert into public.skills (user_id, title) values ('${USER_A}', '')`, /skills_title_length/],
        ['a 2,001-character description', `insert into public.skills (user_id, title, description) values ('${USER_A}', 'ok', repeat('d', 2001))`, /skills_description_length/],
    ])('refuses %s', async (_name, sql, expected) => {
        expect(await asOwner(sql)).toMatch(expected)
    })

    it('accepts a normal skill', async () => {
        expect(await asOwner(`insert into public.skills (user_id, title, description) values ('${USER_A}', 'Rust ownership', 'borrow checker basics')`)).toBeNull()
    })
})
