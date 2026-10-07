import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { ExtractedPage } from './extract'

export interface Chunk {
    /** Position within the whole document, starting at 0. */
    index: number
    pageNumber: number | null
    content: string
}

export interface ChunkOptions {
    chunkSize: number
    chunkOverlap: number
}

/** Fragments shorter than this carry no retrievable meaning (page numbers, stray headers). */
const MIN_CHUNK_CHARACTERS = 30

/**
 * Splits each page on paragraph, line and sentence boundaries where possible.
 * Pages are split separately so every chunk maps to exactly one page, which
 * is what lets answers cite a page number.
 */
export async function chunkPages(pages: ExtractedPage[], options: ChunkOptions): Promise<Chunk[]> {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''],
    })

    const chunks: Chunk[] = []
    for (const page of pages) {
        for (const piece of await splitter.splitText(page.text)) {
            const content = piece.trim()
            if (content.length < MIN_CHUNK_CHARACTERS) continue
            chunks.push({ index: chunks.length, pageNumber: page.pageNumber, content })
        }
    }

    // A very short document may consist only of fragments below the minimum.
    if (chunks.length === 0) {
        const whole = pages.map((page) => page.text).join('\n\n').trim()
        if (whole) chunks.push({ index: 0, pageNumber: pages[0]?.pageNumber ?? null, content: whole })
    }

    return chunks
}
