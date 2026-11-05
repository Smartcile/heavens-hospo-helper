import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, postRetrainNotice } = vi.hoisted(() => ({
  prisma: { guide: { findUnique: vi.fn(), update: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  postRetrainNotice: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/retrain', () => ({ postRetrainNotice }))
vi.mock('@/lib/guide-links.server', () => ({ resolveStepLinks: vi.fn(async () => []) }))
vi.mock('@/lib/reference-table.server', () => ({ loadMenuItemIndex: vi.fn(async () => new Map()) }))
vi.mock('@/lib/guides.server', () => ({
  cleanAudiences: vi.fn((a: unknown) => a),
  cleanBodyHtml: vi.fn((v: unknown) => v),
  cleanGuideSteps: vi.fn((s: unknown) => s),
  cleanTableColumns: vi.fn((c: unknown) => c ?? []),
  cleanTableRows: vi.fn((r: unknown) => r),
  cleanTaskGuides: vi.fn((t: unknown) => t),
  guideStepsWrite: vi.fn(() => ({})),
  guideTypeValue: vi.fn((v: unknown) => v),
  loadStepAnnotations: vi.fn(async () => new Map()),
  scopedFolderId: vi.fn(),
  scopedMenuId: vi.fn(),
  stepAnnotationsFor: vi.fn(() => []),
  stepsManageLinks: vi.fn(() => false),
  syncStepLinks: vi.fn(),
  tableRowsWrite: vi.fn(() => ({})),
}))

import { PUT } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

const existing = {
  id: 'g1',
  venueId: 'v1',
  title: 'FOOD SAFETY',
  status: 'PUBLISHED',
  departmentId: null,
  isOnboarding: false,
  deletedAt: null,
}

let saved: Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.guide.findUnique.mockResolvedValue(existing)
  saved = {
    ...existing,
    audiences: [{ kind: 'SECTION', targetId: 's1' }],
  }
  prisma.guide.update.mockImplementation(async () => saved)
})

describe('PUT /api/admin/guides/[id] re-training', () => {
  it('bumps the version and posts to the saved audiences for a published guide', async () => {
    const res = await PUT(
      req({ requireRetrain: true, changeSummary: 'Added rinse step' }),
      { params: { id: 'g1' } },
    )

    expect(res.status).toBe(200)
    const call = prisma.guide.update.mock.calls[0][0]
    expect(call.data.version).toEqual({ increment: 1 })
    expect(call.include.audiences).toBeTruthy()
    expect(postRetrainNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: 'v1',
        departmentId: null,
        audiences: [{ kind: 'SECTION', targetId: 's1' }],
        summary: 'Added rinse step',
      }),
    )
  })

  it('does nothing when requireRetrain is omitted', async () => {
    await PUT(req({ title: 'NEW TITLE' }), { params: { id: 'g1' } })

    const call = prisma.guide.update.mock.calls[0][0]
    expect(call.data).not.toHaveProperty('version')
    expect(postRetrainNotice).not.toHaveBeenCalled()
  })

  it('bumps the version but posts no notice for a DRAFT guide', async () => {
    saved = { ...saved, status: 'DRAFT' }

    await PUT(req({ requireRetrain: true }), { params: { id: 'g1' } })

    const call = prisma.guide.update.mock.calls[0][0]
    expect(call.data.version).toEqual({ increment: 1 })
    expect(postRetrainNotice).not.toHaveBeenCalled()
  })

  it('bumps the version but posts no notice with no audience or department', async () => {
    saved = { ...saved, audiences: [] }

    await PUT(req({ requireRetrain: true }), { params: { id: 'g1' } })

    const call = prisma.guide.update.mock.calls[0][0]
    expect(call.data.version).toEqual({ increment: 1 })
    expect(postRetrainNotice).not.toHaveBeenCalled()
  })

  it('still returns 200 when posting the notice fails', async () => {
    postRetrainNotice.mockRejectedValueOnce(new Error('db down'))

    const res = await PUT(req({ requireRetrain: true }), { params: { id: 'g1' } })

    expect(res.status).toBe(200)
    expect(postRetrainNotice).toHaveBeenCalled()
  })
})
