import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => {
  const db = {
    calendarEvent: { findFirst: vi.fn() },
    eventStaffing: { updateMany: vi.fn(), create: vi.fn() },
    openShift: { count: vi.fn(), createMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    openShiftClaim: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    position: { count: vi.fn() },
    staffPosition: { findMany: vi.fn() },
    staff: { findFirst: vi.fn() },
    shift: { create: vi.fn() },
    venue: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  }
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db))
  return { db }
})

vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import {
  saveEventStaffing,
  findStaffForEvent,
  claimOpenShift,
  withdrawOpenShiftClaim,
  reviewOpenShiftClaim,
  cancelOpenShift,
} from '@/lib/open-shifts.server'

const futureDay = () => new Date(Date.UTC(2030, 0, 15))

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db))
  db.calendarEvent.findFirst.mockResolvedValue({ id: 'ev1', startsAt: futureDay(), staffing: [] })
  db.eventStaffing.updateMany.mockResolvedValue({ count: 0 })
  db.eventStaffing.create.mockResolvedValue({})
  db.openShift.count.mockResolvedValue(0)
  db.openShift.createMany.mockResolvedValue({ count: 0 })
  db.position.count.mockResolvedValue(1)
  db.staffPosition.findMany.mockResolvedValue([{ positionId: 'pos1' }])
  db.venue.findFirst.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  db.openShiftClaim.findUnique.mockResolvedValue(null)
  db.openShiftClaim.create.mockResolvedValue({ id: 'claim1' })
  db.openShiftClaim.update.mockResolvedValue({})
  db.openShiftClaim.updateMany.mockResolvedValue({ count: 0 })
  db.shift.create.mockResolvedValue({ id: 'shift1' })
})

const validLine = {
  id: 'line1',
  positionId: 'pos1',
  label: null,
  count: 2,
  startTime: '17:00',
  endTime: '23:00',
  breakMinutes: 0,
  note: null,
}

describe('saveEventStaffing', () => {
  it('404s for an unknown event', async () => {
    db.calendarEvent.findFirst.mockResolvedValue(null)
    const res = await saveEventStaffing({ venueId: 'v1', calendarEventId: 'nope', lines: [] })
    expect(res).toMatchObject({ ok: false, status: 404 })
  })

  it('refuses to edit requirements while shifts are listed', async () => {
    db.openShift.count.mockResolvedValue(2)
    const res = await saveEventStaffing({ venueId: 'v1', calendarEventId: 'ev1', lines: [validLine] })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })

  it('rejects invalid lines', async () => {
    const res = await saveEventStaffing({
      venueId: 'v1',
      calendarEventId: 'ev1',
      lines: [{ ...validLine, startTime: 'nope' }],
    })
    expect(res.ok).toBe(false)
  })

  it('replaces the lines and returns them ordered', async () => {
    db.eventStaffing.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `saved-${data.sortOrder}`,
      ...data,
    }))
    const res = await saveEventStaffing({
      venueId: 'v1',
      calendarEventId: 'ev1',
      lines: [validLine, { ...validLine, positionId: null, label: 'barista', count: 1 }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(db.eventStaffing.updateMany).toHaveBeenCalled()
    expect(res.lines).toHaveLength(2)
    expect(res.lines[1].label).toBe('BARISTA')
  })
})

describe('findStaffForEvent', () => {
  it('requires at least one line', async () => {
    const res = await findStaffForEvent({ venueId: 'v1', calendarEventId: 'ev1', actorId: null })
    expect(res).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses to list twice', async () => {
    db.calendarEvent.findFirst.mockResolvedValue({
      id: 'ev1',
      startsAt: futureDay(),
      staffing: [{ ...validLine }],
    })
    db.openShift.count.mockResolvedValue(1)
    const res = await findStaffForEvent({ venueId: 'v1', calendarEventId: 'ev1', actorId: null })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })

  it('creates one seat per headcount on the event day', async () => {
    db.calendarEvent.findFirst.mockResolvedValue({
      id: 'ev1',
      startsAt: futureDay(),
      staffing: [{ ...validLine, count: 2 }],
    })
    const res = await findStaffForEvent({ venueId: 'v1', calendarEventId: 'ev1', actorId: 'mgr1' })
    expect(res).toEqual({ ok: true, created: 2 })
    const call = db.openShift.createMany.mock.calls[0][0]
    expect(call.data).toHaveLength(2)
    expect(call.data[0].date.toISOString()).toBe('2030-01-15T00:00:00.000Z')
    expect(call.data[0].positionId).toBe('pos1')
  })
})

describe('claimOpenShift', () => {
  const openShift = { id: 'os1', positionId: 'pos1', date: futureDay(), status: 'OPEN' }

  it('404s when the shift is missing', async () => {
    db.openShift.findFirst.mockResolvedValue(null)
    const res = await claimOpenShift({ venueId: 'v1', staffId: 'st1', openShiftId: 'os1' })
    expect(res).toMatchObject({ ok: false, status: 404 })
  })

  it('403s when the worker does not hold the role', async () => {
    db.openShift.findFirst.mockResolvedValue({ ...openShift, positionId: 'pos9' })
    const res = await claimOpenShift({ venueId: 'v1', staffId: 'st1', openShiftId: 'os1' })
    expect(res).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses a second pending claim', async () => {
    db.openShift.findFirst.mockResolvedValue(openShift)
    db.openShiftClaim.findUnique.mockResolvedValue({ id: 'claim1', status: 'PENDING' })
    const res = await claimOpenShift({ venueId: 'v1', staffId: 'st1', openShiftId: 'os1' })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })

  it('creates a pending claim for a matching role', async () => {
    db.openShift.findFirst.mockResolvedValue(openShift)
    const res = await claimOpenShift({ venueId: 'v1', staffId: 'st1', openShiftId: 'os1' })
    expect(res).toEqual({ ok: true, claimId: 'claim1' })
    expect(db.openShiftClaim.create).toHaveBeenCalled()
  })

  it('revives a previously declined claim', async () => {
    db.openShift.findFirst.mockResolvedValue(openShift)
    db.openShiftClaim.findUnique.mockResolvedValue({ id: 'claim1', status: 'DECLINED' })
    const res = await claimOpenShift({ venueId: 'v1', staffId: 'st1', openShiftId: 'os1' })
    expect(res.ok).toBe(true)
    expect(db.openShiftClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    )
  })
})

describe('withdrawOpenShiftClaim', () => {
  it('only withdraws the caller’s pending claim', async () => {
    db.openShiftClaim.updateMany.mockResolvedValue({ count: 1 })
    expect(await withdrawOpenShiftClaim('claim1', 'st1')).toBe(true)
    expect(db.openShiftClaim.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'claim1', staffId: 'st1', status: 'PENDING' })
  })
})

describe('reviewOpenShiftClaim', () => {
  const claim = {
    id: 'claim1',
    staffId: 'st1',
    status: 'PENDING',
    openShiftId: 'os1',
    openShift: { deletedAt: null, status: 'OPEN' },
  }

  it('declines with a stamped reviewer', async () => {
    db.openShiftClaim.findFirst.mockResolvedValue(claim)
    const res = await reviewOpenShiftClaim({ claimId: 'claim1', venueId: 'v1', actorId: 'mgr1', action: 'DECLINE' })
    expect(res).toEqual({ ok: true, shiftId: null })
    expect(db.openShiftClaim.update.mock.calls[0][0].data).toMatchObject({ status: 'DECLINED', reviewedById: 'mgr1' })
  })

  it('approving creates the DRAFT shift, fills the seat and declines the other claims', async () => {
    db.openShiftClaim.findFirst.mockResolvedValue(claim)
    db.openShift.findFirst.mockResolvedValue({
      id: 'os1',
      status: 'OPEN',
      deletedAt: null,
      positionId: 'pos1',
      date: futureDay(),
      startTime: '17:00',
      endTime: '23:00',
      breakMinutes: 0,
      note: null,
      position: { departmentId: 'dept1', colour: '#fff' },
    })
    db.staff.findFirst.mockResolvedValue({ id: 'st1', departmentId: 'dept2' })
    const res = await reviewOpenShiftClaim({ claimId: 'claim1', venueId: 'v1', actorId: 'mgr1', action: 'APPROVE' })
    expect(res).toEqual({ ok: true, shiftId: 'shift1' })
    expect(db.shift.create.mock.calls[0][0].data).toMatchObject({
      staffId: 'st1',
      status: 'DRAFT',
      tag: 'EVENT',
      departmentId: 'dept1',
      positionId: 'pos1',
    })
    expect(db.openShift.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FILLED', filledById: 'st1', filledShiftId: 'shift1' }) }),
    )
    expect(db.openShiftClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED', reviewNote: 'SHIFT FILLED BY ANOTHER' }) }),
    )
  })

  it('refuses to approve a seat that is no longer open', async () => {
    db.openShiftClaim.findFirst.mockResolvedValue(claim)
    db.openShift.findFirst.mockResolvedValue({ id: 'os1', status: 'FILLED', deletedAt: null })
    const res = await reviewOpenShiftClaim({ claimId: 'claim1', venueId: 'v1', actorId: 'mgr1', action: 'APPROVE' })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })

  it('409s an already-reviewed claim', async () => {
    db.openShiftClaim.findFirst.mockResolvedValue({ ...claim, status: 'APPROVED' })
    const res = await reviewOpenShiftClaim({ claimId: 'claim1', venueId: 'v1', actorId: 'mgr1', action: 'DECLINE' })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })
})

describe('cancelOpenShift', () => {
  it('refuses to cancel a filled seat', async () => {
    db.openShift.findFirst.mockResolvedValue({ id: 'os1', status: 'FILLED' })
    const res = await cancelOpenShift('os1', 'v1')
    expect(res).toMatchObject({ ok: false, status: 409 })
  })

  it('cancels an open seat and declines pending claims', async () => {
    db.openShift.findFirst.mockResolvedValue({ id: 'os1', status: 'OPEN' })
    const res = await cancelOpenShift('os1', 'v1')
    expect(res).toEqual({ ok: true })
    expect(db.openShift.update).toHaveBeenCalledWith({ where: { id: 'os1' }, data: { status: 'CANCELLED' } })
    expect(db.openShiftClaim.updateMany).toHaveBeenCalled()
  })
})
