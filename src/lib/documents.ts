export interface SkillDocument {
    id: string
    filename: string
    status: string | null
    processed: boolean | null
    error_message?: string | null
    created_at: string
}

/** File types the upload inputs accept. Keep in sync with server-side validation. */
export const DOCUMENT_ACCEPT = '.pdf,.txt,.md'

/** Storage bucket holding uploaded files at {user_id}/{skill_id}/{file}. */
export const DOCUMENTS_BUCKET = 'documents'

/** Also enforced by the bucket itself (file_size_limit). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export type DocumentKind = 'pdf' | 'text'

const EXTENSION_KIND: Record<string, DocumentKind> = { pdf: 'pdf', txt: 'text', md: 'text' }

/** Supported document type for a file name, or null. */
export function documentKind(filename: string): DocumentKind | null {
    const extension = filename.split('.').pop()?.toLowerCase() ?? ''
    return EXTENSION_KIND[extension] ?? null
}

/** Content type stored with the file; must be one the bucket allows. */
export const DOCUMENT_CONTENT_TYPE: Record<DocumentKind, string> = {
    pdf: 'application/pdf',
    text: 'text/plain',
}

/** Keeps the original name recognisable while removing anything unsafe in a storage key. */
export function safeFilename(name: string): string {
    const cleaned = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim()
    return (cleaned || 'document').slice(-120)
}

/** Where a new upload is stored. The first two segments are what storage policies check. */
export function newStoragePath(userId: string, skillId: string, filename: string): string {
    return `${userId}/${skillId}/${crypto.randomUUID()}-${safeFilename(filename)}`
}

export type DocumentState = 'ready' | 'processing' | 'pending' | 'failed'

/** True while the server is still working on the document, so the list should keep polling. */
export function isDocumentInProgress(doc: Pick<SkillDocument, 'status' | 'processed'>): boolean {
    return documentState(doc) === 'processing'
}

/**
 * Maps the stored status to what the UI shows. 'pending' means the file is
 * stored but has not been processed (documents uploaded before the pipeline existed).
 */
export function documentState(doc: Pick<SkillDocument, 'status' | 'processed'>): DocumentState {
    if (doc.status === 'ready') return 'ready'
    if (doc.status === 'processing') return 'processing'
    if (doc.status === 'failed') return 'failed'
    return 'pending'
}
