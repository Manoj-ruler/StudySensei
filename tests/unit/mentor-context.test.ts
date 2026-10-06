import { Document } from '@langchain/core/documents'
import { describe, expect, it } from 'vitest'
import { buildContext, citedIndexes, citedSources, NO_EXCERPTS_NOTE } from '@/server/mentor/context'
import type { ChunkMetadata } from '@/server/rag/retriever'

const chunk = (content: string, overrides: Partial<ChunkMetadata> = {}) =>
    new Document<ChunkMetadata>({
        pageContent: content,
        metadata: {
            chunkId: 'c1',
            documentId: 'd1',
            filename: 'notes.pdf',
            chunkIndex: 0,
            pageNumber: 3,
            similarity: 0.8123456,
            ...overrides,
        },
    })

describe('buildContext', () => {
    it('numbers excerpts and labels them with file and page', () => {
        const { context, sources } = buildContext([
            chunk('Modules group providers.'),
            chunk('Plain text note.', { chunkId: 'c2', filename: 'todo.txt', pageNumber: null }),
        ])
        expect(context).toBe('[1] (notes.pdf, page 3)\nModules group providers.\n\n[2] (todo.txt)\nPlain text note.')
        expect(sources).toEqual([
            { index: 1, chunk_id: 'c1', document_id: 'd1', filename: 'notes.pdf', page_number: 3, similarity: 0.8123 },
            { index: 2, chunk_id: 'c2', document_id: 'd1', filename: 'todo.txt', page_number: null, similarity: 0.8123 },
        ])
    })

    it('says so when nothing was retrieved', () => {
        expect(buildContext([])).toEqual({ context: NO_EXCERPTS_NOTE, sources: [] })
    })

    it('warns the model when every excerpt is only a weak match', () => {
        const { context } = buildContext([chunk('Loosely related.', { similarity: 0.52 })])
        expect(context).toMatch(/only loosely related/)
        expect(context).toContain('[1] (notes.pdf, page 3)')
    })

    it('gives no warning when at least one excerpt is a strong match', () => {
        const { context } = buildContext([chunk('Strong.', { similarity: 0.8 }), chunk('Weak.', { similarity: 0.52 })])
        expect(context).not.toMatch(/loosely related/)
    })
})

describe('citations', () => {
    it('finds single, adjacent and grouped citations', () => {
        expect([...citedIndexes('Nest uses modules [1]. Providers are injected [2][3], see also [4, 6].')].sort()).toEqual([1, 2, 3, 4, 6])
    })

    it('ignores brackets that are not citations', () => {
        expect(citedIndexes('Use arr[i] and a [link](http://x) or [see note].').size).toBe(0)
    })

    it('keeps only the sources the answer actually cites', () => {
        const { sources } = buildContext([chunk('a'), chunk('b', { chunkId: 'c2' }), chunk('c', { chunkId: 'c3' })])
        expect(citedSources('First point [1]. Third point [3].', sources).map((source) => source.index)).toEqual([1, 3])
        expect(citedSources('An answer from general knowledge.', sources)).toEqual([])
    })

    it('ignores citation numbers that do not exist', () => {
        const { sources } = buildContext([chunk('a')])
        expect(citedSources('Claim [1] and an invented one [7].', sources).map((source) => source.index)).toEqual([1])
    })
})
