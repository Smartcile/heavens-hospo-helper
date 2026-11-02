// SwiftPOS live kitchen dockets via SwiftDOSnet
// `GET /api/table-tracking/kitchen-dockets`. Pure (no DB, no network) so parsing
// and the time window can be unit-tested; lib/swiftpos.server.ts does the fetch.
//
// The feed is a bare array of open (unclosed) sales. `opened` / `addedAt` are
// UNZONED `yyyy-MM-dd HH:mm:ss` wall-clock strings, so they are passed through
// untouched and never `new Date()`-parsed (that would reinterpret them as UTC).

export interface DocketLine {
  detailId: number
  /** Wall-clock `yyyy-MM-dd HH:mm:ss` (SwiftDOSnet's local time). */
  addedAt: string
  inventoryCode: string
  description: string
  quantity: number
  value: number
  seat: number | null
  clerk: number | null
  printGroup: string
  pluText: string
  system: boolean
  /** A modifier / instruction ("No ice", "Large") — nested under the item above. */
  instruction: boolean
}

export interface KitchenDocket {
  transactionId: number
  tableNumber: number
  tableName: string
  booking: string
  covers: number
  clerk: string
  terminal: string
  /** Wall-clock `yyyy-MM-dd HH:mm:ss`. */
  opened: string
  lines: DocketLine[]
}

export interface DocketWindow {
  /** `null` when the caller asked for every line on the open sales. */
  from: string | null
  to: string
}

export const DOCKET_WINDOWS = [30, 60, 120, 0] as const
export const DEFAULT_DOCKET_WINDOW = 60

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'true' || s === '1'
}

function nullableInt(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Math.trunc(num(v))
  return n > 0 ? n : null
}

function parseLine(raw: unknown): DocketLine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const description = str(pick(r, 'description', 'Description'))
  const inventoryCode = str(pick(r, 'inventoryCode', 'InventoryCode'))
  if (!description && !inventoryCode) return null
  return {
    detailId: num(pick(r, 'detailId', 'DetailId', 'DetailID')),
    addedAt: str(pick(r, 'addedAt', 'AddedAt')),
    inventoryCode,
    description,
    quantity: num(pick(r, 'quantity', 'Quantity', 'qty', 'Qty')),
    value: num(pick(r, 'value', 'Value')),
    seat: nullableInt(pick(r, 'seat', 'Seat')),
    clerk: nullableInt(pick(r, 'clerk', 'Clerk')),
    printGroup: str(pick(r, 'printGroup', 'PrintGroup')),
    pluText: str(pick(r, 'pluText', 'PluText')),
    system: bool(pick(r, 'system', 'System')),
    instruction: bool(pick(r, 'instruction', 'Instruction')),
  }
}

/** Parse the bare array from `GET /api/table-tracking/kitchen-dockets`. */
export function parseKitchenDockets(raw: unknown): KitchenDocket[] {
  if (!Array.isArray(raw)) return []
  const out: KitchenDocket[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    const transactionId = num(pick(r, 'transactionId', 'TransactionId', 'TransactionID'))
    if (!transactionId) continue
    const rawLines = pick(r, 'lines', 'Lines')
    const lines = Array.isArray(rawLines)
      ? rawLines.flatMap((l) => {
          const line = parseLine(l)
          return line ? [line] : []
        })
      : []
    out.push({
      transactionId,
      tableNumber: num(pick(r, 'tableNumber', 'TableNumber')),
      tableName: str(pick(r, 'tableName', 'TableName')),
      booking: str(pick(r, 'booking', 'Booking')),
      covers: num(pick(r, 'covers', 'Covers')),
      clerk: str(pick(r, 'clerk', 'Clerk')),
      terminal: str(pick(r, 'terminal', 'Terminal')),
      opened: str(pick(r, 'opened', 'Opened')),
      lines,
    })
  }
  return out
}

/** Only the windows the route accepts; anything else falls back to the default. */
export function normaliseDocketMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return (DOCKET_WINDOWS as readonly number[]).includes(n) ? n : DEFAULT_DOCKET_WINDOW
}

function localStamp(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`
}

/**
 * Venue-local `from` / `to` wall-clock strings for the SwiftDOSnet query.
 * `minutes = 0` means "every line on the open sales" (`from: null`).
 */
export function docketWindow(nowMs: number, tz: string, minutes: number): DocketWindow {
  return {
    from: minutes > 0 ? localStamp(nowMs - minutes * 60_000, tz) : null,
    to: localStamp(nowMs, tz),
  }
}
