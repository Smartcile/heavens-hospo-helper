import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, getWorkerSession, workerGuideAccess } = vi.hoisted(() => ({
  db: {
    guide: { findUnique: vi.fn(), update: vi.fn() },
    guideStep: { findMany: vi.fn() },
    guideStepLink: {
      deleteMany: vi.fn(() => Promise.resolve({})),
      createMany: vi.fn(() => Promise.resolve({})),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  getWorkerSession: vi.fn(),
  workerGuideAccess: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({ workerGuideAccess }))

import { GET, PUT } from '@/app/api/worker/guides/[id]/route'

const session = {
  staffId: 'staff1',
  venueId: 'venue1',
  firstName: 'ALEX',
  role: 'MANAGER',
}

const storedGuide = {
  id: 'g1',
  title: 'FOOD SAFETY',
  venueId: 'venue1',
  deletedAt: null,
  status: 'DRAFT',
  steps: [
    {
      id: 's1',
      order: 0,
      heading: null,
      content: 'Clean the probe.',
      imageUrl: null,
      imageUrls: [],
      videoUrl: null,
      videoPath: null,
      links: [{ id: 'l1', stepId: 's1', kind: 'ITEM', targetId: 'i1', qty: null, note: null, order: 0 }],
    },
  ],
  taskGuides: [],
  audiences: [{ kind: 'DEPARTMENT', targetId: 'd1' }],
  department: null,
}

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PUT>[0]
}

describe('/api/worker/guides/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue(session)
    workerGuideAccess.mockResolvedValue({ canEdit: true, canPublish: true })
    db.guide.findUnique.mockResolvedValue(storedGuide)
    db.guideStep.findMany.mockResolvedValue([{ id: 's1' }])
    db.guide.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: 'g1',
      venueId: 'venue1',
      steps: [{ id: 's1' }],
    }))
  })

  it('returns existing step links on GET so an edit can round-trip them', async () => {
    const res = await GET({} as Parameters<typeof GET>[0], { params: { id: 'g1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.steps[0].links).toEqual([
      { id: 'l1', stepId: 's1', kind: 'ITEM', targetId: 'i1', qty: null, note: null, order: 0 },
    ])
  })

  it('replaces audiences and step links when supplied', async () => {
    const res = await PUT(
      jsonRequest({
        audiences: [{ kind: 'SECTION', targetId: 's1' }],
        steps: [{ id: 's1', content: 'Clean the probe.', links: [{ kind: 'ITEM', targetId: 'i1' }] }],
      }),
      { params: { id: 'g1' } },
    )

    expect(res.status).toBe(200)
    const data = db.guide.update.mock.calls[0][0].data as Record<string, unknown>
    expect(data.audiences).toEqual({
      deleteMany: {},
      create: [{ kind: 'SECTION', targetId: 's1' }],
    })
    expect(db.guideStepLink.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ stepId: 's1', kind: 'ITEM', targetId: 'i1', order: 0 })],
    })
  })

  it('leaves audiences untouched when the client omits them', async () => {
    const res = await PUT(jsonRequest({ title: 'NEW TITLE' }), { params: { id: 'g1' } })

    expect(res.status).toBe(200)
    const data = db.guide.update.mock.calls[0][0].data as Record<string, unknown>
    expect(data.title).toBe('NEW TITLE')
    expect('audiences' in data).toBe(false)
    expect(db.guideStepLink.createMany).not.toHaveBeenCalled()
  })
})
