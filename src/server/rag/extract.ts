import { extractText, getDocumentProxy } from 'unpdf'

export type DocumentKind = 'pdf' | 'text'

export interface ExtractedPage {
    /** 1-based page number; null for formats without pages. */
    pageNumber: number | null
    text: string
}

export interface ExtractedDocument {
    pages: ExtractedPage[]
    pageCount: number | null
}

/** Error whose message is safe to store on the document and show to its owner. */
export class DocumentProcessingError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'DocumentProcessingError'
    }
}

const EXTENSION_KIND: Record<string, DocumentKind> = {
    pdf: 'pdf',
    txt: 'text',
    md: 'text',
}

export function documentKind(filename: string): DocumentKind | null {
    const extension = filename.split('.').pop()?.toLowerCase() ?? ''
    return EXTENSION_KIND[extension] ?? null
}

/** PDF files start with "%PDF"; checked so a renamed file is rejected early. */
export function looksLikePdf(bytes: Uint8Array): boolean {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

/**
 * Detects a binary file that was once saved through a text encoding: every
 * byte that was not valid UTF-8 became the replacement character (EF BF BD),
 * which destroys compressed PDF streams. Such a file cannot be recovered.
 */
export function looksTextMangled(bytes: Uint8Array): boolean {
    let replacements = 0
    let highBytes = 0
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] < 0x80) continue
        highBytes++
        if (bytes[i] === 0xef && bytes[i + 1] === 0xbf && bytes[i + 2] === 0xbd) replacements++
    }
    return replacements > 100 && replacements * 3 > highBytes * 0.5
}

/**
 * Normalises extracted text: Postgres text cannot hold NUL characters, and
 * PDF extraction leaves ragged whitespace that wastes chunk space.
 */
export function cleanText(text: string): string {
    return text
        .replace(/\u0000/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export async function extractDocument(
    bytes: Uint8Array,
    kind: DocumentKind
): Promise<ExtractedDocument> {
    if (kind === 'text') {
        const text = cleanText(new TextDecoder('utf-8').decode(bytes))
        return { pages: text ? [{ pageNumber: null, text }] : [], pageCount: null }
    }

    if (!looksLikePdf(bytes)) {
        throw new DocumentProcessingError('This file is not a valid PDF.')
    }

    // Checked up front: the PDF parser takes ownership of the byte buffer.
    const mangled = looksTextMangled(bytes)

    let pagesText: string[]
    try {
        const pdf = await getDocumentProxy(bytes)
        const result = await extractText(pdf, { mergePages: false })
        pagesText = result.text
    } catch {
        if (mangled) {
            throw new DocumentProcessingError(
                'This file was damaged when it was stored and cannot be read. Please delete it and upload it again.'
            )
        }
        throw new DocumentProcessingError(
            'The PDF could not be read. It may be corrupted or password-protected.'
        )
    }

    const pages = pagesText
        .map((text, index) => ({ pageNumber: index + 1, text: cleanText(text) }))
        .filter((page) => page.text.length > 0)

    if (pages.length === 0 && mangled) {
        throw new DocumentProcessingError(
            'This file was damaged when it was stored and cannot be read. Please delete it and upload it again.'
        )
    }

    return { pages, pageCount: pagesText.length }
}
