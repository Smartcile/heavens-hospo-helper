import type { Session } from 'next-auth'
import type { WorkerSession } from '@hospo-ops/types'
import { prisma } from '@hospo-ops/db'
import { getAccessibleVenueIds } from '@/lib/venue-scope'

/**
 * Task threads (#145 Wave B). One DB layer shared by the admin and worker
 * comment/sign-off routes so the two route sets cannot drift on task access,
 * validation or delete rules.
 *
 * Access:
 * - ADMIN: any non-deleted task in a venue they can access.
 * - MANAGER: only tasks in a venue they can access.
 * - WORKER: only tasks they can already see — assigned to them, or in their
 *   home/linked departments (the same visibility the worker task list uses).
 */

export const TASK_COMMENT_MAX_LENGTH = 500
export const TASK_COMMENT_MAX_IMAGES = 10

export interface ThreadTask {
  id: string
  venueId: string
  title: string
  departmentId: string | null
  assignedToStaffId: string | null
  isThread: boolean
  threadClosedAt: Date | null
  threadClosedById: string | null
}

export const THREAD_TASK_SELECT = {
  id: true,
  venueId: true,
  title: true,
  departmentId: true,
  assignedToStaffId: true,
  isThread: true,
  threadClosedAt: true,
  threadClosedById: true,
} as const

export interface TaskCommentView {
  id: string
  body: string
  imageUrls: string[]
  authorId: string
  authorName: string | null
  createdAt: string
  canDelete: boolean
}

const IMAGE_URL_OK = /^(\/api\/upload\/|https?:\/\/)/

/** Keep only real uploaded/remote image URLs; dedupe and cap the list. */
export function normaliseImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const url = entry.trim()
    if (!url || !IMAGE_URL_OK.test(url)) continue
    if (!out.includes(url)) out.push(url)
    if (out.length >= TASK_COMMENT_MAX_IMAGES) break
  }
  return out
}

export type CommentValidation =
  | { ok: true; body: string; imageUrls: string[] }
  | { ok: false; error: string }

/** Plain-text comment body + image URLs, capped like the availability thread. */
export function validateTaskCommentInput(value: {
  body?: unknown
  imageUrls?: unknown
}): CommentValidation {
  const body = typeof value.body === 'string' ? value.body.replace(/\r\n/g, '\n').trim() : ''
  if (!body) return { ok: false, error: 'COMMENT CANNOT BE EMPTY' }
  if (body.length > TASK_COMMENT_MAX_LENGTH) {
    return { ok: false, error: `COMMENT IS TOO LONG (MAX ${TASK_COMMENT_MAX_LENGTH})` }
  }
  return { ok: true, body, imageUrls: normaliseImageUrls(value.imageUrls) }
}

/** Does this worker see the task in their own task list? */
export async function loadWorkerThreadTask(
  session: WorkerSession,
  taskId: string,
): Promise<ThreadTask | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: THREAD_TASK_SELECT,
  })
  if (!task || task.venueId !== session.venueId) return null
  if (task.assignedToStaffId === session.staffId) return task
  // No department means the worker task list shows the whole venue.
  if (!session.departmentId) return task

  const links = await prisma.departmentLink.findMany({
    where: { fromDepartmentId: session.departmentId },
    select: { toDepartmentId: true },
  })
  const departmentIds = [session.departmentId, ...links.map((l) => l.toDepartmentId)]
  if (task.departmentId && departmentIds.includes(task.departmentId)) return task
  return null
}

/** Admin-side access: ADMIN any accessible venue, MANAGER only accessible venues. */
export async function loadAdminThreadTask(
  session: Session,
  taskId: string,
): Promise<ThreadTask | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: THREAD_TASK_SELECT,
  })
  if (!task) return null
  if (session.user.role === 'MANAGER') {
    const accessible = getAccessibleVenueIds(session)
    if (!accessible.includes(task.venueId)) return null
  }
  return task
}

export async function listTaskComments(
  taskId: string,
  opts: { viewerStaffId?: string | null; canDeleteAny: boolean },
): Promise<TaskCommentView[]> {
  const rows = await prisma.taskComment.findMany({
    where: { taskId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }],
    include: { staff: { select: { firstName: true, lastName: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    imageUrls: row.imageUrls,
    authorId: row.staffId,
    authorName: `${row.staff.firstName} ${row.staff.lastName}`.trim() || null,
    createdAt: row.createdAt.toISOString(),
    canDelete: opts.canDeleteAny || row.staffId === opts.viewerStaffId,
  }))
}

export async function addTaskComment(input: {
  taskId: string
  staffId: string
  body: string
  imageUrls: string[]
}): Promise<TaskCommentView> {
  const row = await prisma.taskComment.create({
    data: {
      taskId: input.taskId,
      staffId: input.staffId,
      body: input.body,
      imageUrls: input.imageUrls,
    },
    include: { staff: { select: { firstName: true, lastName: true } } },
  })
  return {
    id: row.id,
    body: row.body,
    imageUrls: row.imageUrls,
    authorId: row.staffId,
    authorName: `${row.staff.firstName} ${row.staff.lastName}`.trim() || null,
    createdAt: row.createdAt.toISOString(),
    canDelete: true,
  }
}

export type CommentDeleteResult = 'ok' | 'not_found' | 'forbidden'

/** Soft-delete a comment. `canDeleteAny` is managers/edit-grant; otherwise own only. */
export async function softDeleteTaskComment(input: {
  taskId: string
  commentId: string
  viewerStaffId?: string | null
  canDeleteAny: boolean
}): Promise<CommentDeleteResult> {
  const row = await prisma.taskComment.findFirst({
    where: { id: input.commentId, taskId: input.taskId, deletedAt: null },
    select: { id: true, staffId: true },
  })
  if (!row) return 'not_found'
  if (!input.canDeleteAny && row.staffId !== input.viewerStaffId) return 'forbidden'
  await prisma.taskComment.update({ where: { id: row.id }, data: { deletedAt: new Date() } })
  return 'ok'
}

export async function setThreadClosed(input: {
  taskId: string
  closed: boolean
  staffId: string
}): Promise<{ isThread: boolean; threadClosedAt: Date | null; threadClosedById: string | null }> {
  return prisma.task.update({
    where: { id: input.taskId },
    data: input.closed
      ? { threadClosedAt: new Date(), threadClosedById: input.staffId }
      : { threadClosedAt: null, threadClosedById: null },
    select: { isThread: true, threadClosedAt: true, threadClosedById: true },
  })
}

/** Sign-off: the assignee, an ADMIN/MANAGER, or a worker with `execution.tasks.edit`. */
export function workerCanSignOff(
  session: WorkerSession,
  task: Pick<ThreadTask, 'assignedToStaffId'>,
  canEditTask: boolean,
): boolean {
  if (task.assignedToStaffId === session.staffId) return true
  if (session.role === 'ADMIN' || session.role === 'MANAGER') return true
  return canEditTask
}

/** Admin-side sign-off: ADMIN/MANAGER or the edit grant (assignee checked by caller). */
export function adminCanSignOff(session: Session, hasEditGrant: boolean): boolean {
  return session.user.role === 'ADMIN' || session.user.role === 'MANAGER' || hasEditGrant
}
