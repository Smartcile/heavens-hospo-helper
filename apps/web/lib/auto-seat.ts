// Pure auto-seating planner: greedy first-fit-decreasing bin-packing + grid layout.
// Mirrors the server-side WooCommerce auto-seat engine so the editor's
// "GENERATE FROM PARTY SIZE" produces the same shape of result.

export interface AutoSeatProfile {
  id: string
  capacity: number
  chairCount: number
  width: number
  depth: number
  tableNumbers?: string[] | null
}

export interface AutoSeatPlacement {
  profileId: string
  assignedNumber: string | null
  x: number
  y: number
  width: number
  depth: number
  chairCount: number
}

export interface AutoSeatOptions {
  originX?: number
  originY?: number
  cols?: number
  spacingX?: number
  spacingY?: number
  /** Numbers already in use per profile (so re-generating doesn't clash). */
  usedNumbers?: Record<string, string[]>
}

function seatCapacity(p: AutoSeatProfile): number {
  return p.capacity > 0 ? p.capacity : p.chairCount
}

/**
 * Select tables to cover `partySize` and lay them out in a grid.
 * - Pass 1: largest-first exact fit.
 * - Pass 2: one smallest overfill table if any covers remain.
 * Profiles with a `tableNumbers` pool can only place while numbers remain;
 * profiles without a pool place freely with `assignedNumber: null`.
 */
export function planAutoSeat(
  partySize: number,
  profiles: AutoSeatProfile[],
  opts: AutoSeatOptions = {},
): AutoSeatPlacement[] {
  const usable = profiles.filter((p) => seatCapacity(p) > 0).sort((a, b) => seatCapacity(b) - seatCapacity(a))
  if (partySize <= 0 || usable.length === 0) return []

  const used = new Map<string, Set<string>>()
  for (const p of usable) {
    used.set(p.id, new Set((opts.usedNumbers?.[p.id] ?? []).map(String)))
  }

  // Returns { number, blocked }. blocked = has a pool but it's exhausted.
  function nextNumber(p: AutoSeatProfile): { number: string | null; blocked: boolean } {
    const pool = Array.isArray(p.tableNumbers) ? p.tableNumbers.map(String) : []
    if (pool.length === 0) return { number: null, blocked: false }
    const u = used.get(p.id)!
    for (const n of [...pool].sort((a, b) => Number(a) - Number(b))) {
      if (!u.has(n)) { u.add(n); return { number: n, blocked: false } }
    }
    return { number: null, blocked: true }
  }

  const chosen: { profileId: string; assignedNumber: string | null; width: number; depth: number; chairCount: number }[] = []
  let remaining = partySize

  // Pass 1: exact-fit, largest first
  for (const p of usable) {
    const cap = seatCapacity(p)
    while (remaining >= cap) {
      const r = nextNumber(p)
      if (r.blocked) break
      chosen.push({ profileId: p.id, assignedNumber: r.number, width: p.width, depth: p.depth, chairCount: p.chairCount })
      remaining -= cap
    }
  }

  // Pass 2: overfill with the smallest table that can still place
  if (remaining > 0) {
    for (const p of [...usable].reverse()) {
      const r = nextNumber(p)
      if (!r.blocked) {
        chosen.push({ profileId: p.id, assignedNumber: r.number, width: p.width, depth: p.depth, chairCount: p.chairCount })
        break
      }
    }
  }

  // Grid layout
  const originX = opts.originX ?? 200
  const originY = opts.originY ?? 200
  const cols = opts.cols ?? 5
  const spacingX = opts.spacingX ?? 180
  const spacingY = opts.spacingY ?? 180

  return chosen.map((c, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      profileId: c.profileId,
      assignedNumber: c.assignedNumber,
      x: originX + col * spacingX,
      y: originY + row * spacingY,
      width: c.width,
      depth: c.depth,
      chairCount: c.chairCount,
    }
  })
}
