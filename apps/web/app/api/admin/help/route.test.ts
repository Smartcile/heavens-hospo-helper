import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, getServerSession } = vi.hoisted(() => ({
  db: { helpArticle: { findMany: vi.fn() } },
  getServerSession: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { GET } from './route'

const rows = [
  { id: '1', slug: 'every', title: 'EVERY', summary: null, category: 'C', audience: 'EVERYONE', sortOrder: 10, bodyHtml: '<p>HI</p><script>x</script>' },
  { id: '2', slug: 'admin', title: 'ADMIN', summary: null, category: 'C', audience: 'ADMIN', sortOrder: 20, bodyHtml: '<p>SECRET</p>' },
  { id: '3', slug: 'worker', title: 'WORKER', summary: null, category: 'C', audience: 'WORKER', sortOrder: 30, bodyHtml: '<p>TASKS</p>' },
]

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER' } })
  db.helpArticle.findMany.mockResolvedValue(rows)
})

describe('GET /api/admin/help', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns EVERYONE + ADMIN articles and sanitises HTML', async () => {
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.map((a: { slug: string }) => a.slug)).toEqual(['every', 'admin'])
    expect(json[0].bodyHtml).not.toContain('<script')
  })
})
