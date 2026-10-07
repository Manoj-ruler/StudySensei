import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, failure, SKILL_A, SKILL_B, USER_A, USER_B, type TestDatabase } from '../support/database'

const LEGACY_QUIZ = 'a0000000-0000-0000-0000-0000000000f0'
const QUIZ = 'a0000000-0000-0000-0000-0000000000f1'
const Q1 = 'a0000000-0000-0000-0000-00000000aa01'
const Q2 = 'a0000000-0000-0000-0000-00000000aa02'
const Q3 = 'a0000000-0000-0000-0000-00000000aa03'

interface Graded {
    is_correct: boolean
    correct_answer: number
    explanation: string
    quiz_completed: boolean
    score: number
    total_questions: number
}

let db: TestDatabase
const answer = (user: string, question: string, choice: number) =>
    db.as(user, () => db.one<Graded>(`select * from public.answer_quiz_question('${question}', ${choice})`))

beforeAll(async () => {
    db = await createTestDatabase({ through: '0003' })
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      insert into public.skills (id, user_id, title) values ('${SKILL_A}', '${USER_A}', 'A'), ('${SKILL_B}', '${USER_B}', 'B');
      -- a quiz completed before server-side grading existed
      insert into public.quizzes (id, skill_id, user_id, score, total_questions, status, completed_at) values
        ('${LEGACY_QUIZ}', '${SKILL_A}', '${USER_A}', 1, 1, 'completed', now() - interval '1 day');
      insert into public.quiz_questions (quiz_id, skill_id, question, options, correct_answer, user_answer, is_correct) values
        ('${LEGACY_QUIZ}', '${SKILL_A}', 'legacy?', '["x","y"]', 1, 1, true);
    `)
    await db.migrate('0004')

    // What the server does when it generates a quiz, acting as the learner.
    await db.as(USER_A, () => db.exec(`
      insert into public.quizzes (id, skill_id, user_id, total_questions) values ('${QUIZ}', '${SKILL_A}', '${USER_A}', 3);
      insert into public.quiz_questions (id, quiz_id, skill_id, question, options, correct_answer, explanation, "position") values
        ('${Q1}', '${QUIZ}', '${SKILL_A}', 'q1', '["a","b","c","d"]', 2, 'because c', 1),
        ('${Q2}', '${QUIZ}', '${SKILL_A}', 'q2', '["a","b","c","d"]', 0, 'because a', 2),
        ('${Q3}', '${QUIZ}', '${SKILL_A}', 'q3', '["a","b","c","d"]', 3, 'because d', 3);`))
})

afterAll(() => db.close())

describe('the answer key', () => {
    it('lets the owner read questions without it', async () => {
        const readable = await db.as(USER_A, () => db.rows(
            `select id, question, options, user_answer, is_correct from public.quiz_questions where quiz_id = '${QUIZ}'`))
        expect(readable).toHaveLength(3)
    })

    it.each(['correct_answer', 'explanation', '*'])('refuses the owner selecting %s', async (columns) => {
        const error = await failure(() => db.as(USER_A, () => db.rows(`select ${columns} from public.quiz_questions`)))
        expect(error).toMatch(/permission denied/i)
    })
})

describe('answer_quiz_question', () => {
    it('grades a correct answer and reveals the key only then', async () => {
        expect(await answer(USER_A, Q1, 2)).toEqual({
            is_correct: true,
            correct_answer: 2,
            explanation: 'because c',
            quiz_completed: false,
            score: 1,
            total_questions: 3,
        })
    })

    it('grades a wrong answer', async () => {
        expect(await answer(USER_A, Q2, 3)).toMatchObject({ is_correct: false, correct_answer: 0, score: 1, quiz_completed: false })
    })

    it('treats the first answer as final', async () => {
        expect(await answer(USER_A, Q2, 0)).toMatchObject({ is_correct: false, score: 1 })
    })

    it('rejects an answer outside the options', async () => {
        expect(await failure(() => answer(USER_A, Q3, 9))).toMatch(/out of range/i)
    })

    it('writes no progress record before the quiz is complete', async () => {
        expect((await db.one<{ n: number }>(`select count(*)::int n from public.progress_metrics`)).n).toBe(0)
    })

    it('completes and scores the quiz on the last answer', async () => {
        expect(await answer(USER_A, Q3, 3)).toMatchObject({ quiz_completed: true, score: 2, total_questions: 3 })
        const quiz = await db.one(`select status, score, completed_at is not null as finished from public.quizzes where id = '${QUIZ}'`)
        expect(quiz).toEqual({ status: 'completed', score: 2, finished: true })
    })

    it('writes exactly one progress record, even if the last answer is sent again', async () => {
        await answer(USER_A, Q3, 3)
        const records = await db.rows(`select activity_type, score, max_score, user_id from public.progress_metrics`)
        expect(records).toEqual([{ activity_type: 'quiz', score: 2, max_score: 3, user_id: USER_A }])
    })
})

describe('get_quiz_history', () => {
    it('returns completed quizzes newest first, with answers, including legacy ones', async () => {
        const { history } = await db.as(USER_A, () =>
            db.one<{ history: { id: string; questions: { question: string; correct_answer: number; explanation: string | null }[] }[] }>(
                `select public.get_quiz_history('${SKILL_A}') history`))
        expect(history.map((quiz) => quiz.id)).toEqual([QUIZ, LEGACY_QUIZ])
        expect(history[0].questions[0]).toMatchObject({ correct_answer: 2, explanation: 'because c' })
        expect(history[1].questions[0].question).toBe('legacy?')
    })

    it("returns nothing for another user's skill", async () => {
        const { history } = await db.as(USER_B, () => db.one<{ history: unknown[] }>(`select public.get_quiz_history('${SKILL_A}') history`))
        expect(history).toEqual([])
    })
})

describe('tampering', () => {
    const asOwner = (sql: string) => failure(() => db.as(USER_A, () => db.exec(sql)))

    it('refuses editing a score', async () => {
        expect(await asOwner(`update public.quizzes set score = 3 where id = '${QUIZ}'`)).toMatch(/permission denied/i)
    })

    it('refuses editing an answer', async () => {
        expect(await asOwner(`update public.quiz_questions set is_correct = true where quiz_id = '${QUIZ}'`)).toMatch(/permission denied/i)
    })

    it('refuses inserting a quiz that is already scored', async () => {
        expect(await asOwner(`insert into public.quizzes (skill_id, user_id, score, total_questions, status)
          values ('${SKILL_A}', '${USER_A}', 5, 5, 'completed')`)).not.toBeNull()
    })

    it('refuses inserting a question that is already answered', async () => {
        expect(await asOwner(`insert into public.quiz_questions (quiz_id, skill_id, question, options, correct_answer, user_answer, is_correct)
          values ('${QUIZ}', '${SKILL_A}', 'x', '["a","b"]', 0, 0, true)`)).not.toBeNull()
    })

    it('refuses writing progress records', async () => {
        expect(await asOwner(`insert into public.progress_metrics (user_id, skill_id, activity_type, score, max_score)
          values ('${USER_A}', '${SKILL_A}', 'quiz', 99, 99)`)).toMatch(/permission denied/i)
    })

    it("refuses another user answering or attaching a quiz to someone else's skill", async () => {
        expect(await failure(() => answer(USER_B, Q1, 2))).toMatch(/not found/i)
        expect(await failure(() => db.as(USER_B, () => db.exec(
            `insert into public.quizzes (skill_id, user_id, total_questions) values ('${SKILL_A}', '${USER_B}', 1)`)))).not.toBeNull()
    })

    it('refuses signed-out callers', async () => {
        expect(await failure(() => db.asAnon(() => db.one(`select * from public.answer_quiz_question('${Q1}', 2)`)))).toMatch(/permission denied/i)
        expect(await failure(() => db.asAnon(() => db.one(`select public.get_quiz_history('${SKILL_A}')`)))).toMatch(/permission denied/i)
    })
})
