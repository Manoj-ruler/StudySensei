import 'server-only'

/**
 * Central AI configuration. Model names come from the environment so they can
 * be changed without a code change; the key never leaves the server.
 */
export const aiConfig = {
    get apiKey(): string {
        const key = process.env.GOOGLE_API_KEY
        if (!key) {
            throw new Error('GOOGLE_API_KEY is not set. Add it to .env.local (server-side only).')
        }
        return key
    },
    /** Chat model for the mentor. A fast tier keeps the first token under a few seconds. */
    chatModel: process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.5-flash-lite',
    /** Used when the primary model is unavailable or overloaded. */
    chatFallbackModel: process.env.GEMINI_CHAT_FALLBACK_MODEL ?? 'gemini-flash-lite-latest',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
    /** Must match the vector(768) column on document_chunks. */
    embeddingDimensions: 768,
} as const

export const ragConfig = {
    /** Target chunk size and overlap, in characters. */
    chunkSize: 1000,
    chunkOverlap: 150,
    /** Chunks sent to the embedding API per request. */
    embeddingBatchSize: 50,
    /** Upper bound on chunks per document, to cap cost and processing time. */
    maxChunksPerDocument: 1500,
    maxFileBytes: 10 * 1024 * 1024,
    /** Default number of chunks retrieved for a query. */
    topK: 6,
    /**
     * Minimum cosine similarity for a chunk to count as relevant. With
     * gemini-embedding-001 at 768 dimensions, unrelated text scores around 0.5
     * and on-topic text around 0.7 or higher.
     */
    minSimilarity: 0.6,
    /**
     * Looser bar for a second pass when nothing clears minSimilarity. Broad
     * questions ("what does my document cover?") match no single chunk strongly.
     */
    fallbackMinSimilarity: 0.5,
    fallbackTopK: 4,
} as const

export const mentorConfig = {
    maxMessageCharacters: 4000,
    /** Earlier turns sent to the model, newest last. Older turns are dropped. */
    historyMessages: 10,
    /** Each earlier turn is cut to this length so one long answer cannot crowd out the rest. */
    historyMessageCharacters: 2000,
    maxOutputTokens: 2048,
    temperature: 0.4,
} as const
