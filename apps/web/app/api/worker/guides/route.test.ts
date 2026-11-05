import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, getWorkerSession, workerGuideAccess } = vi.hoisted(() => ({
  db: { guide: { create: vi.fn() } },
  getWorkerSession: vi.fn(),
  workerGuideAccess: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({ workerGuideAccess }))
vi.mock('@/lib/guides', () => ({ resolveStaffGuides: vi.fn() }))
vi.mock('@/lib/worker-task-access.server', () => ({ workerTaskAccess: vi.fn() }))

import { POST } from '@/app/api/worker/guides/route'

const session = {
  staffId: 'staff1',
  venueId: 'venue1',
  firstName: 'ALEX',
  role: 'MANAGER',
}

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

describe('POST /api/worker/guides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue(session)
    workerGuideAccess.mockResolvedValue({ canEdit: true, canPublish: true })
    db.guide.create.mockResolvedValue({ id: 'g1' })
  })

  it('creates audiences and step links', async () => {
    const res = await POST(
      jsonRequest({
        title: 'FOOD SAFETY',
        steps: [{ content: 'Clean the probe.', links: [{ kind: 'ITEM', targetId: 'i1' }] }],
        audiences: [{ kind: 'DEPARTMENT', targetId: 'd1' }],
      }),
    )

    expect(res.status).toBe(201)
    expect(db.guide.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audiences: { create: [{ kind: 'DEPARTMENT', targetId: 'd1' }] },
          steps: {
            create: [
              expect.objectContaining({
                links: { create: [expect.objectContaining({ kind: 'ITEM', targetId: 'i1', order: 0 })] },
              }),
            ],
          },
        }),
      }),
    )
  })
})
