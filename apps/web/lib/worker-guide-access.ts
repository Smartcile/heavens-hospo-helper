import { prisma } from '@hospo-ops/db'
import type { WorkerSession } from '@hospo-ops/types'

// Worker-side Playbook authoring mirrors the EVENTS/GIFT CARD pattern: the same
// StaffPermission grants an admin sets on the Staff page (ACCESS → TRAINING /
// PLAYBOOK). ADMIN/MANAGER always pass; floor STAFF need an explicit grant.

const EDIT_KEYS = ['training.playbook.create', 'training.playbook.edit']
const PUBLISH_KEYS = ['training.playbook.publish']

async function hasAnyGrant(session: WorkerSession, keys: string[]): Promise<boolean> {
  const grant = await prisma.staffPermission.findFirst({
    where: {
      staffId: session.staffId,
      venueId: session.venueId,
      permissionKey: { in: keys },
      deletedAt: null,
    },
    select: { id: true },
  })
  return !!grant
}

export interface WorkerGuideAccess {
  canEdit: boolean
  canPublish: boolean
}

export async function workerGuideAccess(session: WorkerSession | null): Promise<WorkerGuideAccess> {
  if (!session) return { canEdit: false, canPublish: false }
  if (session.role === 'ADMIN' || session.role === 'MANAGER') {
    return { canEdit: true, canPublish: true }
  }
  const [canEdit, canPublish] = await Promise.all([
    hasAnyGrant(session, EDIT_KEYS),
    hasAnyGrant(session, PUBLISH_KEYS),
  ])
  return { canEdit, canPublish }
}
