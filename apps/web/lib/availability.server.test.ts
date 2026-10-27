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
  applyEditRequest,
  buildAvailabilityPayload,
  cancelPendingAvailability,
  clearAvailability,
  markEditRequestApplied,
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

describe('series day detach (THIS scope)', () => {
  const fixture = [
    { date: day('2026-10-01'), seriesEndDate: day('2026-10-22') },
    { date: day('2026-10-08'), seriesEndDate: day('2026-10-22') },
    { date: day('2026-10-15'), seriesEndDate: day('2026-10-22') },
    { date: day('2026-10-22'), seriesEndDate: day('2026-10-22') },
  ]

  it('plans a THIS edit as a standalone row', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce(fixture)
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-08', payload, repeat: null, scope: 'THIS', seriesId: 's1' },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toEqual(['2026-10-08'])
    expect(out.plan.seriesId).toBeNull()
    expect(out.plan.seriesEndDate).toBeNull()
    expect(out.plan.syncSeriesId).toBe('s1')
    expect(out.plan.syncSeriesEnd).toBe(false)
  })

  it('re-pins the series end when the final occurrence detaches', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce(fixture)
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-22', payload, repeat: null, scope: 'THIS', seriesId: 's1' },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.syncSeriesId).toBe('s1')
    expect(out.plan.syncSeriesEnd).toBe(true)
  })

  it('a worker FROM edit on the final occurrence still detaches and re-pins', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce(fixture)
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-22', payload, repeat: null, scope: 'FROM', seriesId: 's1' },
      { ...gate, forceScopeThis: true },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toEqual(['2026-10-22'])
    expect(out.plan.seriesId).toBeNull()
    expect(out.plan.syncSeriesId).toBe('s1')
    expect(out.plan.syncSeriesEnd).toBe(true)
  })

  it('does not re-pin an open-ended series when its last occurrence detaches', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([
      { date: day('2026-10-01'), seriesEndDate: null },
      { date: day('2026-10-08'), seriesEndDate: null },
    ])
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-08', payload, repeat: null, scope: 'THIS', seriesId: 's1' },
      gate,
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.syncSeriesEnd).toBe(false)
  })

  it('a THIS save writes the row without the series link', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce(fixture)
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-08', raw: payload, repeat: null, scope: 'THIS', seriesId: 's1', reason: null },
      gate,
    )
    expect(out).toMatchObject({ mode: 'SAVED' })
    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data.seriesId).toBeNull()
    expect(data.seriesEndDate).toBeNull()
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
    // Locked rows and confirmed block-outs / time off are protected.
    const where = db.staffAvailability.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { lockedAt: { not: null } },
      { status: 'APPROVED', timeOff: true },
      { status: 'APPROVED', type: 'UNAVAILABLE' },
    ])
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

describe('day-level locking', () => {
  const fixture = [
    { date: day('2026-10-15'), seriesEndDate: day('2026-10-29') },
    { date: day('2026-10-22'), seriesEndDate: day('2026-10-29') },
    { date: day('2026-10-29'), seriesEndDate: day('2026-10-29') },
  ]

  it('files a request when a worker writes a locked day', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ id: 'row1', status: 'APPROVED' }])
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      gate,
    )
    expect(out).toMatchObject({ mode: 'REQUEST', requestId: 'req1' })
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('files a request when a worker clears a locked day', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ id: 'row1', status: 'APPROVED' }])
    const out = await clearAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', scope: null, seriesId: null, reason: null },
      gate,
    )
    expect(out).toMatchObject({ mode: 'REQUEST' })
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('forceScopeThis turns a worker FROM/ALL series edit into a THIS detach', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce(fixture)
    const out = await planSet(
      { staffId: 'st1', dateKey: '2026-10-22', payload, repeat: null, scope: 'ALL', seriesId: 's1' },
      { ...gate, forceScopeThis: true },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.writeDates).toEqual(['2026-10-22'])
    expect(out.plan.seriesId).toBeNull()
    expect(out.plan.syncSeriesId).toBe('s1')
  })

  it('forceScopeThis turns a worker FROM/ALL clear into a THIS clear', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce(fixture)
    const out = await planClear(
      { staffId: 'st1', dateKey: '2026-10-22', scope: 'ALL', seriesId: 's1' },
      { ...gate, forceScopeThis: true },
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.plan.removeDates).toEqual(['2026-10-22'])
    expect(out.plan.scope).toBe('THIS')
  })

  it('refuses an admin single-day save on a locked day', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ date: day('2026-10-15') }])
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      adminGate,
    )
    expect(out).toEqual({ error: 'LOCKED — UNLOCK FIRST', locked: ['2026-10-15'] })
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('refuses an admin single-day clear on a locked day', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ date: day('2026-10-15') }])
    const out = await clearAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', scope: null, seriesId: null, reason: null },
      adminGate,
    )
    expect(out).toEqual({ error: 'LOCKED — UNLOCK FIRST', locked: ['2026-10-15'] })
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('an admin FROM/ALL series save skips locked occurrences and writes the rest', async () => {
    db.staffAvailability.findMany
      .mockResolvedValueOnce(fixture)
      .mockResolvedValueOnce([{ date: day('2026-10-22') }])
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: 'ALL', seriesId: 's1', reason: null },
      adminGate,
    )
    expect(out).toMatchObject({ mode: 'SAVED', skipped: ['2026-10-22'] })
    expect(db.staffAvailability.updateMany.mock.calls[0][0].where.date.in).toEqual([
      day('2026-10-15'),
      day('2026-10-29'),
    ])
  })

  it('stamps the lock fields when an admin saves with lockById', async () => {
    await saveAvailability(
      {
        staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null,
        reason: null, lockById: 'admin1', lockReason: 'CONFIRMED',
      },
      adminGate,
    )
    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data.lockedAt).toBeInstanceOf(Date)
    expect(data.lockedById).toBe('admin1')
    expect(data.lockedReason).toBe('CONFIRMED')
  })
})

describe('weekly request cut-off', () => {
  const cutoffGate = { ...gate, cutoff: { day: 4, time: '17:00' }, nowMinutes: 10 * 60 }

  it('files a request for a week past its cut-off even with no approved rows', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-11', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      cutoffGate,
    )
    expect(out).toMatchObject({ mode: 'REQUEST', requestId: 'req1' })
    expect(db.availabilityEditRequest.create).toHaveBeenCalledTimes(1)
    expect(db.staffAvailability.findMany).not.toHaveBeenCalled()
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })

  it('still writes a week before its cut-off', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      cutoffGate,
    )
    expect(out).toMatchObject({ mode: 'SAVED' })
    expect(db.availabilityEditRequest.create).not.toHaveBeenCalled()
  })

  it('flips to request mode once the deadline time passes', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: { isAllDay: true, type: 'AVAILABLE' }, repeat: null, scope: null, seriesId: null, reason: null },
      { ...cutoffGate, nowMinutes: 18 * 60 },
    )
    expect(out).toMatchObject({ mode: 'REQUEST' })
  })

  it('files a clear request for a day past its cut-off', async () => {
    const out = await clearAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-11', scope: null, seriesId: null, reason: null },
      cutoffGate,
    )
    expect(out).toMatchObject({ mode: 'REQUEST' })
    expect(db.availabilityEditRequest.create).toHaveBeenCalledTimes(1)
  })

  it('admin bypass ignores the cut-off', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-11', raw: payload, repeat: null, scope: null, seriesId: null, reason: null },
      { ...adminGate, cutoff: { day: 4, time: '17:00' }, nowMinutes: 18 * 60 },
    )
    expect(out).toMatchObject({ mode: 'SAVED' })
  })
})

describe('availability notes', () => {
  const rawNote = { isAllDay: true, type: 'UNAVAILABLE', notes: '  NEED SUNDAY OFF  ' }

  it('writes the note on a normal saved day', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: rawNote, repeat: null, scope: null, seriesId: null, reason: null },
      gate,
    )
    expect(out).toMatchObject({ mode: 'SAVED' })
    expect(db.staffAvailability.updateMany.mock.calls[0][0].data.notes).toBe('NEED SUNDAY OFF')
  })

  it('carries the note into an edit request and mirrors it as the reason', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ id: 'row1', status: 'APPROVED' }])

    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: rawNote, repeat: null, scope: null, seriesId: null, reason: null },
      gate,
    )

    expect(out).toMatchObject({ mode: 'REQUEST', requestId: 'req1' })
    const data = db.availabilityEditRequest.create.mock.calls[0][0].data
    expect(data.payload.availability.notes).toBe('NEED SUNDAY OFF')
    expect(data.reason).toBe('NEED SUNDAY OFF')
  })

  it('writes the note on an admin override', async () => {
    await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: rawNote, repeat: null, scope: null, seriesId: null, reason: null },
      adminGate,
    )
    expect(db.staffAvailability.updateMany.mock.calls[0][0].data.notes).toBe('NEED SUNDAY OFF')
  })

  it('copies the note to every occurrence of a series', async () => {
    const out = await saveAvailability(
      { staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', raw: rawNote, repeat: { weeks: 3 }, scope: null, seriesId: null, reason: null },
      gate,
    )

    expect(out).toMatchObject({ mode: 'SAVED' })
    expect(db.staffAvailability.updateMany.mock.calls[0][0].data.notes).toBe('NEED SUNDAY OFF')
    const created = db.staffAvailability.createMany.mock.calls[0][0].data
    expect(created).toHaveLength(3)
    expect(created.every((row: { notes: string | null }) => row.notes === 'NEED SUNDAY OFF')).toBe(true)
  })

  it('preserves the note when an edit request is applied', async () => {
    db.availabilityEditRequest.findUnique.mockResolvedValueOnce({
      id: 'r1',
      staffId: 'st1',
      venueId: 'v1',
      status: 'PENDING',
      deletedAt: null,
      action: 'SET',
      payload: {
        action: 'SET',
        anchor: '2026-10-15',
        scope: 'THIS',
        availability: { isAllDay: true, type: 'UNAVAILABLE', windows: [], timeOff: false, notes: 'NEED SUNDAY OFF' },
        writeDates: ['2026-10-15'],
        removeDates: [],
        seriesId: null,
        syncSeriesId: null,
        seriesEndDate: null,
        syncSeriesEnd: false,
      },
    })

    expect(await applyEditRequest('r1', 'admin1')).toBe(true)
    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data.notes).toBe('NEED SUNDAY OFF')
    // Applying a request is a manager confirmation: the day locks.
    expect(data.lockedAt).toBeInstanceOf(Date)
    expect(data.lockedById).toBe('admin1')
  })

  it('marks a request APPLIED without executing its stored plan', async () => {
    db.availabilityEditRequest.findUnique.mockResolvedValueOnce({
      id: 'r1', staffId: 'st1', venueId: 'v1', status: 'PENDING', deletedAt: null, action: 'SET', payload: {},
    })

    expect(await markEditRequestApplied('r1', 'admin1', 'OVERRODE MANUALLY')).toBe(true)
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
    expect(db.staffAvailability.createMany).not.toHaveBeenCalled()
    const update = db.availabilityEditRequest.update.mock.calls[0][0]
    expect(update.data).toMatchObject({ status: 'APPLIED', reviewedById: 'admin1', reviewNote: 'OVERRODE MANUALLY' })
  })

  it('does not mark an already resolved request applied', async () => {
    db.availabilityEditRequest.findUnique.mockResolvedValueOnce({
      id: 'r1', staffId: 'st1', status: 'APPLIED', deletedAt: null,
    })

    expect(await markEditRequestApplied('r1', 'admin1')).toBe(false)
    expect(db.availabilityEditRequest.update).not.toHaveBeenCalled()
  })
})

describe('cancelPendingAvailability / withdrawEditRequest', () => {
  it('cancels pending declarations by id', async () => {
    db.staffAvailability.updateMany.mockResolvedValueOnce({ count: 2 })
    const count = await cancelPendingAvailability({ venueId: 'v1', ids: ['a1', 'a2'] })

    expect(count).toBe(2)
    const call = db.staffAvailability.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ id: { in: ['a1', 'a2'] }, venueId: 'v1', deletedAt: null, status: 'PENDING', lockedAt: null })
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
