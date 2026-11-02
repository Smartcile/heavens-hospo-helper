import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  discoverPdfFields,
  fillGiftCardTemplate,
  fillFormFields,
  formatGiftCardValue,
  mergePdfBuffers,
  proposeFieldMapping,
  GiftCardTemplateValues,
} from '@/lib/gift-card-template'

async function makeTemplate(fields: { name: string; maxLen?: number }[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 200])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const form = doc.getForm()
  for (const f of fields) {
    const field = form.createTextField(f.name)
    if (f.maxLen) field.setMaxLength(f.maxLen)
    field.addToPage(page, { x: 50, y: 50, width: 200, height: 30, font })
  }
  return Buffer.from(await doc.save())
}

async function makePlainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 200])
  page.drawText('NO FORM HERE', { x: 50, y: 100, font: await doc.embedFont(StandardFonts.Helvetica), size: 14, color: rgb(0, 0, 0) })
  return Buffer.from(await doc.save())
}

function makeEncryptedPdf(): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << >> >>',
    '<< /Filter /Standard /V 2 /R 3 /Length 128 >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets.slice(1)) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 4 0 R >>\n`
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'utf8')
}

async function load(buffer: Buffer): Promise<PDFDocument> {
  return PDFDocument.load(Uint8Array.from(buffer))
}

const VALUES: GiftCardTemplateValues = {
  number: '20260001',
  amount: 50,
  customerName: 'SAM SMITH',
  issueDate: '02/10/2026',
  message: 'Enjoy!',
}

describe('discoverPdfFields', () => {
  it('returns names + types of AcroForm fields', async () => {
    const buffer = await makeTemplate([{ name: 'Voucher Number' }, { name: 'Date of Issue' }])
    const fields = await discoverPdfFields(buffer)
    expect(fields).toEqual([
      { name: 'Voucher Number', type: 'text' },
      { name: 'Date of Issue', type: 'text' },
    ])
  })

  it('returns [] for a PDF with no form', async () => {
    expect(await discoverPdfFields(await makePlainPdf())).toEqual([])
  })

  it('throws a friendly error for encrypted PDFs', async () => {
    await expect(discoverPdfFields(makeEncryptedPdf())).rejects.toThrow('password-protected')
  })
})

describe('proposeFieldMapping', () => {
  it('maps the sample card fields by name', () => {
    const mapping = proposeFieldMapping([
      { name: 'Value', type: 'text' },
      { name: 'Voucher Number', type: 'text' },
      { name: 'Date of Issue', type: 'text' },
    ])
    expect(mapping).toEqual([
      { pdfField: 'Value', dataKey: 'amount', format: '2dp' },
      { pdfField: 'Voucher Number', dataKey: 'number', format: undefined },
      { pdfField: 'Date of Issue', dataKey: 'issueDate', format: undefined },
    ])
  })

  it('leaves unknown fields blank', () => {
    const mapping = proposeFieldMapping([{ name: 'Some Custom Box', type: 'text' }])
    expect(mapping).toEqual([{ pdfField: 'Some Custom Box', dataKey: '', format: undefined }])
  })
})

describe('formatGiftCardValue', () => {
  it('formats amount with 2dp by default', () => {
    expect(formatGiftCardValue('amount', { ...VALUES, amount: 50 }, '2dp')).toBe('$50.00')
    expect(formatGiftCardValue('amount', { ...VALUES, amount: 12.5 }, '2dp')).toBe('$12.50')
  })

  it('formats amount without decimals on request', () => {
    expect(formatGiftCardValue('amount', { ...VALUES, amount: 50 }, '0dp')).toBe('$50')
  })

  it('passes through the other keys', () => {
    expect(formatGiftCardValue('number', VALUES)).toBe('20260001')
    expect(formatGiftCardValue('issueDate', VALUES)).toBe('02/10/2026')
    expect(formatGiftCardValue('customerName', VALUES)).toBe('SAM SMITH')
    expect(formatGiftCardValue('message', VALUES)).toBe('Enjoy!')
  })

  it('renders null name/message as empty', () => {
    expect(formatGiftCardValue('customerName', { ...VALUES, customerName: null })).toBe('')
    expect(formatGiftCardValue('message', { ...VALUES, message: null })).toBe('')
  })
})

describe('fillFormFields', () => {
  it('fills mapped fields, leaves unmapped blank', async () => {
    const doc = await load(await makeTemplate([{ name: 'Value' }, { name: 'Voucher Number' }, { name: 'Date of Issue' }, { name: 'Unmapped' }]))
    fillFormFields(doc, proposeFieldMapping([
      { name: 'Value', type: 'text' },
      { name: 'Voucher Number', type: 'text' },
      { name: 'Date of Issue', type: 'text' },
      { name: 'Unmapped', type: 'text' },
    ]), VALUES)

    const form = doc.getForm()
    expect(form.getTextField('Value').getText()).toBe('$50.00')
    expect(form.getTextField('Voucher Number').getText()).toBe('20260001')
    expect(form.getTextField('Date of Issue').getText()).toBe('02/10/2026')
    expect(form.getTextField('Unmapped').getText()).toBeUndefined()
  })

  it('truncates to the field MaxLen', async () => {
    const doc = await load(await makeTemplate([{ name: 'Voucher Number', maxLen: 8 }, { name: 'Date of Issue', maxLen: 10 }]))
    fillFormFields(doc, [
      { pdfField: 'Voucher Number', dataKey: 'number' },
      { pdfField: 'Date of Issue', dataKey: 'issueDate' },
    ], { ...VALUES, number: '202600011234', issueDate: '02/10/20261234' })

    const form = doc.getForm()
    expect(form.getTextField('Voucher Number').getText()).toBe('20260001')
    expect(form.getTextField('Date of Issue').getText()).toBe('02/10/2026')
  })

  it('throws on an unknown field name', async () => {
    const doc = await load(await makeTemplate([{ name: 'Value' }]))
    expect(() => fillFormFields(doc, [{ pdfField: 'Does Not Exist', dataKey: 'amount' }], VALUES)).toThrow(
      'Unknown form field "Does Not Exist"',
    )
  })

  it('throws when the PDF has no form', async () => {
    const doc = await load(await makePlainPdf())
    expect(() => fillFormFields(doc, [], VALUES)).toThrow('no fillable form')
  })
})

describe('fillGiftCardTemplate', () => {
  it('returns a flattened PDF (fields no longer interactive)', async () => {
    const buffer = await makeTemplate([{ name: 'Value' }])
    const out = await fillGiftCardTemplate(buffer, [{ pdfField: 'Value', dataKey: 'amount' }], VALUES)

    const doc = await load(out)
    expect(doc.getPageCount()).toBe(1)
    expect(() => doc.getForm().getField('Value')).toThrow()
  })

  it('throws a friendly error for encrypted PDFs', async () => {
    await expect(fillGiftCardTemplate(makeEncryptedPdf(), [], VALUES)).rejects.toThrow('password-protected')
  })
})

describe('mergePdfBuffers', () => {
  it('combines several card PDFs into one multi-page document', async () => {
    const one = await makeTemplate([{ name: 'Value' }])
    const two = await makeTemplate([{ name: 'Voucher Number' }])
    const merged = await mergePdfBuffers([one, two, one])
    const doc = await load(merged)
    expect(doc.getPageCount()).toBe(3)
  })
})
