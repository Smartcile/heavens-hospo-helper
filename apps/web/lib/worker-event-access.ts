import { prisma } from '@hospo-ops/db'
import type { WorkerSession } from '@hospo-ops/types'

// Worker event management is gated by the SAME access-control grants an admin
// sets on the Staff page (ACCESS → EVENTS / BEO). Managers/admins may create
// and edit events from the worker app; floor STAFF need an explicit grant of
// either CREATE or EDIT.

const EVENT_MANAGE_KEYS = ['events.events.create', 'events.events.edit']

export async function workerMayManageEvents(session: WorkerSession | null): Promise<boolean> {
  if (!session) return false
  if (session.role === 'ADMIN' || session.role === 'MANAGER') return true

  const grant = await prisma.staffPermission.findFirst({
    where: {
      staffId: session.staffId,
      venueId: session.venueId,
      permissionKey: { in: EVENT_MANAGE_KEYS },
      deletedAt: null,
    },
    select: { id: true },
  })
  return !!grant
}
