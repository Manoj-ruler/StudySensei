import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/server/db/database.types'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from '@/lib/documents'
import { ragConfig } from '@/server/ai/config'
import { chunkPages } from './chunk'
import { embedChunks } from './embeddings'
import { DocumentProcessingError, documentKind, extractDocument } from './extract'

type Client = SupabaseClient<Database>

export { DOCUMENTS_BUCKET }

const INSERT_BATCH_SIZE = 100

async function setStatus(
    supabase: Client,
    documentId: string,
    fields: Database['public']['Tables']['documents']['Update']
) {
    await supabase.from('documents').update(fields).eq('id', documentId)
}

/**
 * Runs the ingestion pipeline for one document:
 * storage file -> text extraction -> chunking -> embeddings -> document_chunks.
 *
 * The client acts as the document's owner, so RLS applies to every step.
 * Safe to run again: existing chunks are replaced. Never throws; the outcome
 * is recorded on the document row (status 'ready' or 'failed' + error_message).
 */
export async function ingestDocument(supabase: Client, documentId: string): Promise<void> {
    const { data: doc } = await supabase
        .from('documents')
        .select('id, user_id, filename, storage_path')
        .eq('id', documentId)
        .maybeSingle()

    if (!doc) return

    await setStatus(supabase, documentId, { status: 'processing', error_message: null })

    try {
        const kind = documentKind(doc.filename)
        if (!kind) throw new DocumentProcessingError('This file type is not supported.')
        if (!doc.storage_path) throw new DocumentProcessingError('The stored file is missing.')

        const { data: file, error: downloadError } = await supabase.storage
            .from(DOCUMENTS_BUCKET)
            .download(doc.storage_path)
        if (downloadError || !file) {
            throw new DocumentProcessingError('The stored file could not be downloaded.')
        }
        if (file.size > MAX_DOCUMENT_BYTES) {
            throw new DocumentProcessingError('The file is too large to process.')
        }

        const extracted = await extractDocument(new Uint8Array(await file.arrayBuffer()), kind)
        if (extracted.pages.length === 0) {
            throw new DocumentProcessingError(
                'No text could be extracted. Scanned or image-only documents are not supported.'
            )
        }

        const chunks = await chunkPages(extracted.pages, ragConfig)
        if (chunks.length > ragConfig.maxChunksPerDocument) {
            throw new DocumentProcessingError(
                `The document is too long to process (over ${ragConfig.maxChunksPerDocument} sections).`
            )
        }

        const vectors = await embedChunks(chunks.map((chunk) => chunk.content))

        // Replace any chunks from a previous run.
        const { error: deleteError } = await supabase
            .from('document_chunks')
            .delete()
            .eq('document_id', documentId)
        if (deleteError) throw new Error(deleteError.message)

        for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
            const rows = chunks.slice(start, start + INSERT_BATCH_SIZE).map((chunk, offset) => ({
                document_id: documentId,
                // Overwritten by the set_chunk_ownership trigger from the parent document.
                user_id: doc.user_id,
                content: chunk.content,
                chunk_index: chunk.index,
                page_number: chunk.pageNumber,
                // pgvector accepts its text form: "[0.1,0.2,...]"
                embedding: JSON.stringify(vectors[start + offset]),
            }))
            const { error: insertError } = await supabase.from('document_chunks').insert(rows)
            if (insertError) throw new Error(insertError.message)
        }

        await setStatus(supabase, documentId, {
            status: 'ready',
            page_count: extracted.pageCount,
            error_message: null,
        })
    } catch (error) {
        // Leave no partial set of chunks behind a failed run.
        await supabase.from('document_chunks').delete().eq('document_id', documentId)
        if (!(error instanceof DocumentProcessingError)) {
            console.error(`Document ingestion failed for ${documentId}:`, error)
        }
        await setStatus(supabase, documentId, {
            status: 'failed',
            error_message:
                error instanceof DocumentProcessingError
                    ? error.message
                    : 'Processing failed. Please try again.',
        })
    }
}
