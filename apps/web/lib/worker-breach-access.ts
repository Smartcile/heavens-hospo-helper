import { prisma } from '@hospo-ops/db'
import type { WorkerSession } from '@hospo-ops/types'
import { staffHasPermission } from './permissions'

// Worker-side breach-notice access. ANY worker may submit their own STAFF
// notice. Managers/admins see the venue queue and may record CLIENT notices;
// a restricted manager needs the explicit `team.breaches.review` grant before
// they can decide a notice.

export interface WorkerBreachAccess {
  allowed: boolean
  /** Whole-venue queue (ADMIN/MANAGER) vs the person's own submissions. */
  venueWide: boolean
  /** May WAIVE / DECLINE / MARK PAID and record CLIENT notices. */
  canReview: boolean
  canSubmitClient: boolean
}

const DENIED: WorkerBreachAccess = {
  allowed: false,
  venueWide: false,
  canReview: false,
  canSubmitClient: false,
}

export async function workerBreachAccess(session: WorkerSession | null): Promise<WorkerBreachAccess> {
  if (!session) return DENIED

  if (session.role === 'ADMIN') {
    return { allowed: true, venueWide: true, canReview: true, canSubmitClient: true }
  }

  if (session.role === 'MANAGER') {
    const staff = await prisma.staff.findUnique({
      where: { id: session.staffId },
      select: { restricted: true },
    })
    const canReview =
      !staff || !staff.restricted
        ? true
        : await staffHasPermission(session.staffId, session.venueId, 'team.breaches.review')
    return { allowed: true, venueWide: true, canReview, canSubmitClient: canReview }
  }

  // Any floor staff member may hand in their own notice.
  return { allowed: true, venueWide: false, canReview: false, canSubmitClient: false }
}
