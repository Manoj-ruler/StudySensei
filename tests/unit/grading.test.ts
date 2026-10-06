import { describe, expect, it } from 'vitest'
import { gradeCase, normalizeOutput, outputsMatch, submissionStatus } from '@/server/coding/grade'
import type { ExecutionResult, ExecutionStatus } from '@/server/sandbox/types'

const ran = (stdout: string): ExecutionResult => ({
    status: 'ok', stdout, stderr: '', exitCode: 0, timeMs: 5, memoryKb: 1,
})
const failed = (status: ExecutionStatus, stderr = ''): ExecutionResult => ({
    status, stdout: 'partial SECRET-INPUT', stderr, exitCode: 1, timeMs: 5, memoryKb: 1,
})

const visible = { input: '1 2', expectedOutput: '3', isHidden: false }
const hidden = { input: 'SECRET-INPUT', expectedOutput: 'SECRET-OUTPUT', isHidden: true }

describe('output comparison', () => {
    it('ignores line endings, trailing spaces and trailing blank lines', () => {
        expect(normalizeOutput('a  \r\nb\t\n\n\n')).toBe('a\nb')
        expect(outputsMatch('42\n', '42')).toBe(true)
    })

    it('is strict about everything else', () => {
        expect(outputsMatch(' 42', '42')).toBe(false)
        expect(outputsMatch('Yes', 'yes')).toBe(false)
        expect(outputsMatch('a\n\nb', 'a\nb')).toBe(false)
        expect(outputsMatch('', '0')).toBe(false)
    })
})

describe('visible test cases', () => {
    it('show input, expected and actual output', () => {
        expect(gradeCase(visible, ran('3\n'))).toEqual({
            input: '1 2', expected: '3', actual: '3', passed: true, is_hidden: false, error: undefined,
        })
    })

    it('show the actual output of a wrong answer', () => {
        expect(gradeCase(visible, ran('4'))).toMatchObject({ passed: false, actual: '4' })
    })

    it('show the end of the error for a crash', () => {
        const result = gradeCase(visible, failed('runtime_error', 'Traceback (most recent call last):\nZeroDivisionError: division by zero'))
        expect(result.passed).toBe(false)
        expect(result.error).toMatch(/crashed/)
        expect(result.error).toMatch(/ZeroDivisionError/)
    })
})

describe('hidden test cases', () => {
    it('reveal nothing when passed', () => {
        expect(gradeCase(hidden, ran('SECRET-OUTPUT'))).toEqual({
            input: '', expected: '', actual: '', passed: true, is_hidden: true, error: undefined,
        })
    })

    it('reveal nothing about the test on a wrong answer, even if the program echoes its input', () => {
        const result = gradeCase(hidden, ran('wrong SECRET-INPUT echoed'))
        expect(result).toMatchObject({ passed: false, error: 'Wrong answer.' })
        expect(JSON.stringify(result)).not.toContain('SECRET')
    })

    it.each<[ExecutionStatus, string]>([
        ['time_limit', 'Time limit exceeded.'],
        ['memory_limit', 'Memory limit exceeded.'],
        ['runtime_error', 'Your program crashed.'],
        ['compile_error', 'Your program could not be compiled.'],
        ['sandbox_error', 'The sandbox could not run this test.'],
    ])('reveal only the kind of failure for %s', (status, message) => {
        const result = gradeCase(hidden, failed(status, 'stderr mentioning SECRET-INPUT'))
        expect(result.error).toBe(message)
        expect(JSON.stringify(result)).not.toContain('SECRET')
    })
})

describe('submission status', () => {
    const pass = gradeCase(visible, ran('3'))
    const wrong = gradeCase(visible, ran('4'))

    it('is passed only when every case passes', () => {
        expect(submissionStatus([pass, pass], [ran('3'), ran('3')])).toBe('passed')
        expect(submissionStatus([pass, wrong], [ran('3'), ran('4')])).toBe('failed')
    })

    it('is error when the code never produced gradable output', () => {
        const broken = [failed('compile_error'), failed('compile_error')]
        expect(submissionStatus(broken.map((execution) => gradeCase(visible, execution)), broken)).toBe('error')
    })

    it('is failed, not passed, for a challenge with no cases', () => {
        expect(submissionStatus([], [])).not.toBe('passed')
    })
})
