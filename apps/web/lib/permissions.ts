import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { areaKeyOfPermissionKey, PERMISSION_TREE } from '@/lib/permissions/registry'

/**
 * Pure access decision — the single brain behind the admin UI gating and the
 * route guards, so they cannot diverge:
 *
 *   ADMIN        → always allowed (role-level bypass)
 *   STAFF        → never allowed (admin routes are not for floor staff)
 *   MANAGER      → unrestricted (`restricted: false`) keeps legacy full access
 *                  (opt-in restriction — nothing locks out on deploy)
 *   MANAGER +    → allowed only when `grants` contains the key
 *   restricted
 */
export function resolveAccess(
  args: { role: string; restricted: boolean; grants: string[] },
  key: string,
): boolean {
  if (args.role === 'ADMIN') return true
  if (args.role !== 'MANAGER') return false
  if (!args.restricted) return true
  return args.grants.includes(key)
}

/** Whether the staff member has the function grant at a venue (DB-backed). */
export async function staffHasPermission(staffId: string, venueId: string, key: string): Promise<boolean> {
  const grant = await prisma.staffPermission.findUnique({
    where: {
      staffId_venueId_permissionKey: { staffId, venueId, permissionKey: key },
    },
    select: { id: true },
  })
  return !!grant
}

/**
 * Can this session perform `key`? Resolves the effective venue from the
 * `admin-active-venue` cookie (MANAGER) — grants are per venue.
 */
export async function canAccess(session: Session | null, req: NextRequest, key: string): Promise<boolean> {
  if (!session) return false
  if (session.user.role === 'ADMIN') return true
  if (session.user.role !== 'MANAGER') return false

  const venueId = getManagerVenueId(session, req)
  if (!venueId) return false

  const staff = await prisma.staff.findUnique({
    where: { id: session.user.id },
    select: { restricted: true },
  })
  if (!staff || !staff.restricted) return true

  return staffHasPermission(session.user.id, venueId, key)
}

/** Route guard: returns a 403 NextResponse when denied, null when allowed. */
export async function guardAccess(
  session: Session | null,
  req: NextRequest,
  key: string,
): Promise<NextResponse | null> {
  const allowed = await canAccess(session, req, key)
  if (allowed) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * The AREAS this session can see at the given venue (for nav/page gating).
 * ADMIN and unrestricted MANAGER get everything; a restricted MANAGER gets
 * the distinct areas of their granted keys.
 */
export async function sessionGrantedAreas(
  session: Session | null,
  venueId: string | null,
): Promise<string[]> {
  if (!session) return []
  if (session.user.role === 'ADMIN') return PERMISSION_TREE.map((a) => a.key)
  if (session.user.role !== 'MANAGER') return PERMISSION_TREE.map((a) => a.key)

  const staff = await prisma.staff.findUnique({
    where: { id: session.user.id },
    select: { restricted: true },
  })
  if (!staff || !staff.restricted || !venueId) return PERMISSION_TREE.map((a) => a.key)

  const grants = await prisma.staffPermission.findMany({
    where: { staffId: session.user.id, venueId, deletedAt: null },
    select: { permissionKey: true },
  })
  const areas = new Set<string>()
  for (const g of grants) {
    const area = areaKeyOfPermissionKey(g.permissionKey)
    if (area) areas.add(area)
  }
  return [...areas]
}
