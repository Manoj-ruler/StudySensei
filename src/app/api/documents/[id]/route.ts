import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { apiError } from '@/server/http/responses'
import { DOCUMENTS_BUCKET } from '@/server/rag/ingest'

interface RouteContext {
    params: Promise<{ id: string }>
}

export const DELETE = withUser<RouteContext>(async (_request, { supabase }, { params }) => {
    const id = z.uuid().safeParse((await params).id)
    if (!id.success) return apiError(400, 'BAD_REQUEST', 'Invalid document id.')

    // RLS only returns the document if it belongs to the caller.
    const { data: document } = await supabase
        .from('documents')
        .select('id, storage_path')
        .eq('id', id.data)
        .maybeSingle()
    if (!document) return apiError(404, 'NOT_FOUND', 'Document not found.')

    // Row first: its chunks cascade, and a failed file removal then only
    // leaves an unreferenced file rather than a document that cannot be opened.
    const { error } = await supabase.from('documents').delete().eq('id', document.id)
    if (error) {
        console.error('Document delete failed:', error.message)
        return apiError(500, 'INTERNAL', 'The document could not be deleted. Please try again.')
    }

    if (document.storage_path) {
        const { error: storageError } = await supabase.storage
            .from(DOCUMENTS_BUCKET)
            .remove([document.storage_path])
        if (storageError) {
            console.error('Stored file removal failed:', storageError.message)
        }
    }

    return NextResponse.json({ deleted: true })
})
