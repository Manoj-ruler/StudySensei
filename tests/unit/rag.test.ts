import { describe, expect, it } from 'vitest'
import { chunkPages } from '@/server/rag/chunk'
import {
    cleanText,
    DocumentProcessingError,
    documentKind,
    extractDocument,
    looksLikePdf,
    looksTextMangled,
} from '@/server/rag/extract'
import { makePdf } from '../support/pdf'

const bytes = (text: string) => new TextEncoder().encode(text)
const repeat = (line: string, times: number) => Array.from({ length: times }, () => line)

describe('file type detection', () => {
    it('recognises supported extensions case-insensitively', () => {
        expect(documentKind('Notes.PDF')).toBe('pdf')
        expect(documentKind('readme.md')).toBe('text')
        expect(documentKind('a.b.txt')).toBe('text')
    })

    it('rejects everything else', () => {
        expect(documentKind('report.docx')).toBeNull()
        expect(documentKind('no-extension')).toBeNull()
        expect(documentKind('archive.pdf.exe')).toBeNull()
    })

    it('checks the PDF signature rather than trusting the name', () => {
        expect(looksLikePdf(makePdf([['hello']]))).toBe(true)
        expect(looksLikePdf(bytes('just text'))).toBe(false)
    })
})

describe('cleanText', () => {
    it('removes NUL characters, which Postgres text cannot store', () => {
        expect(cleanText('a\u0000b')).toBe('ab')
    })

    it('collapses ragged whitespace but keeps paragraph breaks', () => {
        expect(cleanText('one  \t two\r\n\r\n\r\n\r\nthree ')).toBe('one two\n\nthree')
    })
})

describe('looksTextMangled', () => {
    it('detects a binary file that was saved through a text encoding', () => {
        // Every non-UTF-8 byte became the replacement character EF BF BD.
        const mangled = new Uint8Array(3 * 500)
        for (let i = 0; i < mangled.length; i += 3) mangled.set([0xef, 0xbf, 0xbd], i)
        expect(looksTextMangled(mangled)).toBe(true)
    })

    it('does not flag ordinary binary or text content', () => {
        expect(looksTextMangled(makePdf([['hello']]))).toBe(false)
        expect(looksTextMangled(Uint8Array.from({ length: 4000 }, (_, i) => (i * 37) % 256))).toBe(false)
        expect(looksTextMangled(bytes('plain text with one odd char �'))).toBe(false)
    })
})

describe('extractDocument', () => {
    it('extracts text per page from a PDF', async () => {
        const doc = await extractDocument(makePdf([['Chapter one: recursion'], ['Chapter two: hash tables']]), 'pdf')
        expect(doc.pageCount).toBe(2)
        expect(doc.pages.map((page) => page.pageNumber)).toEqual([1, 2])
        expect(doc.pages[0].text).toContain('recursion')
        expect(doc.pages[1].text).toContain('hash tables')
    })

    it('returns one unpaged block for a text file', async () => {
        const doc = await extractDocument(bytes('# Title\n\nSome notes.'), 'text')
        expect(doc).toEqual({ pages: [{ pageNumber: null, text: '# Title\n\nSome notes.' }], pageCount: null })
    })

    it('returns no pages for a file with only whitespace', async () => {
        expect((await extractDocument(bytes('  \n '), 'text')).pages).toEqual([])
    })

    it('fails with a safe message on a file that is not really a PDF', async () => {
        await expect(extractDocument(bytes('not a pdf'), 'pdf')).rejects.toThrow(DocumentProcessingError)
        await expect(extractDocument(bytes('%PDF-1.4 truncated nonsense'), 'pdf')).rejects.toThrow(/could not be read/i)
    })
})

describe('chunkPages', () => {
    const page = (pageNumber: number | null, text: string) => ({ pageNumber, text })

    it('keeps chunks within the size limit and numbers them in order', async () => {
        const text = repeat('A recursive function calls itself until it reaches a base case.', 30).join(' ')
        const chunks = await chunkPages([page(1, text)], { chunkSize: 300, chunkOverlap: 50 })
        expect(chunks.length).toBeGreaterThan(4)
        expect(chunks.every((chunk) => chunk.content.length <= 300)).toBe(true)
        expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, i) => i))
    })

    it('never mixes two pages in one chunk', async () => {
        const chunks = await chunkPages(
            [page(1, repeat('Recursion needs a base case.', 12).join(' ')), page(2, repeat('Hash tables resolve collisions.', 12).join(' '))],
            { chunkSize: 200, chunkOverlap: 30 }
        )
        expect(chunks.filter((chunk) => chunk.pageNumber === 1).every((chunk) => !/Hash/.test(chunk.content))).toBe(true)
        expect(chunks.filter((chunk) => chunk.pageNumber === 2).every((chunk) => !/Recursion/.test(chunk.content))).toBe(true)
    })

    it('overlaps consecutive chunks so a sentence at a boundary is not lost', async () => {
        const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
        const chunks = await chunkPages([page(null, words)], { chunkSize: 200, chunkOverlap: 60 })
        const lastWordOfFirst = chunks[0].content.split(' ').pop()!
        expect(chunks[1].content).toContain(lastWordOfFirst)
    })

    it('drops fragments too short to mean anything', async () => {
        const chunks = await chunkPages([page(1, 'A full paragraph that is clearly long enough to keep.'), page(2, '7')], {
            chunkSize: 1000,
            chunkOverlap: 150,
        })
        expect(chunks).toHaveLength(1)
        expect(chunks[0].pageNumber).toBe(1)
    })

    it('still returns one chunk for a very short document', async () => {
        const chunks = await chunkPages([page(null, 'Short note.')], { chunkSize: 1000, chunkOverlap: 150 })
        expect(chunks).toEqual([{ index: 0, pageNumber: null, content: 'Short note.' }])
    })

    it('returns nothing for no pages', async () => {
        expect(await chunkPages([], { chunkSize: 1000, chunkOverlap: 150 })).toEqual([])
    })
})
