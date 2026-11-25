import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  prisma: {
    giftCard: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  issueGiftCardPdf: vi.fn(),
  logGiftCardEvent: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess: mocks.guardAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/gift-card-issue', () => ({ issueGiftCardPdf: mocks.issueGiftCardPdf }))
vi.mock('@/lib/gift-card-history', () => ({ logGiftCardEvent: mocks.logGiftCardEvent }))

import { GET, POST } from './route'

let tempDir: string
let pdfPath: string

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    venueId: 'v1',
    number: '20260001',
    amount: 80,
    redeemedAmount: 0,
    customerName: 'SAM SMITH',
    customerEmail: 'sam@example.com',
    message: 'HAPPY BIRTHDAY',
    status: 'ISSUED',
    pdfPath,
    notes: null,
    issuedAt: new Date('2026-09-01T00:00:00Z'),
    sentAt: null,
    expiresAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-11-25T00:00:00Z'),
    history: [],
    deletedAt: null,
    ...overrides,
  }
}

const params = { params: { id: 'c1' } }
const request = (url = 'http://localhost/api/admin/gift-cards/c1/pdf') => new NextRequest(url)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServerSession.mockResolvedValue({
    user: { id: 's1', role: 'ADMIN', venueId: 'v1', name: 'BEA' },
  })
  mocks.guardAccess.mockResolvedValue(null)
  mocks.prisma.giftCard.findFirst.mockResolvedValue(makeCard())
  mocks.prisma.giftCard.update.mockResolvedValue(makeCard())
  mocks.prisma.giftCard.findUnique.mockResolvedValue(makeCard())
  mocks.issueGiftCardPdf.mockResolvedValue('/uploads/gift-cards/Gift Card - 20260001.pdf')
})

// Real temp file — the GET route streams the stored bytes.
beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-pdf-route-'))
  pdfPath = path.join(tempDir, 'Gift Card - 20260001.pdf')
  fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.4 ORIGINAL'))
})

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('GET /api/admin/gift-cards/[id]/pdf', () => {
  it('still streams the stored PDF (inline and attachment)', async () => {
    const res = await GET(request(), params)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('%PDF-1.4 ORIGINAL')

    const inline = await GET(request('http://localhost/api/admin/gift-cards/c1/pdf?inline=1'), params)
    expect(inline.headers.get('Content-Disposition')).toContain('inline')
  })

  it('returns 401 without a session', async () => {
    mocks.getServerSession.mockResolvedValue(null)
    const res = await GET(request(), params)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/gift-cards/[id]/pdf', () => {
  it('returns 401 without a session', async () => {
    mocks.getServerSession.mockResolvedValue(null)
    const res = await POST(request(), params)
    expect(res.status).toBe(401)
    expect(mocks.issueGiftCardPdf).not.toHaveBeenCalled()
  })

  it('returns the guard response when the issue grant is missing', async () => {
    mocks.guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await POST(request(), params)
    expect(res.status).toBe(403)
    expect(mocks.guardAccess).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 's1' }) }),
      expect.anything(),
      'performance.giftcards.issue',
    )
    expect(mocks.issueGiftCardPdf).not.toHaveBeenCalled()
  })

  it('returns 404 for a card in another venue', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(null)
    const res = await POST(request(), params)
    expect(res.status).toBe(404)
  })

  it.each(['DRAFT', 'REDEEMED', 'VOIDED', 'EXPIRED'])('refuses a %s card', async (status) => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(makeCard({ status }))
    const res = await POST(request(), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('ONLY ISSUED / SENT CARDS')
    expect(mocks.issueGiftCardPdf).not.toHaveBeenCalled()
  })

  it('refuses an issued card with no stored pdfPath', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(makeCard({ pdfPath: null }))
    const res = await POST(request(), params)
    expect(res.status).toBe(409)
    expect(mocks.issueGiftCardPdf).not.toHaveBeenCalled()
  })

  it('regenerates from the current row, overwrites pdfPath and logs PDF_UPDATED', async () => {
    const res = await POST(request(), params)

    expect(res.status).toBe(200)
    expect(mocks.issueGiftCardPdf).toHaveBeenCalledWith({
      venueId: 'v1',
      number: '20260001',
      amount: 80,
      customerName: 'SAM SMITH',
      message: 'HAPPY BIRTHDAY',
      issuedAt: new Date('2026-09-01T00:00:00Z'),
      createdAt: new Date('2026-09-01T00:00:00Z'),
    })
    expect(mocks.prisma.giftCard.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { pdfPath: '/uploads/gift-cards/Gift Card - 20260001.pdf' },
    })
    expect(mocks.logGiftCardEvent).toHaveBeenCalledWith(
      'c1',
      'PDF_UPDATED',
      expect.stringContaining('AMOUNT $80.00'),
    )
    expect((await res.json()).id).toBe('c1')
  })

  it('reports the remaining balance in the history note', async () => {
    mocks.prisma.giftCard.findFirst.mockResolvedValue(makeCard({ amount: 100, redeemedAmount: 25 }))
    await POST(request(), params)
    expect(mocks.logGiftCardEvent).toHaveBeenCalledWith(
      'c1',
      'PDF_UPDATED',
      expect.stringContaining('$75.00 REMAINING'),
    )
  })
})
