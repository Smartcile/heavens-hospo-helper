import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: { guide: { create: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/reference-table.server', () => ({ loadMenuItemIndex: vi.fn(async () => new Map()) }))
vi.mock('@/lib/guides.server', () => ({
  cleanAudiences: vi.fn((a: unknown) => a ?? []),
  cleanBodyHtml: vi.fn((v: unknown) => v),
  cleanGuideSteps: vi.fn((s: unknown) => s ?? []),
  cleanTableColumns: vi.fn((c: unknown) => c ?? []),
  cleanTableRows: vi.fn((r: unknown) => r ?? []),
  cleanTaskGuides: vi.fn((t: unknown) => t ?? []),
  guideStepsCreate: vi.fn((s: unknown) => s),
  guideTypeValue: vi.fn((v: unknown) => v),
  scopedFolderId: vi.fn(async () => null),
  scopedMenuId: vi.fn(async () => null),
  tableRowsCreate: vi.fn((r: unknown) => r),
}))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

describe('POST /api/admin/guides reference-only supplier guides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
    guardAccess.mockResolvedValue(null)
    prisma.guide.create.mockResolvedValue({ id: 'g1' })
  })

  it('forces a SUPPLIER_INFO guide to be untracked and unsigned', async () => {
    const res = await POST(
      req({
        title: 'BIDFOOD DROP-OFF',
        guideType: 'SUPPLIER_INFO',
        venueId: 'v1',
        isTracked: true,
        requiresSignOff: true,
        steps: [{ content: 'Use the back door.' }],
      }),
    )

    expect(res.status).toBe(201)
    expect(prisma.guide.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guideType: 'SUPPLIER_INFO',
          isTracked: false,
          requiresSignOff: false,
        }),
      }),
    )
  })
})
