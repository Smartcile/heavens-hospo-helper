// Room setups are FloorPlanSetup rows with presentation metadata: the room the
// layout is for, the pax it seats, the service style, and photos of the dressed
// room. The setup geometry stays the single table plan. These helpers are pure
// so the admin editor, the event builder and the worker view all format and
// sanitise the same way.

export interface RoomSetupMeta {
  name: string
  roomName?: string | null
  guestCapacity?: number | null
  setupStyle?: string | null
  imageUrls?: string[] | null
}

export interface RoomSetupInput {
  roomName: string | null
  guestCapacity: number | null
  setupStyle: string | null
  imageUrls: string[]
}

function up(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

/**
 * Human label for a room setup: `[ROOM] - 22PAX SIT DOWN`.
 *
 * The room is the important part; pax and style are optional. When no room has
 * been entered we fall back to the layout name so a plain event layout still
 * reads sensibly. The result is always uppercase, matching the app convention.
 */
export function roomSetupLabel(setup: RoomSetupMeta): string {
  const room = up(setup.roomName)
  const pax = setup.guestCapacity && setup.guestCapacity > 0 ? `${Math.round(setup.guestCapacity)}PAX` : ''
  const style = up(setup.setupStyle)
  const suffix = [pax, style].filter(Boolean).join(' ')

  if (room && suffix) return `${room} - ${suffix}`
  if (room) return room
  if (suffix) return `${up(setup.name)} - ${suffix}`
  return up(setup.name)
}

/** True when a setup has enough presentation data to show as a room card. */
export function isRoomSetup(setup: RoomSetupMeta): boolean {
  return Boolean(
    up(setup.roomName) ||
    (setup.guestCapacity && setup.guestCapacity > 0) ||
    up(setup.setupStyle) ||
    (setup.imageUrls?.length ?? 0) > 0,
  )
}

/**
 * Keep only URLs the upload pipeline produced (or absolute http(s) URLs). This
 * stops a pasted `javascript:` value from reaching an `<img src>`.
 */
export function sanitiseImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const url = raw.trim()
    if (!url) continue
    const safe = url.startsWith('/api/upload/') || url.startsWith('/uploads/') || /^https?:\/\//i.test(url)
    if (!safe || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Normalise an editor payload before it is written to `FloorPlanSetup`. */
export function normaliseRoomSetupInput(input: {
  roomName?: unknown
  guestCapacity?: unknown
  setupStyle?: unknown
  imageUrls?: unknown
}): RoomSetupInput {
  const pax = Number(input.guestCapacity)
  return {
    roomName: up(typeof input.roomName === 'string' ? input.roomName : null) || null,
    guestCapacity: Number.isFinite(pax) && pax > 0 ? Math.round(pax) : null,
    setupStyle: up(typeof input.setupStyle === 'string' ? input.setupStyle : null) || null,
    imageUrls: sanitiseImageUrls(input.imageUrls),
  }
}
