import type {
    DocumentUploadResponse,
    GenerateQuestionRequest,
    GenerateQuestionResponse,
    MentorMessageRequest,
    MentorMessageResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizHistoryResponse,
    QuizSaveRequest,
    RoadmapGenerateRequest,
    RoadmapGenerateResponse,
    SkillAnalyticsResponse,
    SubmitCodeRequest,
    SubmitCodeResponse,
} from './types'

/**
 * Error thrown for any failed API call. `message` is safe to show to the user.
 */
export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

/** Message to show for any thrown value, with a fallback for non-API errors. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
    return error instanceof ApiError ? error.message : fallback
}

/**
 * Calls a same-origin route handler under /api. The session cookie identifies
 * the user, so no token or user id is sent explicitly.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
        response = await fetch(`/api${path}`, init)
    } catch {
        throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK')
    }

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
        const error = (body as { error?: { code?: string; message?: string } } | null)?.error
        throw new ApiError(
            error?.message ?? `Request failed (${response.status}).`,
            response.status,
            error?.code ?? 'UNKNOWN'
        )
    }

    return body as T
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
    return request<T>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
}

export const api = {
    mentor: {
        sendMessage: (payload: MentorMessageRequest) =>
            postJson<MentorMessageResponse>('/mentor/message', payload),
    },
    documents: {
        upload: (file: File, skillId: string) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('skill_id', skillId)
            return request<DocumentUploadResponse>('/documents/upload', {
                method: 'POST',
                body: formData,
            })
        },
        remove: (documentId: string) =>
            request<unknown>(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' }),
    },
    roadmap: {
        generate: (payload: RoadmapGenerateRequest) =>
            postJson<RoadmapGenerateResponse>('/roadmap/generate', payload),
    },
    quiz: {
        generate: (payload: QuizGenerateRequest) =>
            postJson<QuizGenerateResponse>('/quiz/generate', payload),
        save: (payload: QuizSaveRequest) => postJson<unknown>('/quiz/save', payload),
        history: (skillId: string) =>
            request<QuizHistoryResponse>(`/quiz/history/${encodeURIComponent(skillId)}`),
    },
    solver: {
        generateQuestion: (payload: GenerateQuestionRequest) =>
            postJson<GenerateQuestionResponse>('/solver/generate-question', payload),
        submit: (payload: SubmitCodeRequest) =>
            postJson<SubmitCodeResponse>('/solver/submit', payload),
    },
    analytics: {
        skill: (skillId: string) =>
            request<SkillAnalyticsResponse>(`/analytics/skill/${encodeURIComponent(skillId)}`),
    },
}
