import 'server-only'
import { Document } from '@langchain/core/documents'
import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/server/db/database.types'
import { ragConfig } from '@/server/ai/config'
import { queryEmbeddings } from './embeddings'

export interface ChunkMetadata {
    chunkId: string
    documentId: string
    filename: string
    chunkIndex: number | null
    pageNumber: number | null
    /** Cosine similarity to the query, 0..1 for relevant text. */
    similarity: number
}

export interface SkillChunkRetrieverInput extends BaseRetrieverInput {
    /** Client acting as the signed-in user; RLS limits results to their chunks. */
    supabase: SupabaseClient<Database>
    skillId: string
    k?: number
    minSimilarity?: number
    /**
     * When true and nothing clears minSimilarity, return a few weaker matches
     * instead of nothing. Callers can tell from each chunk's similarity.
     */
    allowWeakMatches?: boolean
}

/**
 * LangChain retriever over the pgvector index, scoped to one skill of the
 * calling user. It calls the match_chunks() SQL function rather than
 * LangChain's generic Supabase vector store because isolation here is
 * enforced by row level security and typed columns, not a metadata filter.
 */
export class SkillChunkRetriever extends BaseRetriever {
    lc_namespace = ['studysensei', 'retrievers']

    private readonly supabase: SupabaseClient<Database>
    private readonly skillId: string
    private readonly k: number
    private readonly minSimilarity: number
    private readonly allowWeakMatches: boolean

    constructor(input: SkillChunkRetrieverInput) {
        super(input)
        this.supabase = input.supabase
        this.skillId = input.skillId
        this.k = input.k ?? ragConfig.topK
        this.minSimilarity = input.minSimilarity ?? ragConfig.minSimilarity
        this.allowWeakMatches = input.allowWeakMatches ?? false
    }

    /** `invoke()` with the metadata type preserved (the base class returns untyped documents). */
    async retrieve(query: string): Promise<Document<ChunkMetadata>[]> {
        return (await this.invoke(query)) as Document<ChunkMetadata>[]
    }

    async _getRelevantDocuments(query: string): Promise<Document<ChunkMetadata>[]> {
        const embedding = await queryEmbeddings().embedQuery(query)

        const search = async (matchCount: number, minSimilarity: number) => {
            const { data, error } = await this.supabase.rpc('match_chunks', {
                query_embedding: JSON.stringify(embedding),
                p_skill_id: this.skillId,
                match_count: matchCount,
                min_similarity: minSimilarity,
            })
            if (error) throw new Error(`Vector search failed: ${error.message}`)
            return data ?? []
        }

        let rows = await search(this.k, this.minSimilarity)
        if (rows.length === 0 && this.allowWeakMatches) {
            rows = await search(ragConfig.fallbackTopK, ragConfig.fallbackMinSimilarity)
        }

        return rows.map(
            (row) =>
                new Document<ChunkMetadata>({
                    pageContent: row.content,
                    metadata: {
                        chunkId: row.id,
                        documentId: row.document_id,
                        filename: row.filename,
                        chunkIndex: row.chunk_index,
                        pageNumber: row.page_number,
                        similarity: row.similarity,
                    },
                })
        )
    }
}
