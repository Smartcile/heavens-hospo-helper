import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { prisma } from '@hospo-ops/db'
import { resolveAccess } from '@/lib/permissions'
import { resolveEffectiveVenueId } from '@/lib/venue-scope'
import { TeamClient } from '@/components/admin/TeamClient'

export default async function TeamPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const cookieVenueId = cookies().get('admin-active-venue')?.value ?? null
  const effectiveVenueId =
    resolveEffectiveVenueId(session, cookieVenueId) ?? session.user.venueId
  const activeVenueId =
    session.user.role === 'MANAGER'
      ? effectiveVenueId
      : cookieVenueId ?? session.user.defaultVenueId ?? undefined

  const staff = session.user.role === 'MANAGER'
    ? await prisma.staff.findUnique({ where: { id: session.user.id }, select: { restricted: true } })
    : null
  const grants = staff?.restricted
    ? await prisma.staffPermission.findMany({
        where: { staffId: session.user.id, venueId: effectiveVenueId, deletedAt: null },
        select: { permissionKey: true },
      })
    : []
  const canEditAvailability = resolveAccess(
    { role: session.user.role, restricted: staff?.restricted ?? false, grants: grants.map((g) => g.permissionKey) },
    'team.availability.edit',
  )

  return (
    <TeamClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
      canEditAvailability={canEditAvailability}
    />
  )
}
