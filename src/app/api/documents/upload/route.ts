import { after } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, documentKind, safeFilename } from '@/lib/documents'
import { withUser } from '@/server/auth/require-user'
import { rateLimit } from '@/server/security/rate-limit'
import { apiError } from '@/server/http/responses'
import { ingestDocument } from '@/server/rag/ingest'

// Text extraction and embedding can take a while for long documents.
export const maxDuration = 300

const bodySchema = z.object({
    skill_id: z.uuid(),
    /** Path of a file the browser has already uploaded to the documents bucket. */
    storage_path: z.string().min(1).max(600),
    filename: z.string().trim().min(1).max(255),
})

/**
 * Registers a file the browser uploaded directly to storage, then processes it.
 *
 * The file does not pass through this server (so hosting request-size limits
 * do not apply). Storage enforces who may write where, the size limit and the
 * allowed types; this handler checks that the path is the caller's own folder
 * for this skill and that the file is really there before recording it.
 */
export const POST = withUser(async (request, { user, supabase }) => {
    const limited = await rateLimit(supabase, 'document_upload')
    if (limited) return limited

    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) {
        return apiError(400, 'BAD_REQUEST', 'A skill, a stored file and a file name are required.')
    }
    const { skill_id: skillId, storage_path: storagePath } = body.data

    // The path must be inside the caller's folder for this skill: no traversal, no other user's files.
    const expectedPrefix = `${user.id}/${skillId}/`
    const name = storagePath.slice(expectedPrefix.length)
    if (!storagePath.startsWith(expectedPrefix) || !name || name.includes('/') || name.includes('..')) {
        return apiError(400, 'BAD_REQUEST', 'That file does not belong to this skill.')
    }

    const filename = safeFilename(body.data.filename)
    const kind = documentKind(filename)
    if (!kind) {
        return apiError(400, 'BAD_REQUEST', 'Only PDF, TXT and MD files are supported.')
    }

    // RLS only returns the skill if it belongs to the caller.
    const { data: skill } = await supabase.from('skills').select('id').eq('id', skillId).maybeSingle()
    if (!skill) {
        return apiError(404, 'NOT_FOUND', 'Skill not found.')
    }

    const bucket = supabase.storage.from(DOCUMENTS_BUCKET)
    const { data: stored, error: infoError } = await bucket.info(storagePath)
    if (infoError || !stored) {
        return apiError(400, 'BAD_REQUEST', 'The uploaded file could not be found. Please upload it again.')
    }
    const size = stored.size ?? 0
    if (size === 0 || size > MAX_DOCUMENT_BYTES) {
        await bucket.remove([storagePath])
        return apiError(
            400,
            'BAD_REQUEST',
            size === 0
                ? 'The file is empty.'
                : `The file is larger than ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`
        )
    }

    const { data: document, error: insertError } = await supabase
        .from('documents')
        .insert({
            user_id: user.id,
            skill_id: skill.id,
            filename,
            storage_path: storagePath,
            file_size: size,
            file_type: kind,
            // Ingestion starts right after the response is sent.
            status: 'processing',
        })
        .select('id')
        .single()

    if (insertError || !document) {
        // 23505: this stored file is already registered. Leave it in place.
        if (insertError?.code === '23505') {
            return apiError(400, 'BAD_REQUEST', 'This file has already been added.')
        }
        await bucket.remove([storagePath])
        console.error('Document row insert failed:', insertError?.message)
        return apiError(500, 'INTERNAL', 'The document could not be saved. Please try again.')
    }

    // Respond immediately; the client polls the document status while this runs.
    // Ingestion checks the content itself (a real PDF, extractable text).
    after(() => ingestDocument(supabase, document.id))

    return NextResponse.json({ document_id: document.id }, { status: 201 })
})
