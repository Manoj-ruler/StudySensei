import { after } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError } from '@/server/http/responses'
import { ingestDocument } from '@/server/rag/ingest'

export const maxDuration = 300

interface RouteContext {
    params: Promise<{ id: string }>
}

/** (Re)runs ingestion for a document, e.g. after a failure or for files uploaded before the pipeline existed. */
export const POST = withUser<RouteContext>(async (_request, { supabase }, { params }) => {
    const limited = await rateLimit(supabase, 'document_process')
    if (limited) return limited

    const id = z.uuid().safeParse((await params).id)
    if (!id.success) return apiError(400, 'BAD_REQUEST', 'Invalid document id.')

    const { data: document } = await supabase
        .from('documents')
        .select('id, status')
        .eq('id', id.data)
        .maybeSingle()
    if (!document) return apiError(404, 'NOT_FOUND', 'Document not found.')

    if (document.status === 'processing') {
        return apiError(409, 'BAD_REQUEST', 'This document is already being processed.')
    }

    // Mark it now so the client sees the change on its next poll.
    await supabase
        .from('documents')
        .update({ status: 'processing', error_message: null })
        .eq('id', document.id)

    after(() => ingestDocument(supabase, document.id))

    return NextResponse.json({ status: 'processing' }, { status: 202 })
})
