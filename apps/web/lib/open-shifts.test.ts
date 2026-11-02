import { describe, it, expect } from 'vitest'
import {
  validateStaffingLine,
  expandSeats,
  claimableForPositions,
  seatFillStatus,
  claimStatusMeta,
  pendingClaimCount,
  type StaffingLineInput,
} from '@/lib/open-shifts'

const baseLine: StaffingLineInput = {
  id: 'line-1',
  positionId: 'pos-1',
  label: null,
  count: 2,
  startTime: '17:00',
  endTime: '23:00',
  breakMinutes: 30,
  note: null,
  sortOrder: 0,
}

describe('validateStaffingLine', () => {
  it('accepts a valid position line', () => {
    const res = validateStaffingLine(baseLine)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toMatchObject({ positionId: 'pos-1', count: 2, startTime: '17:00' })
    }
  })

  it('uppercases a free-text label and allows it without a position', () => {
    const res = validateStaffingLine({ ...baseLine, positionId: null, label: 'dm / function manager' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.label).toBe('DM / FUNCTION MANAGER')
  })

  it('requires a position or a label', () => {
    const res = validateStaffingLine({ ...baseLine, positionId: null, label: '  ' })
    expect(res.ok).toBe(false)
  })

  it('rejects bad times and zero counts', () => {
    expect(validateStaffingLine({ ...baseLine, startTime: '25:00' }).ok).toBe(false)
    expect(validateStaffingLine({ ...baseLine, startTime: '09:00', endTime: '09:00' }).ok).toBe(false)
    expect(validateStaffingLine({ ...baseLine, count: 0 }).ok).toBe(false)
    expect(validateStaffingLine({ ...baseLine, count: 999 }).ok).toBe(false)
  })
})

describe('expandSeats', () => {
  it('creates one seat per headcount', () => {
    const seats = expandSeats([baseLine, { ...baseLine, id: 'line-2', count: 1, positionId: null, label: 'BARISTA' }])
    expect(seats).toHaveLength(3)
    expect(seats.filter((s) => s.staffingId === 'line-1')).toHaveLength(2)
    expect(seats[2]).toMatchObject({ staffingId: 'line-2', positionId: null, label: 'BARISTA' })
  })

  it('clamps counts to at least one seat', () => {
    const seats = expandSeats([{ ...baseLine, count: -3 }])
    expect(seats).toHaveLength(1)
  })
})

describe('claimableForPositions', () => {
  it('lets role-less shifts be claimed by anyone', () => {
    expect(claimableForPositions({ positionId: null, status: 'OPEN' }, [])).toBe(true)
  })

  it('requires the worker to hold the role', () => {
    expect(claimableForPositions({ positionId: 'pos-1', status: 'OPEN' }, ['pos-1'])).toBe(true)
    expect(claimableForPositions({ positionId: 'pos-1', status: 'OPEN' }, ['pos-2'])).toBe(false)
  })

  it('hides non-open seats', () => {
    expect(claimableForPositions({ positionId: null, status: 'FILLED' }, [])).toBe(false)
    expect(claimableForPositions({ positionId: null, status: 'CANCELLED' }, [])).toBe(false)
  })
})

describe('seatFillStatus', () => {
  it('counts filled against non-cancelled seats', () => {
    const status = seatFillStatus([{ status: 'FILLED' }, { status: 'OPEN' }, { status: 'CANCELLED' }])
    expect(status).toEqual({ filled: 1, total: 2 })
  })
})

describe('claim helpers', () => {
  it('labels claim statuses', () => {
    expect(claimStatusMeta('APPROVED').label).toBe('CONFIRMED')
    expect(claimStatusMeta('PENDING').tone).toBe('warn')
  })

  it('counts pending claims only', () => {
    expect(
      pendingClaimCount([{ status: 'PENDING' }, { status: 'APPROVED' }, { status: 'PENDING' }]),
    ).toBe(2)
  })
})
