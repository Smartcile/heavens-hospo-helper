// Pure helpers shared by the purchasing API routes. No Prisma imports so this
// can be imported from route handlers without dragging DB code into a bundle.

export const GST_RATE = 0.15

export type PurchasingSessionUser = {
  role: string
  venueId: string
  availableVenueIds?: string[]
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * A MANAGER is always bound to their own venue. An ADMIN may name any venue in
 * their accessible set (falling back to their home venue). Returns null when the
 * requested venue is not accessible.
 */
export function resolvePurchasingVenue(
  user: PurchasingSessionUser,
  requested?: string | null,
): string | null {
  if (user.role === 'MANAGER') return user.venueId
  const venueId = String(requested || user.venueId || '').trim()
  if (!venueId) return null
  const accessible = user.availableVenueIds ?? [user.venueId]
  return accessible.includes(venueId) ? venueId : null
}

export function lineTotals(line: { qty: number; unitPrice: number }): number {
  return round2((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))
}

export function invoiceTotals(lines: { qty: number; unitPrice: number }[]): {
  subtotal: number
  gst: number
  total: number
} {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 0),
  )
  const gst = round2(subtotal * GST_RATE)
  return { subtotal, gst, total: round2(subtotal + gst) }
}

export function safePdfFilename(originalName: string | undefined | null): string {
  const base = String(originalName ?? 'invoice.pdf')
    .replace(/[^a-z0-9.]+/gi, '_')
    .replace(/_+/g, '_')
  const withExt = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
  return `invoice-${crypto.randomUUID()}-${withExt}`
}
