import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    createTestDatabase,
    embedding,
    failure,
    SKILL_A,
    SKILL_B,
    USER_A,
    USER_B,
    type TestDatabase,
} from '../support/database'

const DOC_A = 'a0000000-0000-0000-0000-0000000000d1'
const DOC_B = 'b0000000-0000-0000-0000-0000000000d1'
const QUESTION_A = 'a0000000-0000-0000-0000-0000000000e1'

let db: TestDatabase

/**
 * Seeds data in the shape it had before any migration (mixed document
 * statuses, a chunk without a vector, URL-encoded file names), then applies
 * the migrations up to the schema corrections.
 */
beforeAll(async () => {
    db = await createTestDatabase({ through: '0000' })
    const url = (owner: string, skill: string, file: string) =>
        `https://x.supabase.co/storage/v1/object/public/documents/${owner}/${skill}/${file}`

    await db.exec(`
      create policy "legacy public read" on storage.objects for select using (bucket_id = 'documents');
      insert into auth.users (id, raw_user_meta_data) values
        ('${USER_A}', '{"full_name":"Alice Example"}'), ('${USER_B}', '{"full_name":"Bob Example"}');
      insert into public.skills (id, user_id, title) values
        ('${SKILL_A}', '${USER_A}', 'A skill'), ('${SKILL_B}', '${USER_B}', 'B skill');
      insert into public.documents (id, user_id, skill_id, filename, file_url, processed, status) values
        ('${DOC_A}', '${USER_A}', '${SKILL_A}', 'My Notes.pdf', '${url(USER_A, SKILL_A, 'My%20Notes%20%28v2%29.pdf')}', true, 'processed'),
        ('a0000000-0000-0000-0000-0000000000d2', '${USER_A}', '${SKILL_A}', 'b.pdf', '${url(USER_A, SKILL_A, 'b.pdf')}', true, 'ready'),
        ('a0000000-0000-0000-0000-0000000000d3', '${USER_A}', '${SKILL_A}', 'c.pdf', '${url(USER_A, SKILL_A, 'c.pdf')}', false, 'pending'),
        ('a0000000-0000-0000-0000-0000000000d4', '${USER_A}', '${SKILL_A}', 'd.pdf', '${url(USER_A, SKILL_A, 'd.pdf')}', false, null),
        ('${DOC_B}', '${USER_B}', '${SKILL_B}', 'bob.pdf', '${url(USER_B, SKILL_B, 'bob.pdf')}', true, 'ready');
      insert into public.document_chunks (document_id, content, embedding, chunk_index) values
        ('${DOC_B}', 'legacy chunk without vector', null, 0);
      insert into public.chats (id, user_id, skill_id, title) values
        ('a0000000-0000-0000-0000-0000000000c1', '${USER_A}', '${SKILL_A}', 'chat');
      insert into public.messages (chat_id, role, content) values ('a0000000-0000-0000-0000-0000000000c1', 'user', 'hi');
      insert into public.quizzes (id, skill_id, score, total_questions) values
        ('a0000000-0000-0000-0000-0000000000f1', '${SKILL_A}', 4, 5);
      insert into public.quiz_questions (quiz_id, skill_id, question, options, correct_answer, user_answer, is_correct) values
        ('a0000000-0000-0000-0000-0000000000f1', '${SKILL_A}', 'q?', '["a","b"]', 0, 0, true);
      insert into public.coding_questions (id, skill_id, title, description, difficulty) values
        ('${QUESTION_A}', '${SKILL_A}', 'cq', 'd', 'Easy');
      insert into public.test_cases (question_id, input, expected_output, is_hidden) values
        ('${QUESTION_A}', '1', '1', false), ('${QUESTION_A}', '2', '2', true), ('${QUESTION_A}', '3', '3', null);
      insert into public.notifications (user_id, type, title, message) values ('${USER_B}', 't', 't', 'm');
      insert into public.feature_requests (id, title, description, created_by) values
        ('f0000000-0000-0000-0000-000000000001', 'fr', 'd', '${USER_A}');
      insert into public.votes (user_id, feature_id) values ('${USER_B}', 'f0000000-0000-0000-0000-000000000001');
      insert into storage.objects (bucket_id, name) values
        ('documents', '${USER_A}/${SKILL_A}/My Notes (v2).pdf'), ('documents', '${USER_B}/${SKILL_B}/bob.pdf');
    `)
    await db.migrate('0003')
})

afterAll(() => db.close())

describe('migrating existing data', () => {
    it('normalises document status and derives processed from it', async () => {
        const docs = await db.rows<{ filename: string; status: string; processed: boolean }>(
            `select filename, status, processed from public.documents order by filename`
        )
        expect(Object.fromEntries(docs.map((d) => [d.filename, d.status]))).toEqual({
            'My Notes.pdf': 'ready',
            'b.pdf': 'ready',
            'bob.pdf': 'ready',
            'c.pdf': 'pending',
            'd.pdf': 'pending',
        })
        expect(docs.every((d) => d.processed === (d.status === 'ready'))).toBe(true)
    })

    it('fills storage_path from the legacy URL, decoding percent-escapes', async () => {
        const doc = await db.one<{ storage_path: string }>(
            `select storage_path from public.documents where id = '${DOC_A}'`
        )
        expect(doc.storage_path).toBe(`${USER_A}/${SKILL_A}/My Notes (v2).pdf`)
    })

    it('gives existing chunks and quizzes an owner', async () => {
        expect((await db.one<{ user_id: string }>(`select user_id from public.document_chunks`)).user_id).toBe(USER_B)
        const quiz = await db.one<{ user_id: string; status: string }>(`select user_id, status from public.quizzes`)
        expect(quiz).toMatchObject({ user_id: USER_A, status: 'completed' })
    })

    it('replaces the IVFFlat index with HNSW and drops match_documents', async () => {
        const indexes = (await db.rows<{ indexdef: string }>(
            `select indexdef from pg_indexes where tablename = 'document_chunks'`
        )).map((row) => row.indexdef).join('\n')
        expect(indexes).toMatch(/using hnsw/i)
        expect(indexes).not.toMatch(/ivfflat/i)
        expect((await db.one<{ n: number }>(`select count(*)::int n from pg_proc where proname = 'match_documents'`)).n).toBe(0)
    })

    it('rejects an unknown document status', async () => {
        expect(await failure(() => db.exec(`update public.documents set status = 'done' where filename = 'c.pdf'`)))
            .toMatch(/documents_status_check/)
    })
})

describe('row level security', () => {
    it('is enabled on every table', async () => {
        const open = await db.rows<{ tablename: string }>(
            `select tablename from pg_tables where schemaname = 'public' and not rowsecurity`
        )
        expect(open).toEqual([])
    })

    it('shows a signed-out visitor nothing', async () => {
        const tables = (await db.rows<{ tablename: string }>(
            `select tablename from pg_tables where schemaname = 'public'`
        )).map((row) => row.tablename)
        let visible = 0
        for (const table of tables) {
            visible += await db.asAnon(async () => (await db.one<{ n: number }>(`select count(*)::int n from public.${table}`)).n)
        }
        expect(visible).toBe(0)
    })

    it('shows a user only their own rows', async () => {
        const seen = await db.as(USER_A, async () => ({
            skills: (await db.one<{ n: number }>(`select count(*)::int n from public.skills`)).n,
            documents: (await db.one<{ n: number }>(`select count(*)::int n from public.documents`)).n,
            chunks: (await db.one<{ n: number }>(`select count(*)::int n from public.document_chunks`)).n,
            notifications: (await db.one<{ n: number }>(`select count(*)::int n from public.notifications`)).n,
            votes: (await db.one<{ n: number }>(`select count(*)::int n from public.votes`)).n,
        }))
        expect(seen).toEqual({ skills: 1, documents: 4, chunks: 0, notifications: 0, votes: 0 })
    })

    it('hides hidden test cases even from the question owner', async () => {
        const visible = await db.as(USER_A, () => db.one<{ n: number }>(`select count(*)::int n from public.test_cases`))
        expect(visible.n).toBe(2) // one explicit visible case and one that was null (now false)
    })

    it('restricts stored files to their owner', async () => {
        const count = () => db.one<{ n: number }>(`select count(*)::int n from storage.objects`)
        expect((await db.as(USER_A, count)).n).toBe(1)
        expect((await db.asAnon(count)).n).toBe(0)
    })
})

describe('vector search (match_chunks)', () => {
    beforeAll(async () => {
        await db.as(USER_A, () => db.exec(`
          insert into public.document_chunks (document_id, content, embedding, chunk_index) values
            ('${DOC_A}', 'close chunk', '${embedding(0.9)}', 0),
            ('${DOC_A}', 'far chunk', '${embedding(-0.9)}', 1);`))
        await db.as(USER_B, () => db.exec(`
          insert into public.document_chunks (document_id, content, embedding, chunk_index) values
            ('${DOC_B}', 'bob secret chunk', '${embedding(0.9)}', 1);`))
    })

    const search = (user: string, skill: string, minSimilarity: number) =>
        db.as(user, () => db.rows<{ content: string; filename: string }>(
            `select content, filename from public.match_chunks('${embedding(0.9)}', '${skill}', 5, ${minSimilarity})`
        ))

    it('takes chunk ownership from the parent document, not the caller', async () => {
        const chunk = await db.one<{ user_id: string; skill_id: string }>(
            `select user_id, skill_id from public.document_chunks where content = 'close chunk'`
        )
        expect(chunk).toEqual({ user_id: USER_A, skill_id: SKILL_A })
    })

    it('ranks by similarity and returns the file name', async () => {
        const hits = await search(USER_A, SKILL_A, -1)
        expect(hits.map((hit) => hit.content)).toEqual(['close chunk', 'far chunk'])
        expect(hits[0].filename).toBe('My Notes.pdf')
    })

    it('applies the similarity threshold', async () => {
        expect((await search(USER_A, SKILL_A, 0.9)).map((hit) => hit.content)).toEqual(['close chunk'])
    })

    it("never returns another user's chunks", async () => {
        expect(await search(USER_A, SKILL_B, -1)).toEqual([])
    })

    it('runs as the caller, so row level security applies inside it', async () => {
        const fn = await db.one<{ prosecdef: boolean; src: string }>(
            `select prosecdef, prosrc as src from pg_proc where proname = 'match_chunks'`
        )
        expect(fn.prosecdef).toBe(false)
        // The explicit owner filter is a second layer on top of RLS.
        expect(fn.src).toContain('c.user_id = (select auth.uid())')
    })

    it('is not callable when signed out', async () => {
        const error = await failure(() => db.asAnon(() =>
            db.rows(`select * from public.match_chunks('${embedding(0.9)}', '${SKILL_A}')`)))
        expect(error).toMatch(/permission denied/i)
    })

    it("refuses a chunk for someone else's document", async () => {
        const error = await failure(() => db.as(USER_A, () => db.exec(
            `insert into public.document_chunks (document_id, content, chunk_index) values ('${DOC_B}', 'injected', 99)`)))
        expect(error).not.toBeNull()
    })

    it('refuses a duplicate chunk index', async () => {
        const error = await failure(() => db.as(USER_A, () => db.exec(
            `insert into public.document_chunks (document_id, content, chunk_index) values ('${DOC_A}', 'dup', 0)`)))
        expect(error).toMatch(/duplicate key/i)
    })
})

describe('functions and cascades', () => {
    it('reports unread notifications for the caller only', async () => {
        const count = (user: string) => db.as(user, () => db.one<{ n: number }>(`select public.get_unread_notification_count() n`))
        expect((await count(USER_B)).n).toBe(1)
        expect((await count(USER_A)).n).toBe(0)
    })

    it('creates a profile at signup for short, Google-style and missing names', async () => {
        await db.exec(`insert into auth.users (id, raw_user_meta_data) values
          ('33333333-3333-3333-3333-333333333333', '{"full_name":"Li"}'),
          ('44444444-4444-4444-4444-444444444444', '{"name":"Google Name"}'),
          ('55555555-5555-5555-5555-555555555555', '{}')`)
        const names = await db.rows<{ full_name: string | null }>(
            `select full_name from public.profiles where id::text ~ '^(3|4|5)' order by id`
        )
        expect(names.map((row) => row.full_name)).toEqual(['Li', 'Google Name', null])
    })

    it('deleting a skill removes everything attached to it', async () => {
        expect(await failure(() => db.as(USER_A, () => db.exec(`delete from public.skills where id = '${SKILL_A}'`)))).toBeNull()
        const left = await db.one<Record<string, number>>(`select
          (select count(*) from public.documents where user_id = '${USER_A}')::int documents,
          (select count(*) from public.document_chunks where user_id = '${USER_A}')::int chunks,
          (select count(*) from public.quiz_questions)::int quiz_questions,
          (select count(*) from public.test_cases)::int test_cases,
          (select count(*) from public.messages)::int messages`)
        expect(left).toEqual({ documents: 0, chunks: 0, quiz_questions: 0, test_cases: 0, messages: 0 })
    })

    it('deleting a user removes all their data', async () => {
        expect(await failure(() => db.exec(`delete from auth.users where id = '${USER_B}'`))).toBeNull()
        const left = await db.one<{ n: number }>(`select
          (select count(*) from public.skills)::int + (select count(*) from public.documents)::int +
          (select count(*) from public.document_chunks)::int n`)
        expect(left.n).toBe(0)
    })
})
