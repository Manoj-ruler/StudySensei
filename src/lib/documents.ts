export interface SkillDocument {
    id: string
    filename: string
    status: string | null
    processed: boolean | null
    created_at: string
}

/** File types the upload inputs accept. Keep in sync with server-side validation. */
export const DOCUMENT_ACCEPT = '.pdf,.txt,.md'

export type DocumentState = 'ready' | 'processing' | 'pending'

/**
 * Existing rows use both 'ready' and 'processed' for finished documents, plus a
 * separate boolean. Treat any of them as ready until the schema is unified.
 */
export function documentState(doc: Pick<SkillDocument, 'status' | 'processed'>): DocumentState {
    if (doc.processed || doc.status === 'ready' || doc.status === 'processed') return 'ready'
    if (doc.status === 'processing') return 'processing'
    return 'pending'
}
