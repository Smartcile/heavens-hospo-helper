import { describe, expect, it } from 'vitest'
import {
  compareLineToPurchaseOrder,
  matchInvoiceLine,
  normaliseInvoiceText,
  type MatchContext,
} from './invoice-match'

const ctx = (overrides: Partial<MatchContext> = {}): MatchContext => ({
  bySku: new Map(),
  aliases: new Map(),
  items: [],
  ...overrides,
})

describe('normaliseInvoiceText', () => {
  it('uppercases and collapses punctuation and whitespace', () => {
    expect(normaliseInvoiceText('  flour - 00 (25kg) ')).toBe('FLOUR 00 25KG')
  })

  it('handles nullish input', () => {
    expect(normaliseInvoiceText(null)).toBe('')
  })
})

describe('matchInvoiceLine', () => {
  it('matches by SKU first', () => {
    const bySku = new Map([[normaliseInvoiceText('F-001'), 'item-1']])
    const result = matchInvoiceLine(
      { description: 'FLOUR', supplierSku: 'f-001' },
      ctx({ bySku }),
    )
    expect(result).toEqual({ inventoryItemId: 'item-1', status: 'MATCHED', reason: 'SKU' })
  })

  it('falls back to an alias', () => {
    const aliases = new Map([[normaliseInvoiceText('PLAIN FLOUR 25KG'), 'item-2']])
    const result = matchInvoiceLine({ description: 'plain flour 25kg' }, ctx({ aliases }))
    expect(result).toEqual({ inventoryItemId: 'item-2', status: 'MATCHED', reason: 'ALIAS' })
  })

  it('falls back to fuzzy matching', () => {
    const result = matchInvoiceLine(
      { description: 'FLOUR 00' },
      ctx({ items: [{ id: 'item-3', name: 'FLOUR - 00' }] }),
    )
    expect(result).toEqual({ inventoryItemId: 'item-3', status: 'MATCHED', reason: 'FUZZY' })
  })

  it('reports AMBIGUOUS when two candidates score the same', () => {
    const result = matchInvoiceLine(
      { description: 'FLOUR 00' },
      ctx({
        items: [
          { id: 'a', name: 'FLOUR 00' },
          { id: 'b', name: 'FLOUR 00' },
        ],
      }),
    )
    expect(result).toEqual({ status: 'AMBIGUOUS', reason: 'FUZZY' })
  })

  it('reports NEW when nothing is close', () => {
    const result = matchInvoiceLine(
      { description: 'WIDGET' },
      ctx({ items: [{ id: 'a', name: 'FLOUR - 00' }] }),
    )
    expect(result).toEqual({ status: 'NEW', reason: 'NONE' })
  })
})

describe('compareLineToPurchaseOrder', () => {
  it('matches equal lines', () => {
    const result = compareLineToPurchaseOrder({ qty: 10, unitPrice: 2 }, { qty: 10, unitPrice: 2 })
    expect(result.status).toBe('MATCHED')
    expect(result.qtyVariance).toBe(0)
    expect(result.priceVariance).toBe(0)
    expect(result.priceVariancePct).toBe(0)
  })

  it('flags quantity and price variance', () => {
    const result = compareLineToPurchaseOrder(
      { qty: 12, unitPrice: 2.5 },
      { qty: 10, unitPrice: 2 },
    )
    expect(result.status).toBe('VARIANCE')
    expect(result.qtyVariance).toBe(2)
    expect(result.priceVariance).toBe(0.5)
    expect(result.priceVariancePct).toBe(25)
  })

  it('treats sub-epsilon differences as a match', () => {
    const result = compareLineToPurchaseOrder(
      { qty: 10.001, unitPrice: 2.001 },
      { qty: 10, unitPrice: 2 },
    )
    expect(result.status).toBe('MATCHED')
  })
})
