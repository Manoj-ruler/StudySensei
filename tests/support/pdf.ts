/**
 * Builds a minimal, valid PDF with one text block per page, so extraction
 * tests need no binary fixture. Parentheses and backslashes are not supported
 * in the lines.
 */
export function makePdf(pages: string[][]): Uint8Array {
    const objects: string[] = []
    const fontId = 3 + pages.length * 2
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`
    pages.forEach((lines, i) => {
        const content = `BT /F1 11 Tf 50 760 Td 14 TL\n${lines.map((line) => `(${line}) Tj T*`).join('\n')}\nET`
        objects[3 + i * 2] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R ` +
            `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
        objects[4 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    })
    objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

    let body = '%PDF-1.4\n'
    const offsets: number[] = []
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = body.length
        body += `${id} 0 obj\n${objects[id]}\nendobj\n`
    }
    const xref = body.length
    body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
    body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    return new TextEncoder().encode(body)
}
