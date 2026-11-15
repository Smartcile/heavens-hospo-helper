// ── Prisma binding for the task live hub ──────────────────────────────
// Server-only. Keeps the ~3 s revision query and a single hot-reload-safe hub
// instance. `lib/task-live.ts` stays Prisma-free for the client bundle; only the
// SSE route imports this file.
//
// Queries run ONLY while a venue has at least one subscriber — the hub stops its
// timer (and we delete the venue entry) when the last phone disconnects.
// ──────────────────────────────────────────────────────────────────────

import { prisma } from '@hospo-ops/db'
import {
  createTaskLiveHub,
  formatTaskRevision,
  hashChecklistTasks,
  type RevisionPart,
  type TaskLiveHub,
} from '@/lib/task-live'

const POLL_MS = 3_000

function updatedAtPart(agg: {
  _count: { _all: number }
  _max: { updatedAt: Date | null }
}): RevisionPart {
  return { count: agg._count._all, maxStamp: agg._max.updatedAt?.toISOString() ?? null }
}

function createdAtPart(agg: {
  _count: { _all: number }
  _max: { createdAt: Date | null }
}): RevisionPart {
  return { count: agg._count._all, maxStamp: agg._max.createdAt?.toISOString() ?? null }
}

/**
 * Cheap signature of everything that can change the worker task view for one
 * venue. Includes soft-deleted rows on purpose: a soft delete bumps `updatedAt`
 * (or drops a `ChecklistTask` row's hash), which is exactly the change we want
 * to surface.
 */
export async function computeVenueRevision(venueId: string): Promise<string> {
  const [
    task,
    completion,
    progress,
    checklist,
    department,
    section,
    checklistTaskRows,
    checklistAudience,
    departmentLink,
  ] = await Promise.all([
    prisma.task.aggregate({
      where: { venueId },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.taskCompletion.aggregate({
      where: { task: { venueId } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.taskProgress.aggregate({
      where: { task: { venueId } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.checklist.aggregate({
      where: { venueId },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.department.aggregate({
      where: { venueId },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.section.aggregate({
      where: { venueId },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    // No timestamp on ChecklistTask, so hash the whole (cheap) row set.
    prisma.checklistTask.findMany({
      where: { checklist: { venueId } },
      select: { checklistId: true, taskId: true, sortOrder: true, groupLabel: true },
    }),
    prisma.checklistAudience.aggregate({
      where: { checklist: { venueId } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.departmentLink.aggregate({
      where: { fromDepartment: { venueId } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ])

  return formatTaskRevision({
    task: updatedAtPart(task),
    completion: updatedAtPart(completion),
    progress: updatedAtPart(progress),
    checklist: updatedAtPart(checklist),
    department: updatedAtPart(department),
    section: updatedAtPart(section),
    checklistTaskHash: hashChecklistTasks(checklistTaskRows),
    checklistAudience: createdAtPart(checklistAudience),
    departmentLink: createdAtPart(departmentLink),
  })
}

declare global {
  // Same hot-reload pattern as lib/internal-cron.ts: one hub per process.
  var __hospoTaskLiveHub: TaskLiveHub | undefined
}

export function getTaskLiveHub(): TaskLiveHub {
  if (!globalThis.__hospoTaskLiveHub) {
    globalThis.__hospoTaskLiveHub = createTaskLiveHub({
      compute: computeVenueRevision,
      intervalMs: POLL_MS,
    })
  }
  return globalThis.__hospoTaskLiveHub
}
