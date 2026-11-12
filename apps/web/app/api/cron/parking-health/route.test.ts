import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { runParkingHealthChecks } = vi.hoisted(() => ({
  runParkingHealthChecks: vi.fn(),
}))

vi.mock('@/lib/parking-health.server', () => ({ runParkingHealthChecks }))

import { GET } from './route'

function req(url = 'http://localhost/api/cron/parking-health', token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequest(url, { headers })
}

const RESULTS = [
  { venueId: 'v1', mode: 'READINESS', ok: true, message: 'FORM READY', httpStatus: 200, durationMs: 5 },
  { venueId: 'v2', mode: 'READINESS', ok: false, message: 'HTTP 502', httpStatus: 502, durationMs: 5 },
  { venueId: 'v3', mode: 'READINESS', ok: true, message: 'ALREADY CHECKED TODAY', httpStatus: 0, durationMs: 0, skipped: 'ALREADY CHECKED TODAY' },
]

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  runParkingHealthChecks.mockResolvedValue(RESULTS)
})

afterEach(() => {
  delete process.env.CRON_SECRET
})

describe('GET /api/cron/parking-health', () => {
  it('rejects a missing or wrong token', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req(undefined, 'wrong'))).status).toBe(401)
    expect(runParkingHealthChecks).not.toHaveBeenCalled()
  })

  it('runs the checks and summarises the result', async () => {
    const res = await GET(req(undefined, 'test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(runParkingHealthChecks).toHaveBeenCalledWith({ force: false })
    expect(body).toMatchObject({ checked: 3, failed: 1, skipped: 1 })
  })

  it('passes force=1 through to the runner', async () => {
    await GET(req('http://localhost/api/cron/parking-health?force=1', 'test-secret'))
    expect(runParkingHealthChecks).toHaveBeenCalledWith({ force: true })
  })
})
