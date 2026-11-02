// Pure matching rules for the SwiftPOS staff sync (SwiftDOSnet `GET /api/lookups`).
// A clerk is a SwiftPOS staff member (`ClerkTable.Clerk_Number` → Clerk_Name). A clerk
// is LINKED when a venue staff row carries that `swiftPosId`; otherwise we suggest the
// one staff member whose name tokens match exactly. No DB or network here.

export interface SwiftPosClerk {
  clerkId: string
  name: string
}

export interface SwiftPosStaffRef {
  id: string
  firstName: string
  lastName: string
  swiftPosId: string | null
}

export interface VenueStaffRow extends SwiftPosStaffRef {
  isActive: boolean
  pin: string | null
}

export type ClerkLinkStatus = 'LINKED' | 'SUGGESTED' | 'NEW'

export interface ClerkLinkRow extends SwiftPosClerk {
  status: ClerkLinkStatus
  staffId: string | null
  staffName: string | null
  suggestedStaffId: string | null
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

/** Clerks from `GET /api/lookups`, tolerant of camelCase/PascalCase and wrapper shape. */
export function parseClerks(raw: unknown): SwiftPosClerk[] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rows = pick(o, 'clerks', 'Clerks')
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const out: SwiftPosClerk[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const clerkId = str(pick(r, 'value', 'Value'))
    if (!clerkId || seen.has(clerkId)) continue
    seen.add(clerkId)
    out.push({ clerkId, name: str(pick(r, 'text', 'Text')) })
  }
  return out
}

export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(name: string): string[] {
  return normaliseName(name).split(' ').filter(Boolean).sort()
}

function sameName(a: string, b: string): boolean {
  const at = tokens(a)
  const bt = tokens(b)
  return at.length > 0 && at.length === bt.length && at.every((t, i) => t === bt[i])
}

function fullName(s: SwiftPosStaffRef): string {
  return `${s.firstName} ${s.lastName}`.trim()
}

function codeKey(code: string): string {
  return code.trim().toUpperCase()
}

/** "Jane Doe" → JANE / DOE; "DOE, Jane" → JANE / DOE; one token → JANE / ''. */
export function splitClerkName(name: string): { firstName: string; lastName: string } {
  const comma = name.indexOf(',')
  if (comma > 0) {
    const last = normaliseName(name.slice(0, comma))
    const first = normaliseName(name.slice(comma + 1))
    return { firstName: first, lastName: last }
  }
  const clean = normaliseName(name)
  if (!clean) return { firstName: '', lastName: '' }
  const parts = clean.split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/** Pin policy for a newly created clerk: the SwiftPOS clerk number, 1–4 digits. */
export function validClerkPin(value: string): boolean {
  return /^\d{1,4}$/.test(value.trim())
}

/**
 * The staff row already holding this clerk code (case-insensitive), excluding
 * `staffId` itself so re-saving the same link is not a conflict. `CREATE` passes
 * no `staffId`; `LINK` passes the target so a link to itself stays a no-op.
 */
export function clerkCodeConflict(
  staff: VenueStaffRow[],
  clerkId: string,
  staffId?: string | null,
): VenueStaffRow | null {
  const key = codeKey(clerkId)
  return (
    staff.find((s) => s.id !== staffId && !!s.swiftPosId && codeKey(s.swiftPosId) === key) ?? null
  )
}

/** Uppercase a possibly-malformed name part; non-strings are ignored. */
function namePart(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

/** CREATE name: an explicit first/last name wins, otherwise split the clerk name. */
export function resolveCreatedName(
  input: { firstName?: unknown; lastName?: unknown },
  clerkName: unknown,
): { firstName: string; lastName: string } {
  const split = splitClerkName(typeof clerkName === 'string' ? clerkName : '')
  const firstName = namePart(input.firstName) || split.firstName
  const lastName = namePart(input.lastName) || split.lastName
  return { firstName, lastName }
}

/** CREATE pin: an explicit pin wins, otherwise the clerk number is the pin. */
export function resolveClerkPin(pin: string | undefined, clerkId: string): string {
  return String(pin ?? '').trim() || clerkId.trim()
}

/**
 * The first active staff member whose stored PIN hash matches. The comparator is
 * injected so bcrypt stays in the server route and this lib stays client-safe.
 */
export async function findPinClash(
  staff: VenueStaffRow[],
  pin: string,
  compare: (plain: string, hash: string) => Promise<boolean>,
): Promise<VenueStaffRow | null> {
  for (const row of staff) {
    if (!row.isActive || !row.pin) continue
    if (await compare(pin, row.pin)) return row
  }
  return null
}

/**
 * Match each clerk to the venue staff list. An exact `swiftPosId` is authoritative.
 * Otherwise only an unlinked staff member with exactly the same name tokens is
 * suggested — ambiguous or partial names stay NEW so nobody is linked by guesswork.
 */
export function buildClerkRows(clerks: SwiftPosClerk[], staff: SwiftPosStaffRef[]): ClerkLinkRow[] {
  const byCode = new Map<string, SwiftPosStaffRef>()
  for (const s of staff) {
    if (s.swiftPosId) byCode.set(codeKey(s.swiftPosId), s)
  }
  const unlinked = staff.filter((s) => !s.swiftPosId)

  return clerks.map((clerk) => {
    const linked = byCode.get(codeKey(clerk.clerkId))
    if (linked) {
      return {
        ...clerk,
        status: 'LINKED',
        staffId: linked.id,
        staffName: fullName(linked),
        suggestedStaffId: null,
      }
    }

    const candidates = clerk.name
      ? unlinked.filter((s) => sameName(fullName(s), clerk.name))
      : []
    const suggested = candidates.length === 1 ? candidates[0] : null

    return {
      ...clerk,
      status: suggested ? 'SUGGESTED' : 'NEW',
      staffId: null,
      staffName: null,
      suggestedStaffId: suggested?.id ?? null,
    }
  })
}
