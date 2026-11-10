// Server-only PDF text extraction. Imported from route handlers only.
//
// Uses the pdfjs-dist legacy Node build. Falls back to the legacy .js entry if
// the .mjs path is unavailable at runtime. No other dependencies.

type PdfTextItem = {
  str?: string
  transform?: number[]
}

type PdfTextContent = {
  items: unknown[]
}

type PdfPage = {
  getTextContent: () => Promise<PdfTextContent>
}

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
}

type PdfLoadOptions = {
  data: Uint8Array
  useWorkerFetch: boolean
  isEvalSupported: boolean
  disableFontFace: boolean
}

type PdfModule = {
  getDocument: (src: PdfLoadOptions) => { promise: Promise<PdfDocument> }
}

type PdfModuleWithDefault = PdfModule & { default?: PdfModule }

async function loadPdfjs(): Promise<PdfModule> {
  try {
    const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModuleWithDefault
    return mod.default ?? mod
  } catch {
    // The .js entry has no ambient types; a variable specifier keeps the
    // fallback out of static type resolution.
    const fallbackSpecifier = 'pdfjs-dist/legacy/build/pdf.js'
    const mod = (await import(fallbackSpecifier)) as unknown as PdfModuleWithDefault
    return mod.default ?? mod
  }
}

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(buffer)
  const doc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise

  let text = ''
  let lastY: number | null = null

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!isTextItem(item) || typeof item.str !== 'string') continue
      const y = Array.isArray(item.transform) ? item.transform[5] : null
      if (lastY !== null && y !== null && y !== lastY) text += '\n'
      text += item.str
      lastY = y
    }
  }

  return { text, pages: doc.numPages }
}


