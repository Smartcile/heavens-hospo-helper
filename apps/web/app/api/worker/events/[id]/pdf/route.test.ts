import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerMayManageEvents } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayManageEvents: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-event-access', () => ({ workerMayManageEvents }))
vi.mock('@/lib/events.server', () => ({ buildBeoPdfData: vi.fn(async () => ({ eventName: 'WEDDING' })) }))
vi.mock('@/lib/beo-block-defs.server', () => ({ loadBlockLibrary: vi.fn(async () => ({})) }))
vi.mock('@/lib/beo-pdf', () => ({
  beoPdfFilename: vi.fn(() => 'BEO - WEDDING.pdf'),
  beoPdfToBuffer: vi.fn(() => Buffer.from('%PDF-1.4')),
  generateBeoPdf: vi.fn(() => ({})),
}))

import { GET } from './route'

function call(url: string) {
  return GET(new NextRequest(url), { params: { id: 'e1' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1' })
  workerMayManageEvents.mockResolvedValue(true)
})

describe('GET /api/worker/events/[id]/pdf', () => {
  it('serves the BEO PDF inline when ?inline=1', async () => {
    const res = await call('http://localhost/api/worker/events/e1/pdf?variant=KITCHEN&inline=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('inline;')).toBe(true)
  })

  it('defaults to an attachment download', async () => {
    const res = await call('http://localhost/api/worker/events/e1/pdf?variant=KITCHEN')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true)
  })
})
