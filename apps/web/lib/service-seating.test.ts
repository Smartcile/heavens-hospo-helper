import { describe, expect, it } from 'vitest'
import { planSeatingOnTables, type ServicePlanTable } from './service-seating'

const round8 = (id: string, n?: string | null): ServicePlanTable => ({
  id, furnitureKey: 'r8', capacity: 8, chairCount: 8, width: 120, depth: 120, assignedNumber: n ?? null,
})
const square4 = (id: string, n?: string | null): ServicePlanTable => ({
  id, furnitureKey: 's4', capacity: 4, chairCount: 4, width: 80, depth: 80, assignedNumber: n ?? null,
})
const free = (id: string, key: string | null, cap: number): ServicePlanTable => ({
  id, furnitureKey: key, capacity: cap, chairCount: cap, width: 100, depth: 100, assignedNumber: null,
})

describe('planSeatingOnTables', () => {
  it('returns NO_TABLES on an empty plan', () => {
    expect(planSeatingOnTables([], new Set(), 4)).toEqual({ ok: false, reason: 'NO_TABLES' })
  })

  it('returns ALL_OCCUPIED when every table is taken', () => {
    const tables = [round8('a'), square4('b')]
    expect(planSeatingOnTables(tables, new Set(['a', 'b']), 4)).toEqual({ ok: false, reason: 'ALL_OCCUPIED' })
  })

  it('picks the exact fit — two 8-tops for 16 guests', () => {
    const tables = [round8('a', '1'), round8('b', '2'), square4('c')]
    const r = planSeatingOnTables(tables, new Set(), 16)
    expect(r).toEqual({ ok: true, itemIds: expect.arrayContaining(['a', 'b']) })
    expect(r.ok && r.itemIds).toHaveLength(2)
  })

  it('overfills with the smallest table that can still place', () => {
    const tables = [round8('a', '1'), round8('b', '2'), square4('c')]
    const r = planSeatingOnTables(tables, new Set(), 10)
    expect(r).toEqual({ ok: true, itemIds: ['a', 'c'] })
  })

  it('ignores occupied tables but still seats from the rest', () => {
    const tables = [round8('a'), round8('b'), square4('c')]
    const r = planSeatingOnTables(tables, new Set(['b']), 12)
    expect(r).toEqual({ ok: true, itemIds: ['a', 'c'] })
  })

  it('prefers the item holding the assigned number when matching placements', () => {
    const tables = [round8('a', '1'), round8('b', '2')]
    const r = planSeatingOnTables(tables, new Set(['a']), 8)
    // 'a' holds number 1 but is occupied — the placement (number 1) must fall
    // through to the other 8-top instead of failing.
    expect(r).toEqual({ ok: true, itemIds: ['b'] })
  })

  it('returns NO_FIT when the party exceeds total capacity', () => {
    const tables = [round8('a'), round8('b'), round8('c')]
    expect(planSeatingOnTables(tables, new Set(), 40)).toEqual({ ok: false, reason: 'NO_FIT' })
  })

  it('skips furniture-less tables — a plan of only those seats nobody', () => {
    const tables = [free('a', null, 6), free('b', null, 6)]
    expect(planSeatingOnTables(tables, new Set(), 12)).toEqual({ ok: false, reason: 'NO_TABLES' })
  })

  it('seats around furniture-less tables without ever picking them', () => {
    const tables = [round8('a'), free('ghost', null, 6)]
    expect(planSeatingOnTables(tables, new Set(), 8)).toEqual({ ok: true, itemIds: ['a'] })
  })

  it('never hands out a table twice', () => {
    const tables = [round8('a'), round8('b'), square4('c')]
    const r = planSeatingOnTables(tables, new Set(), 20)
    expect(r).toEqual({ ok: true, itemIds: ['a', 'b', 'c'] })
    expect(r.ok && new Set(r.itemIds).size).toBe(3)
  })

  it('treats furniture with only occupied items as unplaceable', () => {
    const tables = [round8('a', '1'), round8('b', '2'), square4('c')]
    // Both 8-tops occupied: a party of 8 must not squeeze onto the 4-top.
    const r = planSeatingOnTables(tables, new Set(['a', 'b']), 8)
    expect(r).toEqual({ ok: false, reason: 'NO_FIT' })
  })
})
