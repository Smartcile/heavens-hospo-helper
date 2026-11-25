import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  generateGiftCardPdf: vi.fn(),
  giftCardPdfToBuffer: vi.fn(),
  fillGiftCardTemplate: vi.fn(),
  mergePdfBuffers: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: { giftCardTemplate: { findFirst: mocks.findFirst } },
}))
vi.mock('@/lib/gift-card-pdf', () => ({
  generateGiftCardPdf: mocks.generateGiftCardPdf,
  giftCardPdfToBuffer: mocks.giftCardPdfToBuffer,
}))
vi.mock('@/lib/gift-card-template', () => ({
  fillGiftCardTemplate: mocks.fillGiftCardTemplate,
  mergePdfBuffers: mocks.mergePdfBuffers,
}))
vi.mock('fs', () => ({
  default: { existsSync: mocks.existsSync, readFileSync: mocks.readFileSync },
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}))

import { giftCardPdfBuffer } from './gift-card-issue'

const values = {
  venueId: 'v1',
  number: '20260001',
  amount: 80,
  customerName: 'SAM SMITH',
  message: 'HAPPY BIRTHDAY',
  issuedAt: new Date('2026-09-01T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('giftCardPdfBuffer (reprint generation)', () => {
  it('rebuilds a built-in card with the CURRENT amount when no template is active', async () => {
    mocks.findFirst.mockResolvedValue(null)
    const doc = { id: 'builtin' }
    mocks.generateGiftCardPdf.mockReturnValue(doc)
    mocks.giftCardPdfToBuffer.mockReturnValue(Buffer.from('builtin-pdf'))

    const out = await giftCardPdfBuffer(values)

    expect(mocks.generateGiftCardPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        number: '20260001',
        amount: 80,
        customerName: 'SAM SMITH',
        message: 'HAPPY BIRTHDAY',
      }),
    )
    expect(mocks.giftCardPdfToBuffer).toHaveBeenCalledWith(doc)
    expect(out.toString()).toBe('builtin-pdf')
  })

  it('fills the active template with the CURRENT amount rather than the built-in design', async () => {
    mocks.findFirst.mockResolvedValue({
      filePath: '/templates/card.pdf',
      fieldMapping: [{ pdfField: 'Value', dataKey: 'amount', format: '2dp' }],
    })
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync.mockReturnValue(Buffer.from('template-bytes'))
    mocks.fillGiftCardTemplate.mockResolvedValue(Buffer.from('filled-pdf'))

    const out = await giftCardPdfBuffer({ ...values, amount: 125.5 })

    expect(mocks.fillGiftCardTemplate).toHaveBeenCalledWith(
      Buffer.from('template-bytes'),
      [{ pdfField: 'Value', dataKey: 'amount', format: '2dp' }],
      expect.objectContaining({ number: '20260001', amount: 125.5 }),
    )
    expect(mocks.generateGiftCardPdf).not.toHaveBeenCalled()
    expect(out.toString()).toBe('filled-pdf')
  })
})
