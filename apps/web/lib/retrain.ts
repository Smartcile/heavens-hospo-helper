// Re-train propagation. When a task or SOP changes "significantly", we post a
// must-acknowledge notice to the relevant group. Staff confirm on /w/notices
// (GOT IT); managers see who's across it on /admin/notices. This reuses the
// existing notice + ack infrastructure rather than inventing a new surface.

import { prisma } from '@hospo-ops/db'

export async function postRetrainNotice(opts: {
  venueId: string
  departmentId: string | null
  title: string
  summary?: string | null
  createdById?: string | null
}): Promise<void> {
  const summary = opts.summary?.trim()
  const body = summary
    ? `WHAT CHANGED: ${summary}\n\nReview the update, then tap GOT IT to confirm you're across it.`
    : `"${opts.title}" was updated. Review the change, then tap GOT IT to confirm you're across it.`

  await prisma.notice.create({
    data: {
      venueId: opts.venueId,
      departmentId: opts.departmentId, // null = whole venue
      title: `RE-TRAIN: ${opts.title}`.toUpperCase().slice(0, 120),
      body,
      priority: 'IMPORTANT',
      requiresAck: true,
      pinned: true,
      startsAt: new Date(),
      createdById: opts.createdById ?? null,
    },
  })
}
