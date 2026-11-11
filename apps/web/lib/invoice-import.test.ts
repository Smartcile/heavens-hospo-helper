import { describe, expect, it } from 'vitest'
import {
  buildInvoiceLearnPrompt,
  parseInvoiceText,
  validateTemplateConfig,
  type InvoiceTemplateConfig,
} from './invoice-import'

const sample = [
  'ACME FOODS LTD',
  'INVOICE NO: INV-1001',
  'INVOICE DATE: 15/08/2026',
  'DUE DATE: 14/09/2026',
  'SUBTOTAL: $100.00',
  'GST: $15.00',
  'AMOUNT DUE: $115.00',
  'DESCRIPTION  SKU  QTY  UNIT PRICE  LINE TOTAL',
  'FLOUR - 00  F001  10  2.50  25.00',
  'SUGAR  S002  5  3.00  15.00',
  'SPICE  P003  2  12,50  25.00',
  'TRAILER  X  1  n/a  0.00',
  'SHORT  X',
  'PAGE 1',
].join('\n')

const config: InvoiceTemplateConfig = {
  header: {
    invoiceNumber: ['INVOICE NO'],
    invoiceDate: ['INVOICE DATE'],
    dueDate: ['DUE DATE'],
    subtotal: ['SUBTOTAL'],
    gst: ['GST:'],
    total: ['AMOUNT DUE'],
  },
  lineRegion: { start: 'DESCRIPTION', end: 'PAGE' },
  columns: { description: 0, sku: 1, qty: 2, unitPrice: 3, lineTotal: 4 },
  dateFormat: 'DMY',
  ignorePatterns: ['PAGE'],
}

describe('validateTemplateConfig', () => {
  it('accepts a complete config', () => {
    expect(validateTemplateConfig(config)).toEqual([])
  })

  it('reports missing / invalid columns', () => {
    const errors = validateTemplateConfig({
      header: {},
      columns: { description: -1, qty: 1.5, unitPrice: 2, lineTotal: 3 },
    })
    expect(errors).toContain('columns.description must be a non-negative integer')
    expect(errors).toContain('columns.qty must be a non-negative integer')
  })

  it('reports an invalid date format', () => {
    const errors = validateTemplateConfig({
      header: {},
      columns: { description: 0, qty: 1, unitPrice: 2, lineTotal: 3 },
      dateFormat: 'YMD' as never,
    })
    expect(errors).toContain('dateFormat must be one of DMY, MDY, ISO')
  })
})

describe('parseInvoiceText', () => {
  it('parses the header anchors', () => {
    const result = parseInvoiceText(sample, config)
    expect(result.header).toEqual({
      invoiceNumber: 'INV-1001',
      invoiceDate: '2026-08-15',
      dueDate: '2026-09-14',
      subtotal: 100,
      gst: 15,
      total: 115,
    })
  })

  it('parses the line region and columns', () => {
    const result = parseInvoiceText(sample, config)
    expect(result.lines).toEqual([
      { description: 'FLOUR - 00', supplierSku: 'F001', qty: 10, unitPrice: 2.5, lineTotal: 25 },
      { description: 'SUGAR', supplierSku: 'S002', qty: 5, unitPrice: 3, lineTotal: 15 },
      { description: 'SPICE', supplierSku: 'P003', qty: 2, unitPrice: 12.5, lineTotal: 25 },
    ])
  })

  it('records skipped rows in issues', () => {
    const result = parseInvoiceText(sample, config)
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]).toContain('could not parse numbers')
    expect(result.issues[1]).toContain('not enough columns')
  })

  it('honours an MDY date format', () => {
    const result = parseInvoiceText('INVOICE DATE: 08/15/2026', {
      header: { invoiceDate: ['INVOICE DATE'] },
      columns: { description: 0, qty: 1, unitPrice: 2, lineTotal: 3 },
      dateFormat: 'MDY',
    })
    expect(result.header.invoiceDate).toBe('2026-08-15')
  })

  it('starts at the beginning when no start anchor is found', () => {
    const result = parseInvoiceText('FLOUR  1  2.00  2.00', {
      header: {},
      columns: { description: 0, qty: 1, unitPrice: 2, lineTotal: 3 },
    })
    expect(result.lines).toHaveLength(1)
  })
})

describe('buildInvoiceLearnPrompt', () => {
  it('includes the supplier, the sample text and the JSON-only instruction', () => {
    const prompt = buildInvoiceLearnPrompt('ACME FOODS', 'INVOICE NO: 1')
    expect(prompt).toContain('ACME FOODS')
    expect(prompt).toContain('INVOICE NO: 1')
    expect(prompt).toContain('ONLY')
    expect(prompt).toContain('"columns"')
  })
})
