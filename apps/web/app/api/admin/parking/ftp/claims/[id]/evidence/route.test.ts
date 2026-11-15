import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, resolveScopedVenueId, claimFindFirst, readFile } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  claimFindFirst: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({
  prisma: { ftpClaim: { findFirst: claimFindFirst } },
}))
vi.mock('node:fs/promises', () => ({ readFile }))

import { GET } from './route'

function req(query = '?format=pdf') {
  return new NextRequest(`http://localhost/api/admin/parking/ftp/claims/c1/evidence${query}`)
}

const CLAIM = {
  id: 'c1',
  evidencePdfPath: 'evidence/ftp/c1/evidence.pdf',
  evidenceImagePath: 'evidence/ftp/c1/confirmation.png',
  evidenceHtmlPath: 'evidence/ftp/c1/confirmation.html',
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  claimFindFirst.mockResolvedValue(CLAIM)
  readFile.mockResolvedValue(Buffer.from('PDFDATA'))
})

describe('GET /api/admin/parking/ftp/claims/[id]/evidence', () => {
  it('requires a session and a claim', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(req(), { params: { id: 'c1' } })).status).toBe(401)

    getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
    claimFindFirst.mockResolvedValue(null)
    expect((await GET(req(), { params: { id: 'c1' } })).status).toBe(404)
  })

  it('404s when the requested format is missing', async () => {
    claimFindFirst.mockResolvedValue({ ...CLAIM, evidencePdfPath: null })
    const res = await GET(req('?format=pdf'), { params: { id: 'c1' } })
    expect(res.status).toBe(404)
  })

  it('serves the PDF privately', async () => {
    const res = await GET(req('?format=pdf'), { params: { id: 'c1' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('PDFDATA')
    expect(readFile).toHaveBeenCalled()
  })

  it('serves the raw HTML as a text attachment', async () => {
    const res = await GET(req('?format=html'), { params: { id: 'c1' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('content-disposition')).toContain('attachment')
  })
})
