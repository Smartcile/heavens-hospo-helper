// Pure helpers for showing where a task's linked inventory item is stored.
// Client-safe: no Prisma imports.

export interface StorageLocationView {
  notes?: string | null
  section?: {
    name?: string | null
    department?: { name?: string | null } | null
  } | null
}

export interface LinkedItemView {
  id?: string
  name?: string | null
  unit?: string | null
  storageNotes?: string | null
  deletedAt?: string | Date | null
  storageLocations?: StorageLocationView[] | null
}

/** "BAR → UNDER SINK · TOP SHELF" for one location, or null when empty. */
export function describeStorageLocation(location: StorageLocationView | null | undefined): string | null {
  if (!location) return null
  const department = location.section?.department?.name?.trim()
  const section = location.section?.name?.trim()
  const path = [department, section].filter(Boolean).join(' → ')
  const notes = location.notes?.trim()
  if (path && notes) return `${path} · ${notes}`
  return path || notes || null
}

/** All known storage locations, separated by " | ", falling back to storageNotes. */
export function describeStorageLocations(item: LinkedItemView | null | undefined): string {
  if (!item) return ''
  const locations = (item.storageLocations ?? [])
    .map(describeStorageLocation)
    .filter((value): value is string => !!value)
  if (locations.length > 0) return locations.join(' | ')
  return item.storageNotes?.trim() ?? ''
}

/** "SPRAY BOTTLE · BAR → UNDER SINK" (name plus the first known location). */
export function describeLinkedItem(item: LinkedItemView | null | undefined): string {
  if (!item) return ''
  const name = item.name?.trim()
  if (!name) return ''
  const stored = describeStorageLocations(item)
  return stored ? `${name} · ${stored}` : name
}

export function isDeletedItem(item: LinkedItemView | null | undefined): boolean {
  return !!item?.deletedAt
}
