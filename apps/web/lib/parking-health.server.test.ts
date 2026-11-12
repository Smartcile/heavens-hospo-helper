import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

vi.mock('@hospo-ops/db', () => {
  const parkingConfig = { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() }
  const parkingHealthCheck = { create: vi.fn() }
  return {
    prisma: {
      parkingConfig,
      parkingHealthCheck,
      $transaction: vi.fn().mockResolvedValue([]),
    },
  }
})

vi.mock('./scan2pay.server', () => ({ checkParking: vi.fn() }))

import { prisma } from '@hospo-ops/db'
import { checkParking } from './scan2pay.server'
import {
  runParkingHealthCheck,
  runParkingHealthChecks,
  parkingHealthForVenue,
} from './parking-health.server'

const configMock = prisma.parkingConfig as unknown as {
  findUnique: Mock
  findMany: Mock
  update: Mock
}
const healthMock = prisma.parkingHealthCheck as unknown as { create: Mock }
const checkMock = vi.mocked(checkParking)

const NOW = new Date('2026-11-12T16:00:00Z') // 2026-11-13 05:00 NZDT

function config(overrides: Record<string, unknown> = {}) {
  return {
    venueId: 'v1',
    enabled: true,
    carparkId: 19,
    carparkName: 'The Landing Carpark - Vehicle Parking',
    durationMinutes: 90,
    healthCheckMode: 'READINESS',
    healthPlate: 'STELLA',
    lastCheckAt: null,
    lastCheckOk: null,
    lastCheckMessage: null,
    deletedAt: null,
    venue: { timezone: 'Pacific/Auckland' },
    ...overrides,
  }
}

function okCheck(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    httpStatus: 200,
    message: 'FORM READY',
    mode: 'READINESS' as const,
    snippet: '',
    existing: { active: false },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  configMock.findMany.mockResolvedValue([])
  configMock.findUnique.mockResolvedValue(null)
  configMock.update.mockResolvedValue({})
  healthMock.create.mockResolvedValue({})
})

describe('runParkingHealthChecks', () => {
  it('checks every enabled config and records the result', async () => {
    configMock.findMany.mockResolvedValue([config()])
    checkMock.mockResolvedValue(okCheck())

    const results = await runParkingHealthChecks({ now: NOW })

    expect(results).toEqual([
      {
        venueId: 'v1',
        mode: 'READINESS',
        ok: true,
        message: 'FORM READY',
        httpStatus: 200,
        durationMs: expect.any(Number),
      },
    ])
    expect(checkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: 'STELLA',
        mode: 'READINESS',
        timezone: 'Pacific/Auckland',
        target: expect.objectContaining({ carparkId: 19 }),
      }),
    )
    expect(healthMock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ venueId: 'v1', mode: 'READINESS', ok: true, httpStatus: 200 }),
    })
    expect(configMock.update).toHaveBeenCalledWith({
      where: { venueId: 'v1' },
      data: expect.objectContaining({ lastCheckOk: true, lastCheckMessage: 'FORM READY' }),
    })
  })

  it('skips a venue already checked today', async () => {
    const lastCheckAt = new Date('2026-11-12T15:10:00Z') // 2026-11-13 04:10 NZDT
    configMock.findMany.mockResolvedValue([config({ lastCheckAt, lastCheckOk: true })])

    const results = await runParkingHealthChecks({ now: NOW })

    expect(results[0].skipped).toBe('ALREADY CHECKED TODAY')
    expect(checkMock).not.toHaveBeenCalled()
    expect(healthMock.create).not.toHaveBeenCalled()
  })

  it('runs the configured FULL mode', async () => {
    configMock.findMany.mockResolvedValue([config({ healthCheckMode: 'FULL' })])
    checkMock.mockResolvedValue(
      okCheck({ mode: 'FULL', confirmationRef: '123', message: 'PARKING REGISTERED' }),
    )

    const results = await runParkingHealthChecks({ now: NOW })

    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'FULL' }))
    expect(results[0].mode).toBe('FULL')
  })

  it('does nothing for an OFF config', async () => {
    configMock.findMany.mockResolvedValue([config({ healthCheckMode: 'OFF' })])

    const results = await runParkingHealthChecks({ now: NOW })

    expect(results).toEqual([])
    expect(checkMock).not.toHaveBeenCalled()
  })

  it('records a failure when no carpark id is configured', async () => {
    configMock.findMany.mockResolvedValue([config({ carparkId: null })])

    const results = await runParkingHealthChecks({ now: NOW })

    expect(checkMock).not.toHaveBeenCalled()
    expect(results[0].ok).toBe(false)
    expect(results[0].message).toBe('NO CARPARK ID CONFIGURED')
    expect(healthMock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ok: false, message: 'NO CARPARK ID CONFIGURED' }),
    })
  })

  it('records a failure when Scan2Pay throws', async () => {
    configMock.findMany.mockResolvedValue([config()])
    checkMock.mockRejectedValue(new Error('ENOTFOUND'))

    const results = await runParkingHealthChecks({ now: NOW })

    expect(results[0].ok).toBe(false)
    expect(results[0].message).toContain('COULD NOT REACH SCAN2PAY')
  })
})

describe('runParkingHealthCheck (manual)', () => {
  it('forces a run even when already checked today', async () => {
    const lastCheckAt = new Date('2026-11-12T15:10:00Z')
    configMock.findUnique.mockResolvedValue(config({ lastCheckAt, lastCheckOk: true }))
    checkMock.mockResolvedValue(okCheck())

    const result = await runParkingHealthCheck({ venueId: 'v1', now: NOW, force: true })

    expect(result?.skipped).toBeUndefined()
    expect(checkMock).toHaveBeenCalled()
  })

  it('returns null when the venue has no config', async () => {
    configMock.findUnique.mockResolvedValue(null)
    await expect(runParkingHealthCheck({ venueId: 'missing', now: NOW })).resolves.toBeNull()
  })
})

describe('parkingHealthForVenue', () => {
  it('reports NOT CONFIGURED when no row exists', async () => {
    configMock.findUnique.mockResolvedValue(null)
    await expect(parkingHealthForVenue('v1', NOW)).resolves.toEqual({
      ok: false,
      stale: true,
      message: 'NOT CONFIGURED',
    })
  })

  it('reports a recent passing check as healthy', async () => {
    configMock.findUnique.mockResolvedValue({
      lastCheckAt: new Date('2026-11-12T15:10:00Z'),
      lastCheckOk: true,
      lastCheckMessage: 'FORM READY',
      venue: { timezone: 'Pacific/Auckland' },
    })
    await expect(parkingHealthForVenue('v1', NOW)).resolves.toEqual({
      ok: true,
      stale: false,
      message: 'FORM READY',
    })
  })

  it('marks yesterday’s check as stale', async () => {
    configMock.findUnique.mockResolvedValue({
      lastCheckAt: new Date('2026-11-11T15:10:00Z'),
      lastCheckOk: true,
      lastCheckMessage: 'FORM READY',
      venue: { timezone: 'Pacific/Auckland' },
    })
    const state = await parkingHealthForVenue('v1', NOW)
    expect(state.stale).toBe(true)
  })
})
