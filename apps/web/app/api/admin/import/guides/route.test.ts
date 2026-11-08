import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    guide: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    guideFolder: { findMany: vi.fn(), create: vi.fn() },
    department: { findMany: vi.fn() },
    section: { findMany: vi.fn() },
    position: { findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    checklist: { findMany: vi.fn() },
    recipe: { findMany: vi.fn() },
    guideStep: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/import/guides') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

function row(overrides: Record<string, unknown> = {}) {
  return {
    action: 'CREATE',
    values: {
      title: 'OPENING THE BAR',
      description: 'How to open',
      category: 'FRONT OF HOUSE',
      guideType: 'SOP',
      bodyHtml: '<p>Intro</p>',
      folderName: null,
      audiences: [{ kind: 'SECTION', name: 'BAR' }],
      isTracked: true,
      requiresSignOff: false,
      steps: [{ heading: 'UNLOCK', content: 'Unlock the doors', links: [{ kind: 'ITEM', name: 'DOOR KEY', qty: 1, note: null }] }],
      replaceSteps: false,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.guide.findMany.mockResolvedValue([{ id: 'g9', title: 'EXISTING GUIDE' }])
  prisma.guideFolder.findMany.mockResolvedValue([])
  prisma.department.findMany.mockResolvedValue([{ id: 'd1', name: 'FRONT OF HOUSE' }])
  prisma.section.findMany.mockResolvedValue([{ id: 's1', name: 'BAR' }])
  prisma.position.findMany.mockResolvedValue([{ id: 'p1', name: 'BARTENDER' }])
  prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'i1', name: 'DOOR KEY' }])
  prisma.task.findMany.mockResolvedValue([{ id: 't1', title: 'STOCK FRIDGE' }])
  prisma.checklist.findMany.mockResolvedValue([{ id: 'c1', name: 'OPENING' }])
  prisma.recipe.findMany.mockResolvedValue([{ id: 'r1', name: 'HOUSE SYRUP' }])
  prisma.guide.findFirst.mockImplementation(async (args: { where?: { id?: string; title?: string } }) => {
    if (args.where?.id) return { id: args.where.id }
    return null
  })
  prisma.guide.create.mockResolvedValue({ id: 'g-new' })
  prisma.guide.update.mockResolvedValue({ id: 'g1' })
  prisma.guideFolder.create.mockResolvedValue({ id: 'f-new' })
  prisma.guideStep.deleteMany.mockResolvedValue({ count: 0 })
  prisma.guideStep.create.mockResolvedValue({ id: 'st1' })
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/import/guides', () => {
  it('returns venue-scoped refs', async () => {
    const res = await GET(getReq())
    const body = await res.json()
    expect(body.guides).toEqual([{ id: 'g9', name: 'EXISTING GUIDE' }])
    expect(body.sections).toEqual([{ id: 's1', name: 'BAR' }])
    expect(body.items).toEqual([{ id: 'i1', name: 'DOOR KEY' }])
    expect(body.positions).toEqual([{ id: 'p1', name: 'BARTENDER' }])
  })

  it('locks a MANAGER to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    await GET(getReq('http://localhost/api/admin/import/guides?venueId=other'))
    expect(prisma.guide.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
  })
})

describe('POST /api/admin/import/guides', () => {
  it('creates a DRAFT guide with resolved audiences and step links', async () => {
    const res = await POST(postReq({ rows: [row()] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    const data = prisma.guide.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      venueId: 'v1',
      title: 'OPENING THE BAR',
      guideType: 'SOP',
      status: 'DRAFT',
      isTracked: true,
      requiresSignOff: false,
      audiences: { create: [{ kind: 'SECTION', targetId: 's1' }] },
    })
    expect(data.steps.create[0].heading).toBe('UNLOCK')
    expect(data.steps.create[0].links.create[0]).toEqual(expect.objectContaining({
      kind: 'ITEM', targetId: 'i1', qty: 1, note: null,
    }))
  })

  it('creates a missing folder by name', async () => {
    const withFolder = row({ values: { ...row().values, folderName: 'BARS' } })
    await POST(postReq({ rows: [withFolder] }))
    expect(prisma.guideFolder.create).toHaveBeenCalledWith({ data: { venueId: 'v1', name: 'BARS' }, select: { id: true } })
    expect(prisma.guide.create.mock.calls[0][0].data.folderId).toBe('f-new')
  })

  it('skips a row with an unknown audience', async () => {
    const bad = row({ values: { ...row().values, audiences: [{ kind: 'DEPARTMENT', name: 'NOWHERE' }] } })
    const res = await POST(postReq({ rows: [bad] }))
    const body = await res.json()
    expect(body.created).toBe(0)
    expect(body.skipped).toBe(1)
    expect(prisma.guide.create).not.toHaveBeenCalled()
  })

  it('skips a row with an unknown step link', async () => {
    const bad = row({
      values: {
        ...row().values,
        steps: [{ heading: 'S', content: 'c', links: [{ kind: 'TASK', name: 'NOPE' }] }],
      },
    })
    const res = await POST(postReq({ rows: [bad] }))
    const body = await res.json()
    expect(body.skipped).toBe(1)
    expect(prisma.guide.create).not.toHaveBeenCalled()
  })

  it('warns NOBODY WILL SEE THIS but still creates when there is no audience', async () => {
    const noAudience = row({ values: { ...row().values, audiences: [] } })
    const res = await POST(postReq({ rows: [noAudience] }))
    const body = await res.json()
    expect(body.created).toBe(1)
    expect(body.warnings.some((w: string) => w.includes('NOBODY WILL SEE THIS'))).toBe(true)
  })

  it('skips a PRODUCT_REFERENCE guide', async () => {
    const bad = row({ values: { ...row().values, guideType: 'PRODUCT_REFERENCE' } })
    const res = await POST(postReq({ rows: [bad] }))
    const body = await res.json()
    expect(body.skipped).toBe(1)
    expect(prisma.guide.create).not.toHaveBeenCalled()
  })

  it('updates without replacing steps unless REPLACE STEPS is ticked', async () => {
    const res = await POST(postReq({ rows: [row({ action: 'UPDATE', targetId: 'g1' })] }))
    const body = await res.json()
    expect(body.updated).toBe(1)
    expect(prisma.guide.update).toHaveBeenCalled()
    expect(prisma.guideStep.deleteMany).not.toHaveBeenCalled()
  })

  it('replaces steps when REPLACE STEPS is ticked', async () => {
    const update = row({ action: 'UPDATE', targetId: 'g1', values: { ...row().values, replaceSteps: true } })
    const res = await POST(postReq({ rows: [update] }))
    const body = await res.json()
    expect(body.updated).toBe(1)
    expect(prisma.guideStep.deleteMany).toHaveBeenCalledWith({ where: { guideId: 'g1' } })
    expect(prisma.guideStep.create).toHaveBeenCalled()
  })

  it('requires edit permission for an UPDATE row', async () => {
    guardAccess.mockImplementation(async (_s: unknown, _r: unknown, key: string) =>
      key === 'training.playbook.edit' ? { status: 403 } : null)
    const res = await POST(postReq({ rows: [row({ action: 'UPDATE', targetId: 'g1' })] }))
    expect(res.status).toBe(403)
    expect(prisma.guide.update).not.toHaveBeenCalled()
  })

  it('locks a MANAGER import to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    await POST(postReq({ venueId: 'other', rows: [row()] }))
    expect(prisma.guide.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
    expect(prisma.guide.create.mock.calls[0][0].data.venueId).toBe('vm')
  })

  it('rejects an empty payload', async () => {
    const res = await POST(postReq({ rows: [] }))
    expect(res.status).toBe(400)
  })
})
