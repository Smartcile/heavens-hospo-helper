import { describe, it, expect } from 'vitest'
import {
  docketWindow,
  normaliseDocketMinutes,
  parseKitchenDockets,
} from '@/lib/swiftpos-dockets'

describe('parseKitchenDockets', () => {
  it('reads the bare array (camelCase) with nested lines', () => {
    const dockets = parseKitchenDockets([
      {
        transactionId: 9001,
        tableNumber: 12,
        tableName: 'Table 12',
        booking: 'SMITH',
        covers: 4,
        clerk: '7 (Jane)',
        terminal: 'BAR',
        opened: '2026-10-27 18:03:12',
        lines: [
          { detailId: 1, addedAt: '2026-10-27 18:04:00', inventoryCode: 'STEAK', description: 'Steak', quantity: 2, value: 60, seat: 2, clerk: 7, printGroup: 'GRILL', pluText: 'STEAK', system: false, instruction: false },
          { detailId: 2, addedAt: '2026-10-27 18:04:00', inventoryCode: '', description: 'No sauce', quantity: 0, value: 0, seat: null, clerk: 7, printGroup: 'GRILL', pluText: '', system: false, instruction: true },
        ],
      },
    ])
    expect(dockets).toHaveLength(1)
    expect(dockets[0]).toMatchObject({ transactionId: 9001, booking: 'SMITH', covers: 4, opened: '2026-10-27 18:03:12' })
    expect(dockets[0].lines[0]).toMatchObject({ description: 'Steak', quantity: 2, seat: 2, printGroup: 'GRILL' })
    expect(dockets[0].lines[1]).toMatchObject({ instruction: true, description: 'No sauce' })
  })

  it('reads PascalCase and keeps unzoned timestamps as strings', () => {
    const dockets = parseKitchenDockets([
      { TransactionId: 5, TableNumber: 2, Opened: '2026-10-27 09:00:00', Lines: [{ DetailID: 9, AddedAt: '2026-10-27 09:01:00', Description: 'Beer', Qty: '2', Value: '14', Instruction: 1 }] },
    ])
    expect(dockets[0].transactionId).toBe(5)
    expect(dockets[0].opened).toBe('2026-10-27 09:00:00')
    expect(dockets[0].lines[0]).toMatchObject({ addedAt: '2026-10-27 09:01:00', quantity: 2, instruction: true })
  })

  it('tolerates missing lines and drops malformed rows', () => {
    const dockets = parseKitchenDockets([
      { transactionId: 1, tableNumber: 1 },
      { tableNumber: 3 },
      null,
      'nope',
      { transactionId: 2, lines: [null, { description: 'x' }] },
    ])
    expect(dockets.map((d) => d.transactionId)).toEqual([1, 2])
    expect(dockets[0].lines).toEqual([])
    expect(dockets[1].lines).toHaveLength(1)
  })

  it('returns an empty list for non-array payloads', () => {
    expect(parseKitchenDockets({ dockets: [] })).toEqual([])
    expect(parseKitchenDockets(null)).toEqual([])
  })
})

describe('docketWindow', () => {
  it('formats venue-local wall-clock strings and crosses midnight', () => {
    const now = Date.UTC(2026, 9, 27, 0, 30, 0) // 00:30 UTC
    expect(docketWindow(now, 'UTC', 60)).toEqual({ from: '2026-10-26 23:30', to: '2026-10-27 00:30' })
  })

  it('uses the venue timezone, not the server timezone', () => {
    const now = Date.UTC(2026, 5, 1, 0, 30, 0) // June → NZST (UTC+12)
    expect(docketWindow(now, 'Pacific/Auckland', 30)).toEqual({ from: '2026-06-01 12:00', to: '2026-06-01 12:30' })
  })

  it('returns a null from when every open line is requested', () => {
    expect(docketWindow(Date.UTC(2026, 9, 27, 3, 4, 5), 'UTC', 0)).toEqual({ from: null, to: '2026-10-27 03:04' })
  })
})

describe('normaliseDocketMinutes', () => {
  it('accepts the supported windows and falls back to 60', () => {
    expect([30, 60, 120, 0].map((n) => normaliseDocketMinutes(n))).toEqual([30, 60, 120, 0])
    expect(normaliseDocketMinutes('30')).toBe(30)
    expect(normaliseDocketMinutes('999')).toBe(60)
    expect(normaliseDocketMinutes(null)).toBe(60)
  })
})
