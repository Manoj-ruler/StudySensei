import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { CodeLanguage, SubmitCodeResponse } from '@/lib/api/types'
import { adminClient } from '@/server/db/admin'
import type { Database } from '@/server/db/database.types'
import { getExecutor, SUBMISSION_LIMITS } from '@/server/sandbox'
import { isSandboxUnavailable } from '@/server/sandbox/types'
import { gradeCase, submissionStatus, type GradingCase } from './grade'

type Client = SupabaseClient<Database>

export class CodingError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404 | 429 | 500 | 502 | 503
    ) {
        super(message)
        this.name = 'CodingError'
    }
}

/** Each submission occupies shared sandbox capacity; this caps one learner's share. */
const MAX_SUBMISSIONS_PER_MINUTE = 8

/**
 * Evaluates a submission against all test cases of a question, including the
 * hidden ones, and records the outcome.
 *
 * `supabase` acts as the learner and is used for the ownership check. The
 * service-role client is used for what the learner must not be able to do
 * directly: read hidden test cases and write graded results.
 */
export async function evaluateSubmission(
    supabase: Client,
    user: User,
    input: { questionId: string; code: string; language: CodeLanguage }
): Promise<SubmitCodeResponse> {
    // RLS: only returns the question if it belongs to one of the caller's skills.
    const { data: question } = await supabase
        .from('coding_questions')
        .select('id, skill_id')
        .eq('id', input.questionId)
        .maybeSingle()
    if (!question) throw new CodingError('Challenge not found.', 404)

    const admin = adminClient()

    const since = new Date(Date.now() - 60_000).toISOString()
    const { count: recent } = await admin
        .from('code_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', since)
    if ((recent ?? 0) >= MAX_SUBMISSIONS_PER_MINUTE) {
        throw new CodingError('You are submitting too quickly. Wait a minute and try again.', 429)
    }

    const { data: rows, error: casesError } = await admin
        .from('test_cases')
        .select('input, expected_output, is_hidden, position')
        .eq('question_id', question.id)
        .order('position', { ascending: true, nullsFirst: false })
    if (casesError) throw new CodingError('The test cases could not be loaded.', 500)
    if (!rows || rows.length === 0) {
        throw new CodingError('This challenge has no test cases. Generate a new one.', 400)
    }

    // Visible cases first, so the learner sees those results at the top.
    const cases: GradingCase[] = rows
        .map((row) => ({ input: row.input, expectedOutput: row.expected_output, isHidden: row.is_hidden }))
        .sort((a, b) => Number(a.isHidden) - Number(b.isHidden))

    let executions
    try {
        executions = await getExecutor().run(
            cases.map((testCase) => ({ language: input.language, source: input.code, stdin: testCase.input })),
            SUBMISSION_LIMITS
        )
    } catch (error) {
        if (isSandboxUnavailable(error)) {
            console.error('Sandbox unavailable:', error.message)
            throw new CodingError('The code sandbox is unavailable right now. Please try again shortly.', 503)
        }
        throw error
    }

    const results = cases.map((testCase, index) => gradeCase(testCase, executions[index]))
    const status = submissionStatus(results, executions)
    const passedTests = results.filter((result) => result.passed).length
    const slowest = Math.max(0, ...executions.map((execution) => execution.timeMs ?? 0))

    // Before recording this run: has the learner already solved this challenge?
    const { count: earlierPasses } = await admin
        .from('code_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('question_id', question.id)
        .eq('status', 'passed')

    const { error: saveError } = await admin.from('code_submissions').insert({
        user_id: user.id,
        question_id: question.id,
        code: input.code,
        language: input.language,
        status,
        passed_tests: passedTests,
        total_tests: results.length,
        runtime_ms: slowest,
        // Already stripped of hidden inputs and outputs by gradeCase().
        results: JSON.parse(JSON.stringify(results)),
    })
    if (saveError) console.error('Submission could not be saved:', saveError.message)

    // One progress record per challenge, on the first passing submission.
    if (status === 'passed' && (earlierPasses ?? 0) === 0 && question.skill_id) {
        const { error: progressError } = await admin.from('progress_metrics').insert({
            user_id: user.id,
            skill_id: question.skill_id,
            activity_type: 'code',
            score: passedTests,
            max_score: results.length,
            metadata: { question_id: question.id, language: input.language },
        })
        if (progressError) console.error('Progress record could not be saved:', progressError.message)
    }

    return { status, passed_tests: passedTests, total_tests: results.length, results }
}
