import { after } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError } from '@/server/http/responses'
import { ragConfig } from '@/server/ai/config'
import { documentKind, looksLikePdf } from '@/server/rag/extract'
import { DOCUMENTS_BUCKET, ingestDocument } from '@/server/rag/ingest'

// Text extraction and embedding can take a while for long documents.
export const maxDuration = 300

const CONTENT_TYPES = { pdf: 'application/pdf', text: 'text/plain' } as const

/** Keeps the original name recognisable while removing anything unsafe in a storage key. */
function safeFilename(name: string) {
    const cleaned = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim()
    return (cleaned || 'document').slice(-120)
}

export const POST = withUser(async (request, { user, supabase }) => {
    const limited = await rateLimit(supabase, 'document_upload')
    if (limited) return limited

    const limitMb = ragConfig.maxFileBytes / (1024 * 1024)

    // A body over the server's request size limit cannot be parsed at all.
    const form = await request.formData().catch(() => null)
    if (!form) {
        return apiError(400, 'BAD_REQUEST', `The upload could not be read. Files must be ${limitMb} MB or smaller.`)
    }

    const file = form.get('file')
    const skillId = z.uuid().safeParse(form.get('skill_id'))

    if (!(file instanceof File) || !skillId.success) {
        return apiError(400, 'BAD_REQUEST', 'A file and a skill are required.')
    }

    const kind = documentKind(file.name)
    if (!kind) {
        return apiError(400, 'BAD_REQUEST', 'Only PDF, TXT and MD files are supported.')
    }
    if (file.size === 0) {
        return apiError(400, 'BAD_REQUEST', 'The file is empty.')
    }
    if (file.size > ragConfig.maxFileBytes) {
        return apiError(400, 'BAD_REQUEST', `The file is larger than ${limitMb} MB.`)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (kind === 'pdf' && !looksLikePdf(bytes)) {
        return apiError(400, 'BAD_REQUEST', 'This file is not a valid PDF.')
    }

    // RLS only returns the skill if it belongs to the caller.
    const { data: skill } = await supabase
        .from('skills')
        .select('id')
        .eq('id', skillId.data)
        .maybeSingle()
    if (!skill) {
        return apiError(404, 'NOT_FOUND', 'Skill not found.')
    }

    const filename = safeFilename(file.name)
    const storagePath = `${user.id}/${skill.id}/${crypto.randomUUID()}-${filename}`

    const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storagePath, bytes, { contentType: CONTENT_TYPES[kind], upsert: false })
    if (uploadError) {
        console.error('Document upload to storage failed:', uploadError.message)
        return apiError(500, 'INTERNAL', 'The file could not be stored. Please try again.')
    }

    const { data: document, error: insertError } = await supabase
        .from('documents')
        .insert({
            user_id: user.id,
            skill_id: skill.id,
            filename,
            storage_path: storagePath,
            file_size: file.size,
            file_type: kind,
            // Ingestion starts right after the response is sent.
            status: 'processing',
        })
        .select('id')
        .single()

    if (insertError || !document) {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
        console.error('Document row insert failed:', insertError?.message)
        return apiError(500, 'INTERNAL', 'The document could not be saved. Please try again.')
    }

    // Respond immediately; the client polls the document status while this runs.
    after(() => ingestDocument(supabase, document.id))

    return NextResponse.json({ document_id: document.id }, { status: 201 })
})
