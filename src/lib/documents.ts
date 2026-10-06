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
