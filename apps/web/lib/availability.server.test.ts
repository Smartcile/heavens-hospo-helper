import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => {
  const db = {
    staffAvailability: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      groupBy: vi.fn(),
    },
    availabilityEditRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  }
  return { db }
})

vi.mock('@hospo-ops/db', () => ({ prisma: db, Prisma: { DbNull: null } }))

import {
  buildAvailabilityPayload,
  cancelPendingAvailability,
  clearAvailability,
  planClear,
  planSet,
  saveAvailability,
  withdrawEditRequest,
  type AvailabilityPayload,
} from '@/lib/availability.server'
import { SERIES_HORIZON_WEEKS } from '@/lib/availability'

const day = (key: string) => new Date(`${key}T00:00:00Z`)

const gate = { todayKey: '2026-10-08', lockDays: 0, bypass: false }
const adminGate = { todayKey: '2026-10-08', lockDays: 0, bypass: true }

const payload: AvailabilityPayload = {
  isAllDay: true,
  type: 'UNAVAILABLE',
  windows: [],
  timeOff: false,
  notes: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  db.staffAvailability.findMany.mockResolvedValue([])
  db.staffAvailability.findUnique.mockResolvedValue(null)
  db.staffAvailability.updateMany.mockResolvedValue({ count: 0 })
  db.staffAvailability.createMany.mockResolvedValue({ count: 0 })
  db.availabilityEditRequest.create.mockResolvedValue({ id: 'req1' })
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db))
})

describe('buildAvailabilityPayload', () => {
  it('rejects an invalid all-day state and empty windows', () => {
    expect(buildAvailabilityPayload({ isAllDay: true, type: 'PREFERRED' })).toEqual({ ok: false, error: 'CHOOSE AVAILABLE OR UNAVAILABLE' })
    expect(buildAvailabilityPayload({ isAllDay: false, windows: [] })).toEqual({ ok: false, error: 'ADD AT LEAST ONE TIME WINDOW' })
  })

  it('auto-complements windowed days', () => {
    const out = buildAvailabilityPayload({ isAllDay: false, windows: [{ type: 'AVAILABLE', startTime: '07:00', endTime: '15:00' }] })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.payload.windows).toEqual([
      { type: 'UNAVAILABLE', startTime: '00:00', endTime: '07:00' },
      { type: 'AVAILABLE', startTime: '07:00', endTime: '15:00' },
      { type: 'UNAVAILABLE', startTime: '15:00', endTime: '24:00' },
    ])
    expect(out.payload.type).toBe('UNAVAILABLE')
  })
})

describe('planSet / planClear', () => {
  it('plans a standalone future day', async () => {
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-15', payload, repeat: null, scope: null, seriesId: null },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toEqual(['2026-10-15'])
    expect(out.plan.seriesId).toBeNull()
    expect(out.plan.syncSeriesEnd).toBe(false)
  })

  it('refuses a past or locked standalone day for workers', async () => {
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-01', payload, repeat: null, scope: null, seriesId: null },
      gate,
    )
    expect(out).toEqual({ ok: false, error: 'THIS DAY IS IN THE PAST OR LOCKED' })
  })

  it('materialises a new weekly series with an end date', async () => {
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-15', payload, repeat: { weeks: 3 }, scope: null, seriesId: null },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toEqual(['2026-10-15', '2026-10-22', '2026-10-29'])
    expect(out.plan.seriesId).toBeTruthy()
    expect(out.plan.seriesEndDate).toBe('2026-10-29')
  })

  it('materialises a no-end series to the horizon', async () => {
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-15', payload, repeat: { noEnd: true }, scope: null, seriesId: null },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toHaveLength(SERIES_HORIZON_WEEKS)
    expect(out.plan.seriesEndDate).toBeNull()
  })

  it('a FROM edit skips past occurrences and trims when the series shrinks', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([
      { date: day('2026-09-24'), seriesEndDate: day('2026-11-05') },
      { date: day('2026-10-01'), seriesEndDate: day('2026-11-05') },
      { date: day('2026-10-15'), seriesEndDate: day('2026-11-05') },
      { date: day('2026-10-22'), seriesEndDate: day('2026-11-05') },
      { date: day('2026-10-29'), seriesEndDate: day('2026-11-05') },
    ])
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-15', payload, repeat: { weeks: 2 }, scope: 'FROM', seriesId: 's1' },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toEqual(['2026-10-15', '2026-10-22'])
    expect(out.plan.removeDates).toEqual(['2026-10-29'])
    expect(out.plan.seriesEndDate).toBe('2026-10-22')
    expect(out.plan.syncSeriesEnd).toBe(true)
  })

  it('a FROM clear leaves the earlier series intact and patches its end', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([
      { date: day('2026-10-01'), seriesEndDate: null },
      { date: day('2026-10-15'), seriesEndDate: null },
      { date: day('2026-10-22'), seriesEndDate: null },
    ])
    const out = await planClear(
      { staffId: 'st1', dateKey: '2026-10-15', scope: 'FROM', seriesId: 's1' },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.removeDates).toEqual(['2026-10-15', '2026-10-22'])
    expect(out.plan.syncSeriesEnd).toBe(true)
  })
})

describe('saveAvailability approval rules', () => {
  it('files an edit request when an APPROVED day is touched', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ id: 'row1', status: 'APPROVED' }])

    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null, reason: 'SWAP' },
      gate,
    )

    expect(out).toMatchObject({ mode: 'REQUEST', requestId: 'req1' })
    // Only confirmed block-outs / time off are protected.
    const where = db.staffAvailability.findMany.mock.calls[0][0].where
    expect(where.status).toBe('APPROVED')
    expect(where.OR).toEqual([{ timeOff: true }, { type: 'UNAVAILABLE' }])
    expect(db.availabilityEditRequest.create).toHaveBeenCalledTimes(1)
    const create = db.availabilityEditRequest.create.mock.calls[0][0]
    expect(create.data.action).toBe('SET')
    expect(create.data.reason).toBe('SWAP')
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('writes an unapproved block-out directly as PENDING', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      gate,
    )

    expect(out).toMatchObject({ mode: 'SAVED' })
    expect(db.availabilityEditRequest.create).not.toHaveBeenCalled()
    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data.status).toBe('PENDING')
    expect(data.segments).toBeNull()
  })

  it('auto-approves a pure available day', async () => {
    const raw = { isAllDay: true, type: 'AVAILABLE' }
    await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw, repeat: null, scope: null, seriesId: null, reason: null },
      gate,
    )
    expect(db.staffAvailability.updateMany.mock.calls[0][0].data.status).toBe('APPROVED')
  })

  it('an admin bypass skips the request path and stamps APPROVED', async () => {
    await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      adminGate,
    )
    expect(db.availabilityEditRequest.create).not.toHaveBeenCalled()
    expect(db.staffAvailability.updateMany).toHaveBeenCalled()
    expect(db.staffAvailability.updateMany.mock.calls[0][0].data.status).toBe('APPROVED')
  })

  it('files a clear request for an approved day', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ id: 'row1', status: 'APPROVED' }])
    const out = await clearAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', scope: null, seriesId: null, reason: null },
      gate,
    )
    expect(out).toMatchObject({ mode: 'REQUEST' })
    const plan = db.availabilityEditRequest.create.mock.calls[0][0].data.payload
    expect(plan.action).toBe('CLEAR')
    expect(plan.removeDates).toEqual(['2026-10-15'])
  })
})

describe('cancelPendingAvailability / withdrawEditRequest', () => {
  it('cancels pending declarations by id', async () => {
    db.staffAvailability.updateMany.mockResolvedValueOnce({ count: 2 })
    const count = await cancelPendingAvailability({ venueId: 'v1', ids: ['a1', 'a2'] })

    expect(count).toBe(2)
    const call = db.staffAvailability.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ id: { in: ['a1', 'a2'] }, venueId: 'v1', deletedAt: null, status: 'PENDING' })
    expect(call.data.deletedAt).toBeInstanceOf(Date)
  })

  it('cancels a whole pending series when no ids are given', async () => {
    db.staffAvailability.updateMany.mockResolvedValueOnce({ count: 3 })
    const count = await cancelPendingAvailability({ venueId: 'v1', staffId: 'st1', seriesId: 's1' })

    expect(count).toBe(3)
    expect(db.staffAvailability.updateMany.mock.calls[0][0].where)
      .toMatchObject({ seriesId: 's1', staffId: 'st1', status: 'PENDING' })
  })

  it('cancels nothing without an id or a series target', async () => {
    expect(await cancelPendingAvailability({ venueId: 'v1' })).toBe(0)
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('withdraws the worker\'s own pending request', async () => {
    db.availabilityEditRequest.findUnique.mockResolvedValueOnce({ id: 'r1', staffId: 'st1', status: 'PENDING', deletedAt: null })
    expect(await withdrawEditRequest('r1', 'st1')).toBe(true)
    const data = db.availabilityEditRequest.update.mock.calls[0][0].data
    expect(data.status).toBe('DISCARDED')
    expect(data.deletedAt).toBeInstanceOf(Date)
  })

  it('refuses another worker\'s request or an already-resolved one', async () => {
    db.availabilityEditRequest.findUnique.mockResolvedValueOnce({ id: 'r1', staffId: 'st2', status: 'PENDING', deletedAt: null })
    expect(await withdrawEditRequest('r1', 'st1')).toBe(false)

    db.availabilityEditRequest.findUnique.mockResolvedValueOnce({ id: 'r1', staffId: 'st1', status: 'APPLIED', deletedAt: null })
    expect(await withdrawEditRequest('r1', 'st1')).toBe(false)
    expect(db.availabilityEditRequest.update).not.toHaveBeenCalled()
  })
})
