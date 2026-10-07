import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/server/db/database.types'

type Client = SupabaseClient<Database>

const MAX_CHUNKS_SCANNED = 400

export interface StudyMaterial {
    /** Excerpts joined for a prompt, or null when the skill has no processed documents. */
    text: string | null
    documentCount: number
}

/**
 * Picks a spread of excerpts from a skill's processed documents to ground
 * quiz and roadmap generation. Unlike the mentor there is no question to
 * search with, so chunks are sampled evenly across each document rather
 * than retrieved by similarity.
 */
export async function sampleStudyMaterial(
    supabase: Client,
    skillId: string,
    options: { maxExcerpts: number; maxCharacters: number; documentIds?: string[] }
): Promise<StudyMaterial> {
    let query = supabase
        .from('document_chunks')
        .select('document_id, chunk_index, page_number, content, documents!inner(filename)')
        .eq('skill_id', skillId)
        .order('document_id')
        .order('chunk_index')
        .limit(MAX_CHUNKS_SCANNED)
    if (options.documentIds?.length) query = query.in('document_id', options.documentIds)

    const { data: chunks } = await query
    if (!chunks || chunks.length === 0) return { text: null, documentCount: 0 }

    // Evenly spaced picks across everything scanned, so every document and
    // every part of a long document is represented.
    const step = Math.max(1, chunks.length / options.maxExcerpts)
    const picked: typeof chunks = []
    for (let position = 0; position < chunks.length && picked.length < options.maxExcerpts; position += step) {
        picked.push(chunks[Math.floor(position)])
    }

    let used = 0
    const parts: string[] = []
    for (const chunk of picked) {
        if (used + chunk.content.length > options.maxCharacters) break
        const page = chunk.page_number ? `, page ${chunk.page_number}` : ''
        parts.push(`(${chunk.documents.filename}${page})\n${chunk.content}`)
        used += chunk.content.length
    }

    return {
        text: parts.join('\n\n'),
        documentCount: new Set(chunks.map((chunk) => chunk.document_id)).size,
    }
}
