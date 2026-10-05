// Storage locations for an inventory item. A venue keeps the same item in
// several places (bar, storeroom, kitchen) with an optional count each. Pure and
// Prisma-free so the inventory API and form share one normaliser.

export interface StorageLocationInput {
  sectionId: string
  qty: number | null
  notes: string | null
}

/** Validate + de-dupe (one row per section). Unknown/blank rows are dropped. */
export function cleanStorageLocations(raw: unknown): StorageLocationInput[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: StorageLocationInput[] = []
  for (const item of raw) {
    const sectionId = typeof (item as { sectionId?: unknown })?.sectionId === 'string'
      ? (item as { sectionId: string }).sectionId
      : null
    if (!sectionId || seen.has(sectionId)) continue
    seen.add(sectionId)
    const rawQty = (item as { qty?: unknown }).qty
    const qtyNum = rawQty != null && rawQty !== '' ? Number(rawQty) : NaN
    const rawNotes = (item as { notes?: unknown }).notes
    out.push({
      sectionId,
      qty: Number.isFinite(qtyNum) ? qtyNum : null,
      notes: typeof rawNotes === 'string' && rawNotes.trim() ? rawNotes.trim() : null,
    })
  }
  return out
}

/** A one-line "where" summary: "BAR 5 · STOREROOM · KITCHEN 20". */
export function describeLocations(
  locations: { sectionName: string | null; qty: number | null }[],
): string | null {
  if (locations.length === 0) return null
  return locations
    .map((l) => `${l.sectionName ?? '?'}${l.qty != null ? ` ${l.qty}` : ''}`)
    .join(' · ')
}
