import { prisma } from '@hospo-ops/db'
import type { WorkerSession } from '@hospo-ops/types'
import { staffHasPermission } from './permissions'

// Worker gift-card issuing is gated by the SAME access-control grants an
// admin sets on the Staff page (ACCESS → PERFORMANCE → GIFT CARDS → ISSUE).
// Managers/admins may use it from the worker app too; floor STAFF need the
// explicit grant row.

export async function workerMayIssueGiftCards(session: WorkerSession | null): Promise<boolean> {
  if (!session) return false
  if (session.role === 'ADMIN' || session.role === 'MANAGER') return true

  const grant = await prisma.staffPermission.findFirst({
    where: {
      staffId: session.staffId,
      venueId: session.venueId,
      permissionKey: 'performance.giftcards.issue',
      deletedAt: null,
    },
    select: { id: true },
  })
  return !!grant
}

/**
 * Managers/admins may do everything on the phone (look up, redeem, reset a
 * card back to DRAFT for reuse). Floor staff with the ISSUE grant may look up
 * and redeem — never reset, because that re-circulates a physical number.
 *
 * A RESTRICTED manager must hold the explicit `performance.giftcards.redeem`
 * grant (same permission the admin reset route requires). ADMIN always
 * bypasses and an unrestricted MANAGER keeps the legacy full-access rule.
 */
export async function workerMayManageGiftCards(session: WorkerSession | null): Promise<boolean> {
  if (!session) return false
  if (session.role === 'ADMIN') return true
  if (session.role !== 'MANAGER') return false

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { restricted: true },
  })
  if (!staff) return false
  if (!staff.restricted) return true

  return staffHasPermission(session.staffId, session.venueId, 'performance.giftcards.redeem')
}
