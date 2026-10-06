import 'server-only'
import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings'
import { aiConfig, ragConfig } from '@/server/ai/config'
import { DocumentProcessingError } from './extract'

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'

// Gemini embeds documents and queries differently; using the matching task
// type on each side improves retrieval quality.
type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

interface GeminiErrorBody {
    error?: {
        status?: string
        message?: string
        details?: { retryDelay?: string; violations?: { quotaId?: string }[] }[]
    }
}

/** A failed call to the embedding API, with the wait Google asked for, if any. */
class GeminiApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfterMs: number | null,
        readonly dailyQuotaExhausted: boolean
    ) {
        super(message)
        this.name = 'GeminiApiError'
    }
}

/** Longest single wait for a rate limit to clear (the free tier resets every minute). */
const MAX_RETRY_WAIT_MS = 70_000
const MAX_ATTEMPTS = 5

/**
 * LangChain Embeddings backed by the Gemini embedding API.
 *
 * Written against the REST API rather than using GoogleGenerativeAIEmbeddings
 * from @langchain/google-genai: that class resolves a rejected batch to empty
 * vectors, which hides rate-limit errors (the free tier allows 100 texts per
 * minute) and would store chunks without embeddings.
 */
export class GeminiEmbeddings extends Embeddings {
    private readonly taskType: TaskType

    constructor(fields: EmbeddingsParams & { taskType: TaskType }) {
        // Retries are handled here, where the server-provided delay is known.
        super({ ...fields, maxRetries: 0 })
        this.taskType = fields.taskType
    }

    private request(text: string) {
        return {
            model: `models/${aiConfig.embeddingModel}`,
            content: { parts: [{ text }] },
            taskType: this.taskType,
            outputDimensionality: aiConfig.embeddingDimensions,
        }
    }

    private async post<T>(method: string, body: unknown): Promise<T> {
        for (let attempt = 1; ; attempt++) {
            try {
                return await this.postOnce<T>(method, body)
            } catch (error) {
                const retryable =
                    error instanceof GeminiApiError
                        ? !error.dailyQuotaExhausted && [429, 500, 503].includes(error.status)
                        : true // network failure
                if (!retryable || attempt >= MAX_ATTEMPTS) throw error

                const wait =
                    error instanceof GeminiApiError && error.retryAfterMs !== null
                        ? Math.min(error.retryAfterMs + 2_000, MAX_RETRY_WAIT_MS)
                        : Math.min(2_000 * 2 ** attempt, MAX_RETRY_WAIT_MS)
                await new Promise((resolve) => setTimeout(resolve, wait))
            }
        }
    }

    private async postOnce<T>(method: string, body: unknown): Promise<T> {
        const response = await fetch(`${API_ROOT}/models/${aiConfig.embeddingModel}:${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': aiConfig.apiKey },
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as GeminiErrorBody | null
            const details = payload?.error?.details ?? []
            const retryDelay = details.find((d) => d.retryDelay)?.retryDelay
            const seconds = retryDelay ? Number.parseFloat(retryDelay) : Number.NaN
            const quotaIds = details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? '')
            throw new GeminiApiError(
                payload?.error?.message ?? `Embedding request failed (${response.status}).`,
                response.status,
                Number.isFinite(seconds) ? seconds * 1000 : null,
                quotaIds.some((id) => /PerDay/i.test(id))
            )
        }

        return (await response.json()) as T
    }

    private validate(vector: number[] | undefined): number[] {
        if (!vector || vector.length !== aiConfig.embeddingDimensions) {
            throw new Error('The embedding service returned a vector of unexpected size.')
        }
        return vector
    }

    /** Batches are sent one after another so a long document stays within the per-minute limit. */
    async embedDocuments(texts: string[]): Promise<number[][]> {
        const vectors: number[][] = []
        for (let start = 0; start < texts.length; start += ragConfig.embeddingBatchSize) {
            const batch = texts.slice(start, start + ragConfig.embeddingBatchSize)
            const result = await this.post<{ embeddings?: { values?: number[] }[] }>(
                'batchEmbedContents',
                { requests: batch.map((text) => this.request(text)) }
            )
            if (result.embeddings?.length !== batch.length) {
                throw new Error('The embedding service returned an unexpected number of vectors.')
            }
            vectors.push(...result.embeddings.map((embedding) => this.validate(embedding.values)))
        }
        return vectors
    }

    async embedQuery(text: string): Promise<number[]> {
        const result = await this.post<{ embedding?: { values?: number[] } }>(
            'embedContent',
            this.request(text)
        )
        return this.validate(result.embedding?.values)
    }
}

export function queryEmbeddings() {
    return new GeminiEmbeddings({ taskType: 'RETRIEVAL_QUERY' })
}

/** Embeds document chunks, translating quota failures into a message the owner can act on. */
export async function embedChunks(texts: string[]): Promise<number[][]> {
    try {
        return await new GeminiEmbeddings({ taskType: 'RETRIEVAL_DOCUMENT' }).embedDocuments(texts)
    } catch (error) {
        if (error instanceof GeminiApiError && error.status === 429) {
            throw new DocumentProcessingError(
                error.dailyQuotaExhausted
                    ? "Today's embedding quota is used up. Try again tomorrow."
                    : 'The embedding service is busy. Please retry in a minute.'
            )
        }
        throw error
    }
}
