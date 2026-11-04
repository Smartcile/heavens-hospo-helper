import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, getWorkerSession } = vi.hoisted(() => ({
  db: { helpArticle: { findMany: vi.fn() } },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { GET } from './route'

const rows = [
  { id: '1', slug: 'every', title: 'EVERY', summary: null, category: 'C', audience: 'EVERYONE', sortOrder: 10, bodyHtml: '<p>HI</p>' },
  { id: '2', slug: 'admin', title: 'ADMIN', summary: null, category: 'C', audience: 'ADMIN', sortOrder: 20, bodyHtml: '<p>SECRET</p>' },
  { id: '3', slug: 'worker', title: 'WORKER', summary: null, category: 'C', audience: 'WORKER', sortOrder: 30, bodyHtml: '<p>TASKS</p>' },
]

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  db.helpArticle.findMany.mockResolvedValue(rows)
})

describe('GET /api/worker/help', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns EVERYONE + WORKER articles', async () => {
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.map((a: { slug: string }) => a.slug)).toEqual(['every', 'worker'])
  })
})
