import type { Document } from '@langchain/core/documents'
import type { MessageSource } from '@/lib/api/types'
import type { ChunkMetadata } from '@/server/rag/retriever'
import { ragConfig } from '@/server/ai/config'

const WEAK_MATCH_NOTE =
    '(No excerpt matched this question closely. The following are only loosely related: use them if they genuinely help, and say so if they do not answer the question.)'

export const NO_EXCERPTS_NOTE = '(No relevant excerpts were found in the uploaded documents for this question.)'

/** Numbers the retrieved chunks and renders them for the prompt. */
export function buildContext(documents: Document<ChunkMetadata>[]): {
    context: string
    sources: MessageSource[]
} {
    if (documents.length === 0) return { context: NO_EXCERPTS_NOTE, sources: [] }

    const sources: MessageSource[] = documents.map((doc, position) => ({
        index: position + 1,
        chunk_id: doc.metadata.chunkId,
        document_id: doc.metadata.documentId,
        filename: doc.metadata.filename,
        page_number: doc.metadata.pageNumber,
        similarity: Number(doc.metadata.similarity.toFixed(4)),
    }))

    const weak = documents.every((doc) => doc.metadata.similarity < ragConfig.minSimilarity)

    const excerpts = documents
        .map((doc, position) => {
            const source = sources[position]
            const page = source.page_number ? `, page ${source.page_number}` : ''
            return `[${source.index}] (${source.filename}${page})\n${doc.pageContent}`
        })
        .join('\n\n')

    return { context: weak ? `${WEAK_MATCH_NOTE}\n\n${excerpts}` : excerpts, sources }
}

/** Source numbers the answer actually cites, e.g. "[1]" or "[2][3]" or "[1, 4]". */
export function citedIndexes(answer: string): Set<number> {
    const cited = new Set<number>()
    for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
        for (const part of match[1].split(',')) cited.add(Number(part.trim()))
    }
    return cited
}

/** Keeps only the sources the answer refers to, so the UI never lists unused excerpts. */
export function citedSources(answer: string, sources: MessageSource[]): MessageSource[] {
    const cited = citedIndexes(answer)
    return sources.filter((source) => cited.has(source.index))
}
