/*
 * WooCommerce `meta_data` field mapping.
 *
 * Order date, time slot, party size and allergy notes all arrive as custom meta
 * on the order, and the key depends entirely on which plugin is installed and
 * how its fields were labelled. Tyche's delivery-date plugin, for instance,
 * exposes the value under the label configured in its own settings — so any
 * hardcoded key breaks silently the moment someone renames a field.
 *
 * Each field maps to an ordered list of candidate keys; the first one present
 * on the order wins. Matching is case-insensitive and ignores underscores and
 * spaces, so "Delivery Date", "delivery_date" and "deliverydate" are one key.
 */

export interface WooMetaMap {
  serviceDate: string[]
  serviceTime: string[]
  partySize: string[]
  allergens: string[]
  fulfillmentType: string[]
}

export const DEFAULT_META_MAP: WooMetaMap = {
  serviceDate: [
    '_orddd_lite_timestamp', // Order Delivery Date for WooCommerce – Lite
    '_orddd_timestamp', // Order Delivery Date Pro
    'delivery_date',
    'pickup_date',
    'fulfillment_date',
    'event_date',
  ],
  serviceTime: [
    'orddd_time_slot',
    '_orddd_timeslot',
    'delivery_time',
    'pickup_time',
    'time_slot',
  ],
  partySize: ['party_size', 'guests', 'number_of_guests', 'pax'],
  allergens: ['allergies', 'allergens', 'dietary_requirements', 'dietary'],
  fulfillmentType: ['fulfillment_type', 'order_type', 'service_type'],
}

export const META_MAP_FIELDS: (keyof WooMetaMap)[] = [
  'serviceDate',
  'serviceTime',
  'partySize',
  'allergens',
  'fulfillmentType',
]

export interface WooMetaEntry {
  key?: string
  value?: unknown
}

/** Collapse a key to its comparable form: lowercase, no spaces/underscores/dashes. */
function canonical(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, '')
}

/** Merge a stored (possibly partial) map over the defaults. */
export function resolveMetaMap(stored: unknown): WooMetaMap {
  const out: WooMetaMap = { ...DEFAULT_META_MAP }
  if (!stored || typeof stored !== 'object') return out

  for (const field of META_MAP_FIELDS) {
    const raw = (stored as Record<string, unknown>)[field]
    if (Array.isArray(raw)) {
      const keys = raw.filter((k): k is string => typeof k === 'string' && k.trim() !== '')
      // An explicitly empty list means "never look this up" — respect it.
      out[field] = keys
    } else if (typeof raw === 'string' && raw.trim() !== '') {
      out[field] = [raw.trim()]
    }
  }

  return out
}

/** First candidate key present on the order, or null. */
export function readMeta(meta: WooMetaEntry[], keys: string[]): string | null {
  if (!Array.isArray(meta)) return null
  const wanted = keys.map(canonical)

  for (const want of wanted) {
    const hit = meta.find((m) => typeof m?.key === 'string' && canonical(m.key) === want)
    if (hit && hit.value != null) {
      const v = typeof hit.value === 'string' ? hit.value.trim() : String(hit.value)
      if (v !== '') return v
    }
  }

  return null
}

/*
 * Dates arrive as unix timestamps (Tyche writes seconds), ISO strings, or
 * human formats like "15-08-2026". Returned anchored to UTC midnight so it
 * lands on the right calendar day regardless of server timezone.
 */
export function parseServiceDate(raw: string | null): Date | null {
  if (!raw) return null
  const trimmed = raw.trim()

  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10)
    // Seconds vs milliseconds — anything below ~1e11 is seconds.
    const ms = n < 100000000000 ? n * 1000 : n
    const d = new Date(ms)
    if (isNaN(d.getTime())) return null
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  }

  // Day-first formats (15-08-2026, 15/08/2026) — Woo plugins commonly emit
  // these and `new Date()` would read them as month-first or fail.
  const dayFirst = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dayFirst) {
    const [, d, m, y] = dayFirst
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return isNaN(date.getTime()) ? null : date
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, y, m, d] = iso
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(trimmed)
  if (isNaN(parsed.getTime())) return null
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  )
}

/*
 * Times arrive as "18:30", "6:30 PM", or a slot like "6:00 PM - 6:30 PM".
 * Slots collapse to their start — that is when the order is wanted.
 */
export function parseServiceTime(raw: string | null): string | null {
  if (!raw) return null

  const start = raw.split(/\s*(?:-|–|to)\s*/i)[0].trim()
  const m = start.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return null

  let hour = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const suffix = m[3]?.toLowerCase()

  if (suffix === 'pm' && hour < 12) hour += 12
  if (suffix === 'am' && hour === 12) hour = 0

  if (hour > 23 || min > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function parsePartySize(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.match(/\d+/)
  if (!m) return null
  const n = parseInt(m[0], 10)
  return isNaN(n) || n <= 0 ? null : n
}

export type FulfillmentType = 'DINE_IN' | 'PICKUP' | 'DELIVERY'

export function parseFulfillmentType(raw: string | null): FulfillmentType | null {
  if (!raw) return null
  const v = raw.toLowerCase()
  if (v.includes('deliver')) return 'DELIVERY'
  if (v.includes('pick') || v.includes('collect') || v.includes('takeaway')) return 'PICKUP'
  if (v.includes('dine') || v.includes('eat in') || v.includes('table')) return 'DINE_IN'
  return null
}

export interface ResolvedOrderMeta {
  serviceDate: Date | null
  serviceTime: string | null
  partySize: number | null
  allergens: string | null
  fulfillmentType: FulfillmentType | null
}

/** Pull every mapped field off a Woo order's meta_data in one pass. */
export function resolveOrderMeta(
  meta: WooMetaEntry[],
  storedMap?: unknown,
): ResolvedOrderMeta {
  const map = resolveMetaMap(storedMap)

  return {
    serviceDate: parseServiceDate(readMeta(meta, map.serviceDate)),
    serviceTime: parseServiceTime(readMeta(meta, map.serviceTime)),
    partySize: parsePartySize(readMeta(meta, map.partySize)),
    allergens: readMeta(meta, map.allergens),
    fulfillmentType: parseFulfillmentType(readMeta(meta, map.fulfillmentType)),
  }
}
