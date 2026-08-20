import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFField,
} from 'pdf-lib'

export type GiftCardDataKey = 'number' | 'amount' | 'customerName' | 'issueDate' | 'message'

export const GIFT_CARD_DATA_KEYS: { key: GiftCardDataKey; label: string }[] = [
  { key: 'number', label: 'VOUCHER NUMBER' },
  { key: 'amount', label: 'VALUE / AMOUNT' },
  { key: 'customerName', label: 'CUSTOMER NAME' },
  { key: 'issueDate', label: 'DATE OF ISSUE' },
  { key: 'message', label: 'MESSAGE' },
]

export const GIFT_CARD_AMOUNT_FORMATS = [
  { value: '2dp', label: '$50.00' },
  { value: '0dp', label: '$50' },
] as const

export type GiftCardAmountFormat = (typeof GIFT_CARD_AMOUNT_FORMATS)[number]['value']

export interface GiftCardFieldMapping {
  pdfField: string
  dataKey: GiftCardDataKey | ''
  format?: GiftCardAmountFormat
}

export interface GiftCardPdfField {
  name: string
  type: string
}

export interface GiftCardTemplateValues {
  number: string
  amount: number
  customerName?: string | null
  issueDate: string
  message?: string | null
}

const NORMALISED_KEYS: Record<string, GiftCardDataKey> = {
  value: 'amount',
  amount: 'amount',
  vouchernumber: 'number',
  cardnumber: 'number',
  number: 'number',
  dateofissue: 'issueDate',
  issuedate: 'issueDate',
  date: 'issueDate',
  customername: 'customerName',
  name: 'customerName',
  message: 'message',
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Suggest a data key for each form field by name ('' = leave blank). */
export function proposeFieldMapping(fields: GiftCardPdfField[]): GiftCardFieldMapping[] {
  return fields.map((f) => {
    const key = NORMALISED_KEYS[normalise(f.name)] ?? ''
    return {
      pdfField: f.name,
      dataKey: key,
      format: key === 'amount' ? '2dp' : undefined,
    }
  })
}

/** Format one data value for printing into a PDF form field. */
export function formatGiftCardValue(
  key: GiftCardDataKey,
  values: GiftCardTemplateValues,
  format?: GiftCardAmountFormat,
): string {
  switch (key) {
    case 'amount':
      return format === '0dp' ? `$${Math.round(values.amount)}` : `$${values.amount.toFixed(2)}`
    case 'number':
      return values.number
    case 'customerName':
      return values.customerName ?? ''
    case 'issueDate':
      return values.issueDate
    case 'message':
      return values.message ?? ''
  }
}

/** Read the AcroForm field names + types out of a PDF template. */
export async function discoverPdfFields(buffer: Buffer): Promise<GiftCardPdfField[]> {
  const doc = await loadTemplate(buffer)
  if (!doc.catalog.getAcroForm()) return []
  return doc
    .getForm()
    .getFields()
    .map((f) => ({ name: f.getName(), type: fieldTypeName(f) }))
}

function fieldTypeName(field: PDFField): string {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFDropdown) return 'dropdown'
  if (field instanceof PDFOptionList) return 'option list'
  if (field instanceof PDFSignature) return 'signature'
  return 'button'
}

/**
 * Set mapped text field values on an already-loaded document (no flatten).
 * Exported for testability — production code calls fillGiftCardTemplate.
 */
export function fillFormFields(doc: PDFDocument, mapping: GiftCardFieldMapping[], values: GiftCardTemplateValues): void {
  if (!doc.catalog.getAcroForm()) throw new Error('PDF has no fillable form fields')
  const form = doc.getForm()

  for (const m of mapping) {
    if (!m.dataKey) continue
    let field: ReturnType<ReturnType<PDFDocument['getForm']>['getField']>
    try {
      field = form.getField(m.pdfField)
    } catch (err) {
      throw new Error(`Unknown form field "${m.pdfField}"`)
    }
    if (!(field instanceof PDFTextField)) continue

    const value = formatGiftCardValue(m.dataKey, values, m.format)
    const maxLen = field.getMaxLength()
    const text = maxLen !== undefined ? value.slice(0, maxLen) : value
    field.setText(text)
  }
}

/**
 * Fill a template PDF's form fields from the mapping, flatten the form so the
 * values are baked in (safe to print), and return the finished PDF bytes.
 */
export async function fillGiftCardTemplate(
  buffer: Buffer,
  mapping: GiftCardFieldMapping[],
  values: GiftCardTemplateValues,
): Promise<Buffer> {
  const doc = await loadTemplate(buffer)
  fillFormFields(doc, mapping, values)
  doc.getForm().flatten()
  return Buffer.from(await doc.save())
}

/** Combine several filled card PDFs into one multi-page document for printing. */
export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (const buffer of buffers) {
    const src = await PDFDocument.load(Uint8Array.from(buffer))
    const pages = await doc.copyPages(src, src.getPageIndices())
    for (const page of pages) doc.addPage(page)
  }
  return Buffer.from(await doc.save())
}

async function loadTemplate(buffer: Buffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(Uint8Array.from(buffer))
  } catch (err) {
    throw new Error('Could not read PDF — is it password-protected?')
  }
}
