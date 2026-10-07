import type {
    DocumentSearchResponse,
    DocumentUploadResponse,
    GenerateQuestionRequest,
    GenerateQuestionResponse,
    MentorMessageRequest,
    MentorStreamEvent,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizAnswerRequest,
    QuizAnswerResponse,
    QuizHistoryResponse,
    RoadmapGenerateRequest,
    RoadmapGenerateResponse,
    SkillAnalyticsResponse,
    SubmitCodeRequest,
    SubmitCodeResponse,
} from './types'
import {
    DOCUMENT_CONTENT_TYPE,
    DOCUMENTS_BUCKET,
    MAX_DOCUMENT_BYTES,
    documentKind,
    newStoragePath,
} from '@/lib/documents'
import { createClient } from '@/utils/supabase/client'

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

/** POSTs JSON and reads a newline-delimited JSON response as it arrives. */
async function streamNdjson<TEvent>(
    path: string,
    payload: unknown,
    onEvent: (event: TEvent) => void
): Promise<void> {
    let response: Response
    try {
        response = await fetch(`/api${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
    } catch {
        throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK')
    }

    if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as
            | { error?: { code?: string; message?: string } }
            | null
        throw new ApiError(
            body?.error?.message ?? `Request failed (${response.status}).`,
            response.status,
            body?.error?.code ?? 'UNKNOWN'
        )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    const flush = (final: boolean) => {
        const lines = buffered.split('\n')
        buffered = final ? '' : (lines.pop() ?? '')
        for (const line of lines) {
            if (line.trim()) onEvent(JSON.parse(line) as TEvent)
        }
    }

    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffered += decoder.decode(value, { stream: true })
            flush(false)
        }
        buffered += decoder.decode()
        flush(true)
    } catch {
        throw new ApiError('The connection was interrupted. Please try again.', 0, 'NETWORK')
    }
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
        /**
         * Sends a message and calls `onEvent` for each streamed event as the
         * answer is generated. Rejects with ApiError if the request itself fails.
         */
        streamMessage: (payload: MentorMessageRequest, onEvent: (event: MentorStreamEvent) => void) =>
            streamNdjson<MentorStreamEvent>('/mentor/message', payload, onEvent),
    },
    documents: {
        /**
         * Uploads a file straight to storage (so it never passes through the app
         * server and its request-size limit), then asks the server to record and
         * process it. Storage enforces ownership, size and type on its side.
         */
        upload: async (file: File, skillId: string) => {
            const kind = documentKind(file.name)
            if (!kind) throw new ApiError('Only PDF, TXT and MD files are supported.', 400, 'BAD_REQUEST')
            if (file.size === 0) throw new ApiError('The file is empty.', 400, 'BAD_REQUEST')
            if (file.size > MAX_DOCUMENT_BYTES) {
                throw new ApiError(
                    `The file is larger than ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`,
                    400,
                    'BAD_REQUEST'
                )
            }

            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new ApiError('You need to sign in to do that.', 401, 'UNAUTHENTICATED')

            const storagePath = newStoragePath(user.id, skillId, file.name)
            // Sent as raw bytes with an explicit type: given a File, the storage client
            // uses the browser's own label for it (e.g. text/markdown), which the
            // bucket's allowed types would reject.
            const { error } = await supabase.storage
                .from(DOCUMENTS_BUCKET)
                .upload(storagePath, await file.arrayBuffer(), {
                    contentType: DOCUMENT_CONTENT_TYPE[kind],
                    upsert: false,
                })
            if (error) {
                throw new ApiError('The file could not be uploaded. Please try again.', 0, 'UPLOAD_FAILED')
            }

            try {
                return await postJson<DocumentUploadResponse>('/documents/upload', {
                    skill_id: skillId,
                    storage_path: storagePath,
                    filename: file.name,
                })
            } catch (registerError) {
                // Do not leave an unreferenced file behind.
                await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
                throw registerError
            }
        },
        /** Starts (or restarts) processing; poll the document status for the outcome. */
        process: (documentId: string) =>
            request<{ status: string }>(`/documents/${encodeURIComponent(documentId)}/process`, {
                method: 'POST',
            }),
        search: (skillId: string, query: string, limit?: number) =>
            postJson<DocumentSearchResponse>('/documents/search', { skill_id: skillId, query, limit }),
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
        /** Submits one answer for grading on the server. */
        answer: (payload: QuizAnswerRequest) =>
            postJson<QuizAnswerResponse>('/quiz/answer', payload),
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
