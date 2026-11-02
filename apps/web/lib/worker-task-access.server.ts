import { prisma } from '@hospo-ops/db'
import type { WorkerSession } from '@hospo-ops/types'
import {
  EMPTY_WORKER_TASK_ACCESS,
  FULL_WORKER_TASK_ACCESS,
  resolveWorkerTaskAccess,
  type WorkerTaskAccess,
} from '@/lib/worker-task-access'

export async function workerTaskAccess(session: WorkerSession | null): Promise<WorkerTaskAccess> {
  if (!session) return { ...EMPTY_WORKER_TASK_ACCESS }
  if (session.role === 'ADMIN' || session.role === 'MANAGER') return { ...FULL_WORKER_TASK_ACCESS }

  const grants = await prisma.staffPermission.findMany({
    where: { staffId: session.staffId, venueId: session.venueId, deletedAt: null },
    select: { permissionKey: true },
  })
  return resolveWorkerTaskAccess(session.role, grants.map((g) => g.permissionKey))
}
