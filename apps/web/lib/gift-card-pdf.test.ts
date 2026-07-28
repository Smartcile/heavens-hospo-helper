import { describe, it, expect } from 'vitest'
import { generateGiftCardPdf, giftCardPdfToBuffer } from './gift-card-pdf'

describe('generateGiftCardPdf', () => {
  it('generates a PDF with voucher number and amount', () => {
    const doc = generateGiftCardPdf({
      number: '20260001',
      amount: 100,
      customerName: 'Jane Doe',
      issueDate: '09/07/2026',
    })

    expect(doc).toBeDefined()
    const buffer = giftCardPdfToBuffer(doc)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(100)
  })

  it('uses custom message when provided', () => {
    const doc = generateGiftCardPdf({
      number: '20260002',
      amount: 50,
      customerName: 'John Smith',
      issueDate: '09/07/2026',
      message: 'Happy birthday!',
    })

    expect(doc).toBeDefined()
  })
})
