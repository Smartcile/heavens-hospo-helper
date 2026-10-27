import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, getWorkerSession, workerGuideAccess, resolveStepLinks, loadMenuItemIndex } = vi.hoisted(() => ({
  db: {
    guide: { findUnique: vi.fn() },
    imageAnnotation: { findMany: vi.fn() },
  },
  getWorkerSession: vi.fn(),
  workerGuideAccess: vi.fn(),
  resolveStepLinks: vi.fn(),
  loadMenuItemIndex: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({ workerGuideAccess }))
vi.mock('@/lib/guide-links.server', () => ({ resolveStepLinks }))
vi.mock('@/lib/reference-table.server', () => ({ loadMenuItemIndex }))

import { GET } from '@/app/api/worker/guides/[id]/read/route'

const session = {
  staffId: 'staff1',
  venueId: 'venue1',
  firstName: 'ALEX',
  role: 'STAFF',
}

const guide = {
  id: 'g1',
  title: 'FOOD SAFETY',
  venueId: 'venue1',
  status: 'PUBLISHED',
  deletedAt: null,
  steps: [
    {
      id: 's1',
      order: 0,
      heading: null,
      content: 'Clean the probe.',
      imageUrl: '/uploads/probe.png',
      imageUrls: ['/uploads/probe.png'],
      videoUrl: null,
      videoPath: null,
      links: [],
    },
  ],
  tableRows: [],
}

function request() {
  return {} as Parameters<typeof GET>[0]
}

describe('GET /api/worker/guides/[id]/read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue(session)
    workerGuideAccess.mockResolvedValue({ canEdit: false, canPublish: false })
    resolveStepLinks.mockResolvedValue([])
    loadMenuItemIndex.mockResolvedValue(new Map())
    db.guide.findUnique.mockResolvedValue(guide)
    db.imageAnnotation.findMany.mockResolvedValue([
      {
        usageKey: 'guide-step:s1',
        imageUrl: '/uploads/probe.png',
        data: { shapes: [{ tool: 'arrow', points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }], texts: [] },
      },
    ])
  })

  it('includes the step image annotations in the popup payload', async () => {
    const res = await GET(request(), { params: { id: 'g1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.steps[0].imageAnnotations).toHaveLength(1)
    expect(body.steps[0].imageAnnotations[0]).toMatchObject({
      imageUrl: '/uploads/probe.png',
      data: { shapes: [{ tool: 'arrow' }] },
    })
    expect(db.imageAnnotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    )
  })

  it('keeps drafts hidden from workers without edit access', async () => {
    db.guide.findUnique.mockResolvedValue({ ...guide, status: 'DRAFT' })

    const res = await GET(request(), { params: { id: 'g1' } })

    expect(res.status).toBe(404)
    expect(db.imageAnnotation.findMany).not.toHaveBeenCalled()
  })
})
