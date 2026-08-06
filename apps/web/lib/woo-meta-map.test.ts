import { describe, it, expect } from 'vitest'
import {
  DEFAULT_META_MAP,
  resolveMetaMap,
  readMeta,
  parseServiceDate,
  parseServiceTime,
  parsePartySize,
  parseFulfillmentType,
  resolveOrderMeta,
} from '@/lib/woo-meta-map'

describe('readMeta', () => {
  const meta = [
    { key: 'Delivery Date', value: '2026-08-15' },
    { key: '_orddd_lite_timestamp', value: '1786752000' },
    { key: 'empty_one', value: '' },
    { key: 'null_one', value: null },
  ]

  it('finds a key ignoring case, spaces and underscores', () => {
    expect(readMeta(meta, ['delivery_date'])).toBe('2026-08-15')
    expect(readMeta(meta, ['DELIVERYDATE'])).toBe('2026-08-15')
    expect(readMeta(meta, ['Delivery-Date'])).toBe('2026-08-15')
  })

  it('respects candidate order', () => {
    expect(readMeta(meta, ['_orddd_lite_timestamp', 'delivery_date'])).toBe('1786752000')
    expect(readMeta(meta, ['delivery_date', '_orddd_lite_timestamp'])).toBe('2026-08-15')
  })

  it('skips missing, empty and null values', () => {
    expect(readMeta(meta, ['nope'])).toBeNull()
    expect(readMeta(meta, ['empty_one'])).toBeNull()
    expect(readMeta(meta, ['null_one'])).toBeNull()
    expect(readMeta(meta, ['empty_one', 'delivery_date'])).toBe('2026-08-15')
  })

  it('coerces non-string values', () => {
    expect(readMeta([{ key: 'party_size', value: 8 }], ['party_size'])).toBe('8')
  })

  it('survives a missing or malformed meta array', () => {
    expect(readMeta([], ['x'])).toBeNull()
    expect(readMeta(undefined as never, ['x'])).toBeNull()
    expect(readMeta([{ value: 'no key' }], ['x'])).toBeNull()
  })
})

describe('resolveMetaMap', () => {
  it('returns the defaults for null/garbage input', () => {
    expect(resolveMetaMap(null)).toEqual(DEFAULT_META_MAP)
    expect(resolveMetaMap('nonsense')).toEqual(DEFAULT_META_MAP)
    expect(resolveMetaMap(undefined)).toEqual(DEFAULT_META_MAP)
  })

  it('overrides only the fields supplied', () => {
    const out = resolveMetaMap({ serviceDate: ['my_key'] })
    expect(out.serviceDate).toEqual(['my_key'])
    expect(out.partySize).toEqual(DEFAULT_META_MAP.partySize)
  })

  it('accepts a bare string as a single key', () => {
    expect(resolveMetaMap({ partySize: 'headcount' }).partySize).toEqual(['headcount'])
  })

  it('treats an explicitly empty list as "never look this up"', () => {
    expect(resolveMetaMap({ allergens: [] }).allergens).toEqual([])
  })

  it('filters junk entries out of a list', () => {
    expect(resolveMetaMap({ serviceDate: ['ok', '', 42, null] }).serviceDate).toEqual(['ok'])
  })
})

describe('parseServiceDate', () => {
  it('parses a unix timestamp in seconds (Tyche format)', () => {
    // 2026-08-15T00:00:00Z
    expect(parseServiceDate('1786752000')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })

  it('parses a unix timestamp in milliseconds', () => {
    expect(parseServiceDate('1786752000000')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })

  it('parses ISO dates', () => {
    expect(parseServiceDate('2026-08-15')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
    expect(parseServiceDate('2026-08-15T18:30:00Z')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })

  it('parses day-first formats as day-first, not month-first', () => {
    // The whole point: 15/08 must not become 8 March.
    expect(parseServiceDate('15-08-2026')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
    expect(parseServiceDate('15/08/2026')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
    expect(parseServiceDate('5/8/2026')?.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })

  it('always anchors to UTC midnight', () => {
    const d = parseServiceDate('2026-08-15T23:45:00Z')!
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCDate()).toBe(15)
  })

  it('returns null for blanks and junk', () => {
    expect(parseServiceDate(null)).toBeNull()
    expect(parseServiceDate('')).toBeNull()
    expect(parseServiceDate('not a date')).toBeNull()
  })
})

describe('parseServiceTime', () => {
  it('parses 24h times', () => {
    expect(parseServiceTime('18:30')).toBe('18:30')
    expect(parseServiceTime('09:05')).toBe('09:05')
  })

  it('parses 12h times with meridiem', () => {
    expect(parseServiceTime('6:30 PM')).toBe('18:30')
    expect(parseServiceTime('6:30pm')).toBe('18:30')
    expect(parseServiceTime('9 AM')).toBe('09:00')
  })

  it('handles the midnight/noon edges', () => {
    expect(parseServiceTime('12:00 AM')).toBe('00:00')
    expect(parseServiceTime('12:00 PM')).toBe('12:00')
  })

  it('collapses a slot range to its start', () => {
    expect(parseServiceTime('6:00 PM - 6:30 PM')).toBe('18:00')
    expect(parseServiceTime('18:00 – 18:30')).toBe('18:00')
    expect(parseServiceTime('12:00 to 12:30')).toBe('12:00')
  })

  it('returns null for blanks and junk', () => {
    expect(parseServiceTime(null)).toBeNull()
    expect(parseServiceTime('anytime')).toBeNull()
    expect(parseServiceTime('99:99')).toBeNull()
  })
})

describe('parsePartySize', () => {
  it('parses plain and embedded numbers', () => {
    expect(parsePartySize('8')).toBe(8)
    expect(parsePartySize('8 guests')).toBe(8)
    expect(parsePartySize('Party of 12')).toBe(12)
  })

  it('rejects zero, blanks and junk', () => {
    expect(parsePartySize('0')).toBeNull()
    expect(parsePartySize(null)).toBeNull()
    expect(parsePartySize('lots')).toBeNull()
  })
})

describe('parseFulfillmentType', () => {
  it('recognises delivery', () => {
    expect(parseFulfillmentType('Delivery')).toBe('DELIVERY')
    expect(parseFulfillmentType('local delivery')).toBe('DELIVERY')
  })

  it('recognises pickup wording', () => {
    expect(parseFulfillmentType('Pickup')).toBe('PICKUP')
    expect(parseFulfillmentType('Click & Collect')).toBe('PICKUP')
    expect(parseFulfillmentType('Takeaway')).toBe('PICKUP')
  })

  it('recognises dine-in wording', () => {
    expect(parseFulfillmentType('Dine In')).toBe('DINE_IN')
    expect(parseFulfillmentType('table service')).toBe('DINE_IN')
  })

  it('returns null when it cannot tell, rather than guessing', () => {
    expect(parseFulfillmentType('something else')).toBeNull()
    expect(parseFulfillmentType(null)).toBeNull()
  })
})

describe('resolveOrderMeta', () => {
  it('reads a full HOSPO OPS plugin order with defaults', () => {
    const meta = [
      { key: '_hospo_service_date', value: '2026-08-15' },
      { key: '_hospo_service_time', value: '17:00' },
      { key: '_hospo_party_size', value: '8' },
      { key: '_hospo_service_id', value: '3130f7b3-e632-4794-ba41-fc4524b0fe7f' },
      { key: '_hospo_book_table', value: '1' },
    ]
    expect(resolveOrderMeta(meta)).toEqual({
      serviceDate: new Date('2026-08-15T00:00:00.000Z'),
      serviceTime: '17:00',
      partySize: 8,
      allergens: null,
      fulfillmentType: null,
      serviceId: '3130f7b3-e632-4794-ba41-fc4524b0fe7f',
      bookTable: true,
    })
  })

  it('no longer reads third-party plugin keys by default', () => {
    const meta = [
      { key: '_orddd_lite_timestamp', value: '1786752000' },
      { key: 'orddd_time_slot', value: '6:00 PM - 6:30 PM' },
      { key: 'party_size', value: '8' },
    ]
    expect(resolveOrderMeta(meta)).toEqual({
      serviceDate: null,
      serviceTime: null,
      partySize: null,
      allergens: null,
      fulfillmentType: null,
      serviceId: null,
      bookTable: false,
    })
  })

  it('reads the HOSPO OPS plugin fields', () => {
    const meta = [
      { key: '_hospo_service_date', value: '2026-08-15' },
      { key: '_hospo_service_time', value: '17:00' },
      { key: '_hospo_party_size', value: '6' },
      { key: '_hospo_service_id', value: '3130f7b3-e632-4794-ba41-fc4524b0fe7f' },
      { key: '_hospo_book_table', value: '1' },
    ]
    expect(resolveOrderMeta(meta)).toEqual({
      serviceDate: new Date('2026-08-15T00:00:00.000Z'),
      serviceTime: '17:00',
      partySize: 6,
      allergens: null,
      fulfillmentType: null,
      serviceId: '3130f7b3-e632-4794-ba41-fc4524b0fe7f',
      bookTable: true,
    })
  })

  it('treats book-table values loosely and false-y values as no', () => {
    expect(resolveOrderMeta([{ key: '_hospo_book_table', value: 'YES' }]).bookTable).toBe(true)
    expect(resolveOrderMeta([{ key: '_hospo_book_table', value: 'on' }]).bookTable).toBe(true)
    expect(resolveOrderMeta([{ key: '_hospo_book_table', value: '0' }]).bookTable).toBe(false)
    expect(resolveOrderMeta([{ key: '_hospo_book_table', value: 'no' }]).bookTable).toBe(false)
    expect(resolveOrderMeta([]).bookTable).toBe(false)
  })

  it('honours a custom mapping for a renamed plugin field', () => {
    // The scenario the whole mapping layer exists for.
    const meta = [{ key: 'When would you like it?', value: '2026-12-24' }]
    expect(resolveOrderMeta(meta).serviceDate).toBeNull()
    expect(
      resolveOrderMeta(meta, { serviceDate: ['When would you like it?'] }).serviceDate?.toISOString(),
    ).toBe('2026-12-24T00:00:00.000Z')
  })

  it('returns all-null for an order with no usable meta', () => {
    expect(resolveOrderMeta([])).toEqual({
      serviceDate: null,
      serviceTime: null,
      partySize: null,
      allergens: null,
      fulfillmentType: null,
      serviceId: null,
      bookTable: false,
    })
  })
})
