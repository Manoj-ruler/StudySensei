import type { TestResult } from '@/lib/api/types'
import type { ExecutionResult, ExecutionStatus } from '@/server/sandbox/types'

export interface GradingCase {
    input: string
    expectedOutput: string
    isHidden: boolean
}

/**
 * Output comparison used for grading: line endings, trailing spaces on each
 * line and trailing blank lines are ignored; everything else must match exactly.
 */
export function normalizeOutput(text: string): string {
    return text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/\n+$/, '')
}

export function outputsMatch(actual: string, expected: string): boolean {
    return normalizeOutput(actual) === normalizeOutput(expected)
}

const FAILURE_MESSAGE: Record<Exclude<ExecutionStatus, 'ok'>, string> = {
    runtime_error: 'Your program crashed.',
    compile_error: 'Your program could not be compiled.',
    time_limit: 'Time limit exceeded.',
    memory_limit: 'Memory limit exceeded.',
    sandbox_error: 'The sandbox could not run this test.',
}

/** Last lines of stderr: enough to see the exception without dumping a full trace. */
function errorTail(stderr: string): string {
    return stderr.trim().split('\n').slice(-6).join('\n').slice(0, 1200)
}

/**
 * Turns one execution into the result shown to the learner. For hidden cases
 * nothing about the test itself is revealed: no input, no expected output, no
 * program output (which could echo the input), only pass/fail and the kind of failure.
 */
export function gradeCase(testCase: GradingCase, execution: ExecutionResult): TestResult {
    const ran = execution.status === 'ok'
    const passed = ran && outputsMatch(execution.stdout, testCase.expectedOutput)

    if (testCase.isHidden) {
        return {
            input: '',
            expected: '',
            actual: '',
            passed,
            is_hidden: true,
            error: passed ? undefined : ran ? 'Wrong answer.' : FAILURE_MESSAGE[execution.status as Exclude<ExecutionStatus, 'ok'>],
        }
    }

    let error: string | undefined
    if (!ran) {
        const detail = errorTail(execution.stderr)
        const message = FAILURE_MESSAGE[execution.status as Exclude<ExecutionStatus, 'ok'>]
        error = detail ? `${message}\n${detail}` : message
    }

    return {
        input: testCase.input,
        expected: normalizeOutput(testCase.expectedOutput),
        actual: normalizeOutput(execution.stdout),
        passed,
        is_hidden: false,
        error,
    }
}

export type SubmissionStatus = 'passed' | 'failed' | 'error'

/** 'error' means the code never produced gradable output on any test (e.g. a syntax error). */
export function submissionStatus(results: TestResult[], executions: ExecutionResult[]): SubmissionStatus {
    if (results.length > 0 && results.every((result) => result.passed)) return 'passed'
    return executions.every((execution) => execution.status !== 'ok') ? 'error' : 'failed'
}
