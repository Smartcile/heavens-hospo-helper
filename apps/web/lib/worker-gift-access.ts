import { prisma } from '@hospo-ops/db'
import type { WorkerSession } from '@hospo-ops/types'

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
