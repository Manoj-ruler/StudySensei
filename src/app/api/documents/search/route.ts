import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { apiError } from '@/server/http/responses'
import { SkillChunkRetriever } from '@/server/rag/retriever'

const bodySchema = z.object({
    skill_id: z.uuid(),
    query: z.string().trim().min(2).max(500),
    limit: z.number().int().min(1).max(20).optional(),
})

/** Semantic search over the caller's documents for one skill. */
export const POST = withUser(async (request, { supabase }) => {
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(400, 'BAD_REQUEST', 'A skill and a search query (2-500 characters) are required.')
    }

    try {
        const retriever = new SkillChunkRetriever({
            supabase,
            skillId: body.data.skill_id,
            k: body.data.limit,
        })
        const documents = await retriever.retrieve(body.data.query)

        return NextResponse.json({
            results: documents.map((doc) => ({
                chunk_id: doc.metadata.chunkId,
                document_id: doc.metadata.documentId,
                filename: doc.metadata.filename,
                page_number: doc.metadata.pageNumber,
                similarity: Number(doc.metadata.similarity.toFixed(4)),
                content: doc.pageContent,
            })),
        })
    } catch (error) {
        console.error('Document search failed:', error)
        return apiError(500, 'INTERNAL', 'Search is temporarily unavailable. Please try again.')
    }
})
