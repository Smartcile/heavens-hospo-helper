// Pure supplier-invoice-template helpers. No Prisma imports, no crypto imports.

import type { InvoiceDateFormat, InvoiceTemplateConfig } from './invoice-import'

const DATE_FORMATS: InvoiceDateFormat[] = ['DMY', 'MDY', 'ISO']

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  return entries.length ? entries.map((entry) => entry.trim()) : undefined
}

function asColumn(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(numeric) || numeric < 0) return fallback
  return numeric
}

export function normaliseTemplateConfig(input: unknown): InvoiceTemplateConfig {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const rawHeader = (source.header && typeof source.header === 'object'
    ? source.header
    : {}) as Record<string, unknown>
  const rawColumns = (source.columns && typeof source.columns === 'object'
    ? source.columns
    : {}) as Record<string, unknown>
  const rawRegion = (source.lineRegion && typeof source.lineRegion === 'object'
    ? source.lineRegion
    : {}) as Record<string, unknown>

  const header: InvoiceTemplateConfig['header'] = {}
  const invoiceNumber = asStringArray(rawHeader.invoiceNumber)
  if (invoiceNumber) header.invoiceNumber = invoiceNumber
  const invoiceDate = asStringArray(rawHeader.invoiceDate)
  if (invoiceDate) header.invoiceDate = invoiceDate
  const dueDate = asStringArray(rawHeader.dueDate)
  if (dueDate) header.dueDate = dueDate
  const subtotal = asStringArray(rawHeader.subtotal)
  if (subtotal) header.subtotal = subtotal
  const gst = asStringArray(rawHeader.gst)
  if (gst) header.gst = gst
  const total = asStringArray(rawHeader.total)
  if (total) header.total = total

  const columns: InvoiceTemplateConfig['columns'] = {
    description: asColumn(rawColumns.description, 0),
    qty: asColumn(rawColumns.qty, 1),
    unitPrice: asColumn(rawColumns.unitPrice, 2),
    lineTotal: asColumn(rawColumns.lineTotal, 3),
  }
  if (rawColumns.sku !== undefined) {
    const sku = Number(rawColumns.sku)
    if (Number.isInteger(sku) && sku >= 0) columns.sku = sku
  }

  const config: InvoiceTemplateConfig = { header, columns }

  const start = typeof rawRegion.start === 'string' ? rawRegion.start.trim() : undefined
  const end = typeof rawRegion.end === 'string' ? rawRegion.end.trim() : undefined
  if (start || end) {
    config.lineRegion = {}
    if (start) config.lineRegion.start = start
    if (end) config.lineRegion.end = end
  }

  const dateFormat = source.dateFormat
  if (typeof dateFormat === 'string' && DATE_FORMATS.includes(dateFormat as InvoiceDateFormat)) {
    config.dateFormat = dateFormat as InvoiceDateFormat
  }

  const ignorePatterns = asStringArray(source.ignorePatterns)
  if (ignorePatterns) config.ignorePatterns = ignorePatterns

  return config
}

export function templateFingerprint(sampleText: string): string {
  const trimmed = String(sampleText ?? '')
    .trim()
    .toLowerCase()
  const head = trimmed.slice(0, 40)
  const tail = trimmed.slice(-40)
  let checksum = 0
  for (let i = 0; i < trimmed.length; i++) {
    checksum = (checksum * 31 + trimmed.charCodeAt(i)) >>> 0
  }
  return `${trimmed.length}|${head}|${tail}|${checksum.toString(16)}`
}

export function nextTemplateVersion(existingVersions: number[]): number {
  let max = 0
  for (const value of existingVersions) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > max) max = numeric
  }
  return Math.floor(max) + 1
}

export function describeTemplateStatus(status: string): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'ACTIVE — used for offline invoice import'
    case 'DRAFT':
      return 'DRAFT — not used for import until activated'
    default:
      return `${String(status ?? '').toUpperCase() || 'UNKNOWN'} — unknown template status`
  }
}
