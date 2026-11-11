import { describe, expect, it } from 'vitest'
import {
  applyReceipt,
  computePurchaseOrderTotals,
  describePurchaseOrderStatus,
  purchaseOrderStatusFromLines,
} from './purchasing'

describe('computePurchaseOrderTotals', () => {
  it('sums lines and adds 15% GST by default', () => {
    const totals = computePurchaseOrderTotals([
      { qty: 2, unitPrice: 10 },
      { qty: 1, unitPrice: 5.5 },
    ])
    expect(totals).toEqual({ subtotal: 25.5, gst: 3.83, total: 29.33 })
  })

  it('supports a custom GST rate and rounds to 2dp', () => {
    const totals = computePurchaseOrderTotals([{ qty: 3, unitPrice: 1.11 }], 0.1)
    expect(totals.subtotal).toBe(3.33)
    expect(totals.gst).toBe(0.33)
    expect(totals.total).toBe(3.66)
  })

  it('handles an empty line list', () => {
    expect(computePurchaseOrderTotals([])).toEqual({ subtotal: 0, gst: 0, total: 0 })
  })
})

describe('purchaseOrderStatusFromLines', () => {
  it('keeps a DRAFT draft when nothing is received', () => {
    expect(purchaseOrderStatusFromLines([{ qty: 5, unitPrice: 1 }])).toBe('DRAFT')
  })

  it('reports SENT when nothing received and the PO was sent', () => {
    expect(purchaseOrderStatusFromLines([{ qty: 5, unitPrice: 1 }], 'SENT')).toBe('SENT')
  })

  it('reports PARTIALLY_RECEIVED when some is received', () => {
    expect(
      purchaseOrderStatusFromLines([
        { qty: 5, unitPrice: 1, receivedQty: 2 },
        { qty: 3, unitPrice: 1, receivedQty: 0 },
      ]),
    ).toBe('PARTIALLY_RECEIVED')
  })

  it('reports RECEIVED when everything is received', () => {
    expect(
      purchaseOrderStatusFromLines([
        { qty: 5, unitPrice: 1, receivedQty: 5 },
        { qty: 3, unitPrice: 1, receivedQty: 3 },
      ]),
    ).toBe('RECEIVED')
  })

  it('lets CANCELLED win over everything', () => {
    expect(
      purchaseOrderStatusFromLines([{ qty: 5, unitPrice: 1, receivedQty: 5 }], 'CANCELLED'),
    ).toBe('CANCELLED')
  })

  it('keeps the current status when there are no lines', () => {
    expect(purchaseOrderStatusFromLines([], 'SENT')).toBe('SENT')
  })
})

describe('applyReceipt', () => {
  it('adds a receipt and reports the remainder', () => {
    expect(applyReceipt({ qty: 10, unitPrice: 1, receivedQty: 4 }, 3)).toEqual({
      receivedQty: 7,
      remaining: 3,
      overReceived: false,
    })
  })

  it('clamps to the ordered quantity and flags an over-receipt', () => {
    expect(applyReceipt({ qty: 10, unitPrice: 1, receivedQty: 9 }, 4)).toEqual({
      receivedQty: 10,
      remaining: 0,
      overReceived: true,
    })
  })

  it('rejects negative quantities gracefully', () => {
    expect(applyReceipt({ qty: 5, unitPrice: 1, receivedQty: 0 }, -2)).toEqual({
      receivedQty: 0,
      remaining: 5,
      overReceived: false,
    })
  })
})

describe('describePurchaseOrderStatus', () => {
  it('renders a human label', () => {
    expect(describePurchaseOrderStatus('PARTIALLY_RECEIVED')).toBe('PARTIALLY RECEIVED')
    expect(describePurchaseOrderStatus('CANCELLED')).toBe('CANCELLED')
  })
})
