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
} as const
