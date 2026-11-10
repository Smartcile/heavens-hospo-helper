import { describe, expect, it, vi } from 'vitest'

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument, default: { getDocument } }))

import { extractPdfText } from './pdf-text.server'

function makeDoc() {
  const pages = [
    {
      getTextContent: async () => ({
        items: [
          { str: 'HELLO', transform: [1, 0, 0, 1, 0, 10] },
          { str: ' WORLD', transform: [1, 0, 0, 1, 30, 10] },
          { str: 'SECOND LINE', transform: [1, 0, 0, 1, 0, 5] },
        ],
      }),
    },
    {
      getTextContent: async () => ({
        items: [{ str: 'PAGE TWO', transform: [1, 0, 0, 1, 0, 10] }],
      }),
    },
  ]
  return {
    numPages: pages.length,
    getPage: async (pageNumber: number) => pages[pageNumber - 1],
  }
}

describe('extractPdfText', () => {
  it('concatenates text and inserts a newline when the y position changes', async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(makeDoc()) })

    const result = await extractPdfText(Buffer.from('fake-pdf'))

    expect(result.pages).toBe(2)
    expect(result.text).toBe('HELLO WORLD\nSECOND LINE\nPAGE TWO')
  })

  it('passes the safe Node load options', async () => {
    getDocument.mockClear()
    getDocument.mockReturnValue({ promise: Promise.resolve(makeDoc()) })

    await extractPdfText(Buffer.from('abc'))

    expect(getDocument).toHaveBeenCalledTimes(1)
    const args = getDocument.mock.calls[0][0]
    expect(args.useWorkerFetch).toBe(false)
    expect(args.isEvalSupported).toBe(false)
    expect(args.disableFontFace).toBe(true)
    expect(args.data).toBeInstanceOf(Uint8Array)
  })
})
