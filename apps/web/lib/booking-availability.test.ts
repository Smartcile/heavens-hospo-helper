import { describe, it, expect } from 'vitest'
import { checkAvailability } from './booking-availability'

const slot = { date: '2026-07-20', startTime: '18:00', endTime: '20:00' }

const t1 = { id: 't1', profile: { id: 'p1', name: 'TABLE 4', capacity: 4, chairCount: 4, width: 80, depth: 80, colour: '#fff' }, assignedNumber: '1' }
const t2 = { id: 't2', profile: { id: 'p2', name: 'TABLE 6', capacity: 6, chairCount: 6, width: 100, depth: 100, colour: '#fff' }, assignedNumber: '2' }
const t3 = { id: 't3', profile: { id: 'p3', name: 'TABLE 2', capacity: 2, chairCount: 2, width: 60, depth: 60, colour: '#fff' }, assignedNumber: '3' }

const setup: any = { id: 's1', name: 'MAIN ROOM', tables: [t1, t2, t3] }

describe('checkAvailability', () => {
  it('returns all tables free when no bookings', () => {
    const r = checkAvailability(slot, 4, [setup], [])
    expect(r[0].available).toBe(true)
    expect(r[0].availableTableCount).toBe(3)
    expect(r[0].totalCapacity).toBe(12)
  })

  it('marks a setup unavailable when party too large', () => {
    const r = checkAvailability(slot, 20, [setup], [])
    expect(r[0].available).toBe(false)
  })

  it('removes booked tables from availability', () => {
    const bookings = [{ id: 'b1', date: '2026-07-20', startTime: '18:00', endTime: '20:00', partySize: 4, tables: [{ setupItemId: 't1' }] }]
    const r = checkAvailability(slot, 4, [setup], bookings)
    expect(r[0].availableTableCount).toBe(2)
    expect(r[0].totalCapacity).toBe(8)
    expect(r[0].available).toBe(true)
  })

  it('marks unavailable when booked tables reduce capacity below party size', () => {
    const bookings = [
      { id: 'b1', date: '2026-07-20', startTime: '18:00', endTime: '20:00', partySize: 4, tables: [{ setupItemId: 't1' }] },
      { id: 'b2', date: '2026-07-20', startTime: '18:00', endTime: '20:00', partySize: 6, tables: [{ setupItemId: 't2' }] },
    ]
    const r = checkAvailability(slot, 4, [setup], bookings)
    expect(r[0].available).toBe(false)
  })

  it('non-overlapping booking does not affect availability', () => {
    const bookings = [{ id: 'b1', date: '2026-07-20', startTime: '14:00', endTime: '16:00', partySize: 4, tables: [{ setupItemId: 't1' }] }]
    const r = checkAvailability(slot, 4, [setup], bookings)
    expect(r[0].availableTableCount).toBe(3)
  })

  it('adjacent non-overlapping booking is free', () => {
    const bookings = [{ id: 'b1', date: '2026-07-20', startTime: '20:00', endTime: '22:00', partySize: 4, tables: [{ setupItemId: 't1' }] }]
    const r = checkAvailability(slot, 4, [setup], bookings)
    expect(r[0].availableTableCount).toBe(3)
  })

  it('different date does not conflict', () => {
    const bookings = [{ id: 'b1', date: '2026-07-21', startTime: '18:00', endTime: '20:00', partySize: 4, tables: [{ setupItemId: 't1' }] }]
    const r = checkAvailability(slot, 4, [setup], bookings)
    expect(r[0].availableTableCount).toBe(3)
  })
})
